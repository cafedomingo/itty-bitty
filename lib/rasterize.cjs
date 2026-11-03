// Turns an SVG passed in a query string into a JPEG for link previews.
// Shared by the Netlify function and the self-hosted server.
const sharp = require("sharp");

const MAX_INPUT_PIXELS = 4096 * 4096;
const TIMEOUT_SECONDS = 5;

class RasterizeError extends Error {
  status = 400;
}

// The payload is base64 (what link metadata uses) or URL-encoded SVG.
function payloadToSVG(query = "") {
  const base64 = query.replace(/=+$/, "");
  let svg;
  if (/^[A-Za-z0-9+/]+$/.test(base64)) {
    try {
      svg = atob(base64);
    } catch {
      // not base64 after all
    }
  }
  if (!svg) {
    try {
      svg = decodeURIComponent(query);
    } catch {
      throw new RasterizeError("Payload is neither base64 nor URL-encoded");
    }
  }
  if (!svg) throw new RasterizeError("Missing payload");
  if (!svg.startsWith("<svg")) svg = `<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
  return svg;
}

async function rasterize(query) {
  const svg = payloadToSVG(query);
  try {
    return await sharp(Buffer.from(svg), { limitInputPixels: MAX_INPUT_PIXELS })
      .resize(1200)
      .jpeg()
      .timeout({ seconds: TIMEOUT_SECONDS })
      .toBuffer();
  } catch (e) {
    throw new RasterizeError(`Could not rasterize SVG: ${e.message}`);
  }
}

exports.rasterize = rasterize;
exports.RasterizeError = RasterizeError;
