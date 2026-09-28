// Minimal static server for docs/ that mimics the Netlify routing in netlify.toml:
// real files (and extensionless .html pages) are served as-is, everything else gets index.html,
// and /render/* and /js/* allow cross-origin loads (renderers run in opaque-origin data: frames).
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../docs/", import.meta.url));
const port = Number(process.env.PORT) || 8080;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".mp4": "video/mp4",
};

const isFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const base = join(root, normalize(pathname));
  const file = base.startsWith(root) ? [base, base + ".html"].find(isFile) : undefined;
  const path = file ?? join(root, "index.html");
  const headers = { "content-type": types[extname(path)] ?? "application/octet-stream" };
  if (/^\/(render|js)\//.test(pathname)) headers["access-control-allow-origin"] = "*";
  res.writeHead(200, headers);
  createReadStream(path).pipe(res);
}).listen(port, () => console.log(`Serving docs/ on http://localhost:${port}`));
