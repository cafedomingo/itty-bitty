// Self-hosted server: does what Netlify does for itty.bitty (see netlify.toml).
import { existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import express from "express";
import morgan from "morgan";
import { isBlockedAgent, isMetadataBot, parseAgentList, pathToMetadata, renderMetadata } from "../lib/metadata.mjs";
import { rasterize } from "../lib/rasterize.cjs";

const PORT = Number(process.env.PORT) || 8080;
const DOCS_DIR = fileURLToPath(new URL("../docs/", import.meta.url));
const INDEX_HTML = join(DOCS_DIR, "index.html");
const CORS_PREFIXES = ["/render/", "/js/"]; // same as the [[headers]] in netlify.toml
const MAX_CONCURRENT_RASTERIZE = 4;
const blockedAgents = parseAgentList(process.env.UA_ARRAY);

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

if (process.env.REQUEST_LOG !== "silent") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}
app.use(compression());

app.use((req, res, next) => {
  if (isBlockedAgent(req.get("user-agent"), blockedAgents)) return res.status(401).end();
  if (CORS_PREFIXES.some((prefix) => req.path.startsWith(prefix))) res.set("Access-Control-Allow-Origin", "*");
  next();
});

let rasterizing = 0;
app.get("/.netlify/functions/rasterize", async (req, res) => {
  if (rasterizing >= MAX_CONCURRENT_RASTERIZE) return res.status(503).set("Retry-After", "1").end();
  rasterizing++;
  try {
    const jpeg = await rasterize(req.originalUrl.split("?")[1]);
    res.set("Cache-Control", "public, max-age=300").type("image/jpeg").send(jpeg);
  } catch (e) {
    res.status(e.status ?? 500).type("text/plain").send(e.message);
  } finally {
    rasterizing--;
  }
});

// Crawlers get the link's title, description and image as Open Graph tags.
app.use((req, res, next) => {
  if (req.method != "GET" || req.path == "/" || !req.path.endsWith("/") || !isMetadataBot(req.get("user-agent"))) return next();
  const origin = `${req.protocol}://${req.get("host")}`;
  res.type("html").send(renderMetadata(pathToMetadata(req.path), origin));
});

// Files aren't fingerprinted, so browsers must revalidate them (the ETag makes that cheap). Netlify does the same.
const setHeaders = (res) => res.set("Cache-Control", "public, max-age=0, must-revalidate");

// Like Netlify, /edit serves edit.html, even when a directory with the same name exists (/render).
app.use((req, res, next) => {
  if (req.method != "GET" || extname(req.path)) return next();
  const file = join(DOCS_DIR, normalize(req.path) + ".html");
  if (!file.startsWith(DOCS_DIR) || !existsSync(file) || !statSync(file).isFile()) return next();
  setHeaders(res);
  res.sendFile(file);
});

app.use(express.static(DOCS_DIR, { redirect: false, setHeaders }));

// Every other path is a bitty link: the viewer reads the path and fragment client-side.
app.use((req, res) => {
  setHeaders(res);
  res.sendFile(INDEX_HTML);
});

const server = app.listen(PORT, () => console.log(`itty.bitty listening on port ${PORT}`));

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections();
  });
}
