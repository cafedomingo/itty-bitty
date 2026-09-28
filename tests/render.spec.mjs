/* global LZMA -- used inside page.evaluate(), where the editor page provides it */
import { test, expect } from "@playwright/test";

const PASSWORD = "correct horse";

// Build links with the site's own library so the tests track the real encoding.
async function makeLinks(page) {
  await page.goto("/edit");
  return page.evaluate(async (password) => {
    const bitty = await import("/bitty.js");
    const html = (s) => new bitty.DataURL("data:text/html;charset=utf-8," + encodeURIComponent(s));
    const links = {};

    links.gzipHtml = "/#Test/" + (await html("<h1>gzip html</h1>").compress("gz")).href;
    links.plainText = "/#/data:text/plain;charset=utf-8," + encodeURIComponent("plain text");
    links.base64Html = "/#/data:text/html;base64," + btoa("<p>base64 html</p>");
    links.script = "/#/data:text/javascript," + encodeURIComponent('document.body.innerText = "script renderer"');
    links.bareGzip = "/#/" + (await html("<p>bare gzip</p>").compress("gz")).data;
    links.mecard = "/#/MECARD:N:Doe,Jane;EMAIL:jane@example.com;;";

    const encrypted = html("<p>encrypted</p>");
    encrypted.params.cipher = "aes-gcm";
    encrypted.params._password = password;
    links.encrypted = "/#/" + (await encrypted.compress("gz")).href;

    // Links from before kdf=pbkdf2: AES-GCM keyed with an unsalted SHA-256 of the password.
    const legacy = await html("<p>legacy encrypted</p>").compress("gz");
    const bytes = Uint8Array.from(atob(legacy.data), (c) => c.charCodeAt(0));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    const key = await crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt"]);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
    legacy.data = btoa(String.fromCharCode(...iv, ...ct));
    legacy.params.cipher = "aes-gcm";
    links.legacyEncrypted = "/#/" + legacy.href;

    // v1 links: a bare LZMA fragment
    links.lzma = await new Promise((resolve) =>
      LZMA.compress("<p>legacy lzma</p>", 9, (r) => resolve("/#/" + btoa(String.fromCharCode(...r.map((x) => x & 255)))))
    );
    return links;
  }, PASSWORD);
}

const expected = {
  gzipHtml: "gzip html",
  plainText: "plain text",
  base64Html: "base64 html",
  script: "script renderer",
  bareGzip: "bare gzip",
  mecard: "Jane Doe",
  encrypted: "encrypted",
  legacyEncrypted: "legacy encrypted",
  lzma: "legacy lzma",
};

test.describe("renders links", () => {
  let links;
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    links = await makeLinks(page);
    await page.close();
  });

  for (const [name, text] of Object.entries(expected)) {
    test(name, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("dialog", (d) => d.accept(PASSWORD));
      await page.goto(links[name]);
      await expect(page.frameLocator("#iframe").locator("body")).toContainText(text);
      expect(errors).toEqual([]);
    });
  }
});

test("wrong password shows an error", async ({ page }) => {
  const links = await makeLinks(page);
  page.on("dialog", (d) => d.accept("wrong"));
  await page.goto(links.encrypted);
  await expect(page.frameLocator("#iframe").locator(".error")).toContainText("Decryption Error");
});

test("editor makes a link that renders", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/edit");
  await page.locator("#editor .ql-editor").click();
  await page.keyboard.type("Hello itty bitty ✓ ünïcödé");
  // The editor rewrites the URL as you type; wait until it settles.
  let link;
  await expect
    .poll(async () => {
      const before = page.url();
      await page.waitForTimeout(300);
      link = page.url();
      return before == link && /#\/\?/.test(link);
    })
    .toBe(true);
  expect(errors).toEqual([]);

  const viewer = await page.context().newPage();
  await viewer.goto(link);
  await expect(viewer.frameLocator("#iframe").locator("body")).toContainText("Hello itty bitty ✓ ünïcödé");
});

test("editor never drops the password for short raw HTML", async ({ page }) => {
  await page.goto("/edit");
  await page.locator("#editor .ql-editor").click();
  await page.keyboard.type("<b>hi</b>");
  await page.locator("#doc-title").click();
  await page.locator("#md-password").fill(PASSWORD);
  await page.locator("#md-password").press("End");
  await expect.poll(() => page.url()).toContain("cipher=");
  expect(decodeURIComponent(page.url())).not.toContain("<b>hi</b>");
});
