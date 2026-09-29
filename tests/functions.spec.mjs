import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { renderMetadata, pathToMetadata } from "../lib/metadata.mjs";

const { handler: rasterize } = createRequire(import.meta.url)("../functions/rasterize.js");
const metadataFor = (path) => renderMetadata(pathToMetadata(path), "https://itty.bitty.site");

// The test runner would load the edge function as CommonJS, so run it in plain Node, which loads it as an ES module.
function runEdgeFunction(path, userAgent, uaArray = "") {
  const script = `
    globalThis.Deno = { env: { get: (k) => (k == "UA_ARRAY" ? ${JSON.stringify(uaArray)} : undefined) } };
    console.log = () => {};
    const { default: metadata } = await import("./netlify/edge-functions/metadata.js");
    const res = await metadata(new Request("https://itty.bitty.site" + ${JSON.stringify(path)}, { headers: { "user-agent": ${JSON.stringify(userAgent)} } }), {});
    process.stdout.write(JSON.stringify(res ? { status: res.status, body: await res.text() } : null));
  `;
  return JSON.parse(execFileSync(process.execPath, ["--no-warnings", "--input-type=module", "-e", script], { encoding: "utf8" }));
}

test("edge function answers crawlers, blocks UA_ARRAY and passes everyone else through", () => {
  expect(runEdgeFunction("/Hello/", "Twitterbot/1.0").body).toContain('<meta property="og:title" content="Hello"/>');
  expect(runEdgeFunction("/Hello/", "Mozilla/5.0")).toBeNull();
  expect(runEdgeFunction("/Hello/", "BadBot/1", "BadBot").status).toBe(401);
});

test("metadata escapes values taken from the path", () => {
  const title = encodeURIComponent('"><script>alert(1)</script>');
  const html = metadataFor(`/${title}/d/a"b/`);
  expect(html).not.toContain("<script>");
  expect(html).toContain('<meta property="og:title" content="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"/>');
  expect(html).toContain('content="a&quot;b"');
});

test("metadata uses the right og keys for image and video sizes", () => {
  const html = metadataFor("/Title/i/https%3A%2F%2Fexample.com%2Fa.png/iw/10/ih/20/v/https%3A%2F%2Fexample.com%2Fa.mp4/vw/30/vh/40/");
  expect(html).toContain('<meta property="og:image:width" content="10"/>');
  expect(html).toContain('<meta property="og:image:height" content="20"/>');
  expect(html).toContain('<meta property="og:video:width" content="30"/>');
  expect(html).toContain('<meta property="og:video:height" content="40"/>');
});

test("metadata skips image values that are neither URLs nor base64", () => {
  expect(metadataFor("/Title/i/not%20base64!/")).not.toContain("og:image");
});

test("rasterize turns an svg into a jpeg", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="red"/></svg>';
  const res = await rasterize({ rawQuery: btoa(svg) });
  expect(res.statusCode).toBe(200);
  expect(res.headers["content-type"]).toBe("image/jpeg");
  expect(Buffer.from(res.body, "base64").subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
});

test("rasterize returns 400 for input it can't render", async () => {
  expect((await rasterize({ rawQuery: "%E0%A4%A" })).statusCode).toBe(400);
});
