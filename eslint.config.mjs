import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "docs/js/**", // vendored libraries
      "docs/v1/**", // legacy renderer kept for old links
      "**/*.min.js",
      "docs/extractrecipe.js", // bookmarklet source
      "docs/render/bookmarklet.url.js", // bookmarklet source
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  js.configs.recommended,
  {
    rules: {
      // The legacy code has many unused helpers and params; report them without failing CI.
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["docs/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.browser },
    },
  },
  {
    // Renderers run inside render.js, which provides these globals.
    files: ["docs/render/**/*.js"],
    languageOptions: {
      globals: { el: "readonly", params: "readonly", loadScript: "readonly", loadSyle: "readonly" },
    },
  },
  {
    files: ["netlify/edge-functions/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.worker, Deno: "readonly" },
    },
  },
  {
    files: ["functions/**/*.js", "build-v2.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
  {
    files: ["tests/**/*.{js,mjs}", "*.config.{js,mjs}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
