import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";

globalThis.Deno ??= { env: { get: () => undefined } };
// The test runner loads this ES module through CommonJS interop, which can nest the default export.
const metadataModule = await import("../netlify/edge-functions/metadata.js");
const metadata = metadataModule.default?.default ?? metadataModule.default;
const { handler: rasterize } = createRequire(import.meta.url)("../functions/rasterize.js");

const botRequest = (path) =>
  new Request("https://itty.bitty.site" + path, { headers: { "user-agent": "Twitterbot/1.0" } });

test("metadata escapes values taken from the path", async () => {
  const title = encodeURIComponent('"><script>alert(1)</script>');
  const res = await metadata(botRequest(`/${title}/d/a"b/`), {});
  const html = await res.text();
  expect(html).not.toContain("<script>");
  expect(html).toContain('<meta property="og:title" content="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"/>');
  expect(html).toContain('content="a&quot;b"');
});

test("metadata uses the right og keys for image and video sizes", async () => {
  const res = await metadata(botRequest("/Title/i/https%3A%2F%2Fexample.com%2Fa.png/iw/10/ih/20/v/https%3A%2F%2Fexample.com%2Fa.mp4/vw/30/vh/40/"), {});
  const html = await res.text();
  expect(html).toContain('<meta property="og:image:width" content="10"/>');
  expect(html).toContain('<meta property="og:image:height" content="20"/>');
  expect(html).toContain('<meta property="og:video:width" content="30"/>');
  expect(html).toContain('<meta property="og:video:height" content="40"/>');
});

test("rasterize turns an svg into a jpeg", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="red"/></svg>';
  const res = await rasterize({ rawQuery: btoa(svg) }, {});
  expect(res.statusCode).toBe(200);
  expect(res.headers["content-type"]).toBe("image/jpeg");
  expect(Buffer.from(res.body, "base64").subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
});
