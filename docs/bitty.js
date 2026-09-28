/* global LZMA, pako */
const padForBase64 = (s, c = " ") => s.padEnd(s.length + (3 - s.length % 3) % 3, c)
const HEAD_TAGS = (prefixes) => {
  let tags = ['<base target="_top">']
  prefixes?.split(" ").forEach((p) => tags.push(p.endsWith(".css") ? `<link rel="stylesheet" href="${p}">` : `<script src="${p}"></script>`))
  return btoa(padForBase64(tags.join("\n")));
};
const HEAD_TAGS_EXTENDED = () => btoa(padForBase64(`<meta charset="utf-8"><meta name="viewport" content="width=device-width"><base target="_top"><style type="text/css">body{margin:0 auto;padding:12vmin 10vmin;max-width:35em;line-height:1.5em;font-family:-apple-system,BlinkMacSystemFont,sans-serif;word-wrap:break-word;}@media(prefers-color-scheme: dark){body{color:white;background-color:black;}}</style>`));

const dataUrlRE =
/^data:(?<mediatype>(?<type>[a-z]+)\/(?<subtype>[a-z+-]+))?(?<params>(?:;[^;,]+=[^;,]+)*)?(?:;(?<encoding>\w+64))?,(?<data>.*)$/

///^\s*data:([a-z]+\/[a-z]+(;[a-z\-]+\=[a-z\-]+)?)?(;base64)?,[a-z0-9\!\$\&\'\,\(\)\*\+\,\;\=\-\.\_\~\:\@\/\?\%\s]*\s*$/i;

// dataurl    := "data:" [ mediatype ] [ ";base64" ] "," data
// mediatype  := [ type "/" subtype ] *( ";" parameter )
// data       := *urlchar
// parameter  := attribute "=" value

// charset=US-ASCII
// encode=brotli
// cipher=aes
// render=recipe

// Base 64 characters:    A-Z a-z 0-9 + / =
// Fragment characters:   A-Z a-z 0-9 + / =
//                        ? : @ - . _ ~ ! $ & ' ( ) * , ;       and kinda (#)

let schemeMappings = {
  "r": "application/ld+json;charset=utf-8;format=gz;base64,",
  "h": "text/html;charset=utf-8;format=gz;base64,",
  "t": ","
}
/**
 * Wrapper class for data urls and operations
 */

class DataURL {
  /**
   * @constructor
   * @param {URL} url - data url
   */
  constructor(url) {
    this.initString = url;

    var colon = url.substring(0,15).indexOf(":");
    if ( colon != -1) {
      this.scheme = url.substring(0,colon);
      if (schemeMappings[this.scheme]) {
        url = `data:${schemeMappings[this.scheme]},${url}`
      }
    } else {
      if (url.charAt(0) == "?") {
        this.editable = true;
        url = url.substring(1);
      }

      this.dataPrefix = HEAD_TAGS_EXTENDED();
      // todo: gzip starts with 0x1f8b
      let encoding = url.startsWith("XQA") ? LZMA_MARKER : GZIP_MARKER;
      url = `data:text/html;charset=utf-8;format=${encoding};base64,${url}`;
    }
    
    let match = url.match(dataUrlRE);

    this.params = {};
    
    if (match) {
      let info = match.groups;
      Object.assign(this, info);  
      this.params = info.params ? JSON.parse('{"' + decodeURI(info.params?.substring(1)).replace(/"/g, '\\"').replace(/;/g, '","').replace(/=/g,'":"') + '"}') : {};
    }
    if (this.encoding) {
      this.data = this.data.replace(/=/g,"");
    } else {
      this.data = decodeURIComponent(this.data);
    }
  }

  get href() {
    let urlString = "data:";

    if (this.mediatype) urlString += this.mediatype
    if (this.params) Object.entries(this.params).forEach( e => { if (!e[0].startsWith("_")) urlString += `;${e[0]}=${e[1]}`})
    if (this.encoding) urlString += ";" + this.encoding

    // dataPrefix is stored base64-encoded; plain data urls need it decoded. Don't mutate it, since href is read more than once.
    let prefix = this.dataPrefix && !this.encoding ? atob(this.dataPrefix) : (this.dataPrefix || '');
    urlString += "," + prefix + this.data;
    return urlString;
  }

  get format() {
    return this.params.format || this.encoding;
  }

  clone = () => {
    var clone = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    clone.params = {...this.params};
    return clone;
  }
  
 decompress = async () => {
    if (!this.format && !this.cipher) {
      return;
    }

    let bytes = base64ToByteArray(this.data);

    // Decrypt if needed
    if (this.params.cipher) {
      try {
        bytes = await decryptData(this.params.cipher, bytes, this.params.password, this.params.kdf);
      } catch (e) {
        this.error = "Decryption Error - Incorrect password?"
        return;      
      }
    }

    // Decompress if needed
    if (this.format && (this.format != "base64")) {
      this.rawData = await decompressData(bytes, this.format)

      try {
        this.data =  dataToBase64(this.rawData);
      } catch (e) {
        console.log("dataToBase64FR used:", e);
        this.data = await dataToBase64FR(this.rawData);
      }

      delete this.params.format
      this.encoding = BASE64_MARKER
    }

    return this;
  }

  compress = async (format = GZIP_MARKER) => {
    this.rawData = this.encoding ? await base64ToByteArray(this.data) : stringToByteArray(this.data);
    let compressedData = await compressData(this.rawData, format);

    if (this.params.cipher && this.params._password) {
      this.params.kdf = KDF_PBKDF2;
      compressedData = await encryptData(this.params.cipher, this.params._password, compressedData);
    }

    var base64String
    try {
      base64String = dataToBase64(compressedData);
    } catch (e) {
      console.log("dataToBase64FR used:", e);
      base64String = await dataToBase64FR(compressedData);
    }

    // base64String = base64String.replace(/=+$/, "");
    this.data = base64String;
    this.params.format = format;

    // await testCompression(rawData)
    return this;
  }

  parseDom = async () => {
    const parseableTypes = ["text/html", "text/xml", "application/xml", "application/xhtml+xml", "image/svg+xml"];
    if (!parseableTypes.includes(this.mediatype)) return;
    try {
      const text = this.encoding ? byteArrayToString(base64ToByteArray(this.data)) : this.data;
      return new DOMParser().parseFromString(text, this.mediatype);
    } catch (e) {
      console.debug("Could not parse content", e);
    }
  }
}

function parseBittyURL(url) {
  if (typeof url === 'string') url = new URL(url);
  let fragment = url.hash;
  let path = url.pathname

  var slashIndex = fragment.indexOf("/");
  var hashTitle = decodePrettyComponent(fragment.substring(1, slashIndex));
  var hashData = fragment.substring(slashIndex + 1);
  return {path, hashTitle, hashData}
}

async function compressData(data, encoding = GZIP_MARKER, callback) {
  console.debug("Compressing with", encoding)
  if (encoding == GZIP_MARKER) {
    return compressDataGzip(data);
  } else if (encoding == BROT_MARKER) {
    // Brotli is decode-only for now
  } else if (encoding == LZMA_MARKER) {
    return new Promise(function(resolve, reject) {
      LZMA.compress(data, 9, function(result, error) {
        if (error) reject(error);
        resolve(result);
      });
    });
  } 
}

function stringToByteArray(string) {
  return new TextEncoder().encode(string);
}

function byteArrayToString(bytes) {
  return new TextDecoder().decode(bytes);
}

async function decompressDataGzip(data) {
  if (typeof DecompressionStream !== 'undefined') {
    let blob = new Blob([data], {type:"application/gzip"})
    let stream = blob.stream().pipeThrough(new DecompressionStream("deflate"));
    let response = await new Response (stream).arrayBuffer().catch(e => {console.error("DecompressionStream error", e)})

    if (!response) {
      console.debug("Trying GZIP")
      stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
      response = await new Response (stream).arrayBuffer().catch(e => {console.error("DecompressionStream error", e)})
    }

    if (response) return response

  }

  return import("/js/gzip/pako.min.js").then((module) => {
    return pako.inflate(data);
  });
}

async function compressDataGzip(data) {
  if (typeof CompressionStream !== 'undefined') {
    let blob = new Blob([data])
    const stream = blob.stream().pipeThrough(new CompressionStream("deflate"));
    let response = await new Response (stream).arrayBuffer().catch(e => {console.error("CompressionStream error", e)})
    if (response) return response
  }

  return import("/js/gzip/pako.min.js").then((module) => {
    return pako.deflate(data, {level:"9"});
  });
}

async function decompressData(data, encoding, callback) {
  if (encoding == GZIP_MARKER) {
    return decompressDataGzip(data)
  } else if (encoding == BROT_MARKER) {
    return import("/js/brotli/decode.js").then((module) => {
      return module.BrotliDecode(data);
    });
  } else if (encoding == LZMA_MARKER || encoding == LZMA64_MARKER) {
    return new Promise(function(resolve, reject) {
      loadScript("/js/lzma/lzma_worker-min.js").then((s) => {
        LZMA.decompress(data, (result, error) => {
          if (error) reject(error);
          resolve(stringToByteArray(result));
        });
      })
    });
  }
}


async function encryptData(cipher, pass, data) {
  return subtleEncryptData(data, pass);
}

async function decryptData(cipher, data, password, kdf) {
  console.log("🔐 Decrypting data:", cipher);
  let pass = password || prompt("This page is encrypted. What's the passcode?");
  if (!pass) return data;
  if (kdf == KDF_PBKDF2) return subtleDecryptData(data, pass);
  return legacyDecryptData(data, pass);
}

/**
 * Concatenate buffers
 * @param {...Uint8Array} buffers
 * @returns {ArrayBuffer}
 */
function concatBuffers(...buffers) {
  const result = new Uint8Array(buffers.reduce((n, b) => n + b.byteLength, 0));
  let offset = 0;
  for (const b of buffers) {
    result.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return result.buffer;
}

// Links marked kdf=pbkdf2 derive the AES key with PBKDF2 over a random salt.
// Changing the iteration count would break existing links, so a new kdf name is needed for that.
const KDF_PBKDF2 = "pbkdf2";
const PBKDF2_ITERATIONS = 600000; // OWASP recommendation for PBKDF2-HMAC-SHA256
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

async function deriveKey(password, salt, usage) {
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    [usage]
  );
}

/**
 * Encrypts data with AES-GCM using a PBKDF2-derived key.
 * @param   {Uint8Array} data - Data to be encrypted.
 * @param   {String} password - Password to use to encrypt plaintext.
 * @returns {ArrayBuffer} salt (16 bytes) + iv (12 bytes) + ciphertext.
 */
async function subtleEncryptData(data, password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt, "encrypt");
  const ctBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return concatBuffers(salt, iv, ctBuffer);
}

/**
 * Decrypts data encrypted with subtleEncryptData().
 * @param   {Uint8Array} data - salt + iv + ciphertext.
 * @param   {String} password - Password used to encrypt.
 * @returns {Uint8Array} Decrypted data.
 */
async function subtleDecryptData(data, password) {
  const salt = data.slice(0, SALT_LENGTH);
  const iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const key = await deriveKey(password, salt, "decrypt");
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data.slice(SALT_LENGTH + IV_LENGTH));
  return new Uint8Array(plainBuffer);
}

/**
 * Decrypts links made before kdf=pbkdf2 existed (key = unsalted SHA-256 of the password).
 * Kept only so old links still open; new links never use it.
 */
async function legacyDecryptData(data, password) {
  const pwHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  const iv = data.slice(0, IV_LENGTH);
  const key = await crypto.subtle.importKey("raw", pwHash, "AES-GCM", false, ["decrypt"]);
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data.slice(IV_LENGTH));
  return new Uint8Array(plainBuffer);
}

function infoForDataURL(url) {
  return new DataURL(url);
}

var BASE64_MARKER = 'base64';
var LZMA64_MARKER = 'bxze64';

var BASE_MARKER = 'bs';
var LZMA_MARKER = 'xz';
var GZIP_MARKER = 'gz';
var BROT_MARKER = 'br';

function base64ToByteArray(base64) {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

function loadScript(src, type, callback) {
  let script = document.getElementById(src);

  if (script) {
    return Promise.resolve(script);
  }
  let promise = new Promise((resolve, reject) => {
    console.log("📜 Loading Script:", src)

    script = document.createElement("script")
    if (type && type.length) script.type = type;
    script.onload = () => resolve(script);
    script.src = script.id = src;
    document.head.appendChild(script);
  })
  return callback ? promise.then(callback) : promise;
}

async function hashString(string, base = 36) {
  const arrayBuffer = await(new TextEncoder().encode(string))
  const hashAsArrayBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const uint8ViewOfHash = new Uint8Array(hashAsArrayBuffer);
  const hashAsHex = Array.from(uint8ViewOfHash).map(b => b.toString(16).padStart(2, '0')).join('');
  if (base == 16) return hashAsHex;

  if (base == 36) {
    const guid = BigInt("0x" + hashAsHex);
    const asBase36 = guid.toString(36).toLowerCase();
    return asBase36;
  }

  const hashAsBase64 = btoa(String.fromCharCode.apply(null, uint8ViewOfHash));
  return hashAsBase64.replace(/=/g,'').replace(/[+/]/g, "-").toLowerCase();
}


function dataToBase64(data) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(data))); 
}

function dataToBase64FR(data) {
  return new Promise((resolve, reject) => {
    if (!data || !data.byteLength) return resolve("");
    var fr = new FileReader();
    fr.onload = () => { resolve(fr.result.split(',')[1]); }
    fr.onerror = reject;
    fr.readAsDataURL(new Blob([data], {encoding:"UTF-8",type:"text/html;charset=UTF-8"}));
  })
}

function dataToString(data, callback) {
  return newDataURLtoBlob(data).then(blob => {
    var reader = new FileReader();
    reader.onload = function(e) { callback(reader.result) }
    reader.readAsText(blob);
  })
}

function newDataURLtoBlob(dataURL) {
  return fetch(dataURL).then(r => r.blob())
}

function copyToClipboard(text) {
  var dummy = document.createElement("input");
  document.body.appendChild(dummy);
  dummy.value = text;
  dummy.select();
  document.execCommand("copy");
  document.body.removeChild(dummy);

  document.body.classList.add("copied");
  setTimeout(function() {
    document.body.classList.remove("copied");
  }, 2000);
}

// Encode or decode space/dash combinations to avoid %20 in urls. Lossy.

function encodePrettyComponent(s) {
  let replacements = {' - ': '---', '-': '--', ' ' : '-'}
  let re = new RegExp('(' + Object.keys(replacements).join('|') + ')', 'g');
  return encodeURIComponent(s.replace(re, e => replacements[e] ?? '-'))
    // .replace(/\%2C/g, ",")
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16));
}

function decodePrettyComponent(s) {
  let replacements = {'---': ' - ', '--': '-','-' : ' '}
  return decodeURIComponent(s.replace(/-+/g, e => replacements[e] ?? '-'))
}

function pathToMetadata(path) {
  let components = path.substring(1).split("/");
  let info = {title: decodePrettyComponent(components.shift())}
  for (let i = 0; i < components.length; i+=2) {
    let key = components[i];
    let value = components[i+1];
    if (!value) continue;
    if (key == "d") { value = decodePrettyComponent(value); }
    else if (value.includes("%")) { value = decodeURIComponent(value); }
    if (key.length && value.length) info[key] = value;
  }
  return info;
}

function metadataToPath(data) {
  if (!data || !data.title) return "/";
  let path = ["/" + encodePrettyComponent(data.title)];
  if (data.description) path.push("d/" + encodePrettyComponent(data.description.substring(0,200).split(". ").shift()));
  if (data.favicon) path.push("f/" + encodeURIComponent(data.favicon));
  if (data.image) path.push("i/" + encodeURIComponent(btoa(data.image).replace(/=/g, "")));
  return path.join('/') + "/";
}

// window.el = function (tagName, attrs, ...children) {
//   let l = document.createElement(tagName);
//   Object.entries(attrs).forEach(([k,v]) => l[k] = v);
//   children.forEach((c) => l.appendChild(typeof c == "string" ? document.createTextNode(c) : c));
//   return l;
// }

const el = (selector, ...args) => {
  var attrs = (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) && !(args[0] instanceof HTMLElement)) ? args.shift() : {};

  let classes = selector.split(".");
  if (classes.length > 0) selector = classes.shift();
  if (classes.length) attrs.className = classes.join(" ")

  let id = selector.split("#");
  if (id.length > 0) selector = id.shift();
  if (id.length) attrs.id = id[0];

  var node = document.createElement(selector.length > 0 ? selector : "div");
  for (let prop in attrs) {
    if (Object.hasOwn(attrs, prop) && attrs[prop] != undefined) {
      if (prop.indexOf("data-") == 0) {
        let dataProp = prop.substring(5).replace(/-([a-z])/g, function(g) { return g[1].toUpperCase(); });
        node.dataset[dataProp] = attrs[prop];
      } else {
        node[prop] = attrs[prop];
      }
    }
  }

  const append = (child) => {
    if (Array.isArray(child)) return child.forEach(append);
    if (typeof child == "string") child = document.createTextNode(child);
    if (child) node.appendChild(child);
  };
  args.forEach(append);

  return node;
};

export {
  DataURL,
  infoForDataURL,
  dataToString,
  hashString,
  encodePrettyComponent,
  decodePrettyComponent,
  metadataToPath,
  pathToMetadata,
  parseBittyURL,
  el,
  loadScript,
  copyToClipboard,
  BASE64_MARKER,
  LZMA64_MARKER,
  BASE_MARKER,
  LZMA_MARKER,
  GZIP_MARKER,
  BROT_MARKER,
  HEAD_TAGS,
  HEAD_TAGS_EXTENDED,
};
