// Visual baseline for the LeiriTech foundation shell.
// Playwright CLI (NOT MCP). Run against a running server:
//   BASE_URL=http://localhost:3100 node tests/visual/baseline.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "screenshots");
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE_URL || "http://localhost:3100";
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const shots = [
  { name: "01-dashboard-desktop-light", path: "/", vp: DESKTOP, theme: "light" },
  { name: "02-dashboard-desktop-light-collapsed", path: "/", vp: DESKTOP, theme: "light", collapsed: true },
  { name: "03-dashboard-desktop-dark", path: "/", vp: DESKTOP, theme: "dark" },
  { name: "04-my-work-desktop-light", path: "/my-work", vp: DESKTOP, theme: "light" },
  { name: "05-my-work-desktop-dark", path: "/my-work", vp: DESKTOP, theme: "dark" },
  { name: "06-dashboard-mobile-light", path: "/", vp: MOBILE, theme: "light" },
  { name: "07-dashboard-mobile-dark", path: "/", vp: MOBILE, theme: "dark" },
  { name: "08-command-palette-desktop-light", path: "/", vp: DESKTOP, theme: "light", command: true },
  { name: "09-mobile-nav-open-light", path: "/", vp: MOBILE, theme: "light", mobileNav: true },
];

const browser = await chromium.launch();
let ok = 0;

for (const shot of shots) {
  const context = await browser.newContext({
    viewport: shot.vp,
    deviceScaleFactor: 2,
  });
  // Seed prefs before any script runs: theme (next-themes) + sidebar cookie + role.
  await context.addInitScript((theme) => {
    try {
      localStorage.setItem("theme", theme);
    } catch {}
  }, shot.theme);
  await context.addCookies([
    { name: "leiritech_role", value: "admin", url: BASE },
    { name: "leiritech_sidebar_collapsed", value: shot.collapsed ? "true" : "false", url: BASE },
  ]);

  const page = await context.newPage();
  await page.goto(`${BASE}${shot.path}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await page.waitForTimeout(900);

  if (shot.command) {
    await page.keyboard.press("Meta+K");
    await page.waitForTimeout(400);
  }
  if (shot.mobileNav) {
    await page.getByRole("button", { name: /menu|abrir/i }).first().click();
    await page.waitForTimeout(400);
  }

  const file = join(OUT, `${shot.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`captured ${shot.name}`);
  ok += 1;
  await context.close();
}

await browser.close();
console.log(`\nDone: ${ok}/${shots.length} screenshots -> ${OUT}`);
