import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit / component test runner (issue #53).
 *
 * Deliberately separate from Playwright: `include` only picks up
 * `tests/unit/**`, and `tests/e2e` + `tests/visual` are excluded so the two
 * runners never collide (Playwright owns `playwright.config.ts` / `test:e2e`).
 *
 * No `@vitejs/plugin-react` — Vite's built-in esbuild transform handles the
 * automatic JSX runtime, and the plugin's Babel peer range conflicts with the
 * versions this project already pins.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the `@/*` -> `./src/*` mapping in tsconfig.json.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    exclude: [
      "node_modules/**",
      ".next/**",
      "tests/e2e/**",
      "tests/visual/**",
      "test-results/**",
    ],
    css: false,
    restoreMocks: true,
    // next-intl ships ESM-only; Next's bundling deopt means Vitest has to
    // inline it rather than externalize (next-intl testing docs).
    server: { deps: { inline: ["next-intl"] } },
  },
});
