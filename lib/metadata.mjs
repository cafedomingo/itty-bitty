// Link-preview metadata for crawlers, shared by the Netlify edge function and the self-hosted server.
// Crawlers never see the URL fragment, so links carry their title, description and image in the path:
//   /Title/d/Description/i/<image>/f/<favicon>/#<content>

export const METADATA_BOTS = ["Twitterbot", "curl", "facebookexternalhit", "Slackbot-LinkExpanding", "Discordbot", "snapchat", "Googlebot"];

export function isMetadataBot(userAgent = "") {
  return METADATA_BOTS.some((bot) => userAgent.includes(bot));
}

export function parseAgentList(value = "") {
  return value.split(",").map((ua) => ua.trim()).filter(Boolean);
}

export function isBlockedAgent(userAgent = "", blocked = []) {
  return blocked.some((ua) => userAgent.includes(ua));
}

function safeDecodeURIComponent(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function decodePrettyComponent(s) {
  const replacements = { "---": " - ", "--": "-", "-": " " };
  return safeDecodeURIComponent(s.replace(/-+/g, (e) => replacements[e] ?? "-"));
}

// Returns the decoded string, or undefined if value isn't valid base64.
export function decodeBase64(value) {
  const data = value.replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]*$/.test(data)) return undefined;
  try {
    return atob(data);
  } catch {
    return undefined;
  }
}

// Image, video and favicon values are either a URL or base64 (of a URL or of inline SVG).
function decodeURL(value) {
  return value.startsWith("http") ? value : decodeBase64(value);
}

export function pathToMetadata(path) {
  const components = path.substring(1).split("/");
  const info = { title: decodePrettyComponent(components.shift()) };
  for (let i = 0; i < components.length; i += 2) {
    const key = components[i];
    let value = components[i + 1];
    if (!value) continue;
    if (key == "d") value = decodePrettyComponent(value);
    else if (value.includes("%")) value = safeDecodeURIComponent(value);
    if (key.length && value.length) info[key] = value;
  }
  return info;
}

// Every value comes from the request path, so it must be escaped before going into HTML.
export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const mProp = (prop, content) => `<meta property="${prop}" content="${escapeHTML(content)}"/>`;
const mName = (name, content) => `<meta name="${name}" content="${escapeHTML(content)}"/>`;

/**
 * @param {object} info - from pathToMetadata()
 * @param {string} origin - e.g. "https://itty.bitty.site", used to make the rasterized image URL absolute
 * @returns {string} HTML with the page's title and Open Graph tags
 */
export function renderMetadata(info, origin) {
  const content = ['<meta charset="UTF-8">'];
  if (info.title) content.push(`<title>${escapeHTML(info.title)}</title>`, mProp("og:title", info.title));
  if (info.s) content.push(mProp("og:site_name", info.s));
  if (info.t) content.push(mProp("og:type", info.t));
  if (info.d) content.push(mProp("og:description", info.d), mName("description", info.d));
  if (info.c) content.push(mName("theme-color", "#" + info.c));

  const image = info.i && decodeURL(info.i);
  if (image) {
    // Inline SVG is rasterized on request; pass it along still base64-encoded.
    const imageURL = image.startsWith("http") ? image : `${origin}/.netlify/functions/rasterize?${info.i}`;
    content.push(mProp("og:image", imageURL));
    if (info.iw) content.push(mProp("og:image:width", info.iw));
    if (info.ih) content.push(mProp("og:image:height", info.ih));
    content.push(mName("twitter:card", "summary_large_image"));
  }

  const video = info.v && decodeURL(info.v);
  if (video) {
    content.push(mProp("og:video", video));
    if (info.vw) content.push(mProp("og:video:width", info.vw));
    if (info.vh) content.push(mProp("og:video:height", info.vh));
  }

  if (info.f) {
    if (info.f.length > 9) {
      const favicon = decodeURL(info.f);
      if (favicon) content.push(`<link rel="icon" type="image/png" href="${escapeHTML(favicon)}">`);
    } else {
      // Short values are an emoji; use Google's Noto emoji image for it.
      const codepoints = Array.from(info.f).map((c) => c.codePointAt(0).toString(16));
      content.push(`<link rel="icon" type="image/png" href="https://fonts.gstatic.com/s/e/notoemoji/14.0/${codepoints.join("_")}/128.png">`);
    }
  }
  return content.join("\n");
}
