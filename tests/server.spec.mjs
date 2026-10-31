import { test, expect } from "@playwright/test";

const bot = { "user-agent": "Twitterbot/1.0" };
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>';

const jpegWidth = (buffer) => {
  // Walk JPEG segments to the start-of-frame marker, which holds the image size.
  for (let i = 2; i < buffer.length; ) {
    const marker = buffer.readUInt16BE(i);
    if (marker >= 0xffc0 && marker <= 0xffc3) return buffer.readUInt16BE(i + 7);
    i += 2 + buffer.readUInt16BE(i + 2);
  }
};

test("serves pages the way Netlify does", async ({ request }) => {
  for (const [path, marker] of [["/", "index.js"], ["/edit", "edit.js"], ["/render", "render.js"], ["/Some-Title/", "index.js"]]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(await res.text(), path).toContain(marker);
  }
});

test("sets CORS only where netlify.toml does", async ({ request }) => {
  expect((await request.get("/render/contact.js")).headers()["access-control-allow-origin"]).toBe("*");
  expect((await request.get("/js/nosleep.js")).headers()["access-control-allow-origin"]).toBe("*");
  expect((await request.get("/index.js")).headers()["access-control-allow-origin"]).toBeUndefined();
});

test("makes browsers revalidate files", async ({ request }) => {
  for (const path of ["/index.js", "/render/contact.js", "/edit"]) {
    expect((await request.get(path)).headers()["cache-control"], path).toBe("public, max-age=0, must-revalidate");
  }
});

test("blocks user agents in UA_ARRAY", async ({ request }) => {
  expect((await request.get("/", { headers: { "user-agent": "BlockedBot/2" } })).status()).toBe(401);
});

test("escapes crawler metadata", async ({ request }) => {
  const res = await request.get(`/${encodeURIComponent("<script>alert(1)</script>")}/`, { headers: bot });
  const html = await res.text();
  expect(html).not.toContain("<script>");
  expect(html).toContain("<title>&lt;script&gt;alert(1)&lt;/script&gt;</title>");
});

test("inline SVG preview images point at a working rasterize URL", async ({ request }) => {
  const res = await request.get(`/Title/i/${encodeURIComponent(btoa(svg).replace(/=/g, ""))}/`, { headers: bot });
  const imageURL = (await res.text()).match(/property="og:image" content="([^"]+)"/)[1];
  expect(imageURL).toMatch(/^http:\/\/localhost:\d+\/\.netlify\/functions\/rasterize\?/);

  const image = await request.get(imageURL.replace(/&amp;/g, "&"));
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/jpeg");
  expect(jpegWidth(await image.body())).toBe(1200);
});

test("rasterize accepts URL-encoded SVG", async ({ request }) => {
  const res = await request.get(`/.netlify/functions/rasterize?${encodeURIComponent(svg)}`);
  expect(res.status()).toBe(200);
  expect(jpegWidth(await res.body())).toBe(1200);
});

test("rasterize rejects bad and oversized input with 400", async ({ request }) => {
  expect((await request.get("/.netlify/functions/rasterize?%E0%A4%A")).status()).toBe(400);
  expect((await request.get("/.netlify/functions/rasterize")).status()).toBe(400);
  const huge = '<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000"/>';
  expect((await request.get(`/.netlify/functions/rasterize?${btoa(huge)}`)).status()).toBe(400);
});
