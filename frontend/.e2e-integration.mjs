// End-to-end integration proof: real login → real backend data.
// Usage: node .e2e-integration.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3200";
const BACKEND = process.env.E2E_BACKEND ?? "localhost:8010";
const EMAIL = process.env.E2E_EMAIL ?? "intglogin@leiritech.pt";
const PASSWORD = process.env.E2E_PASSWORD ?? "leiritech-int-2026";
const OUT = "/private/tmp/claude-501/-Users-vitoriafonseca-leiritech-system/b2fda71f-8dd0-4145-9e4c-637f6c241357/scratchpad/shots";
mkdirSync(OUT, { recursive: true });

const backendHits = [];
const consoleErrors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on("request", (r) => {
  const u = r.url();
  if (u.includes(BACKEND)) backendHits.push(`${r.method()} ${u.replace(/^https?:\/\/[^/]+/, "")}`);
});
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`  screenshot: ${OUT}/${name}.png`);
}

try {
  console.log(`[1] login at ${BASE}/login`);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  console.log(`  landed on: ${page.url()}`);
  await shot("01-dashboard");

  for (const [name, path] of [
    ["02-empresas", "/crm/companies"],
    ["03-projetos", "/projects"],
    ["04-tarefas", "/tasks"],
  ]) {
    console.log(`[+] ${path}`);
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await shot(name);
  }
} catch (err) {
  console.error("E2E ERROR:", err.message);
  await shot("99-error");
} finally {
  console.log("\n=== backend (:%s) requests observed ===", BACKEND);
  const uniq = [...new Set(backendHits)];
  console.log(uniq.length ? uniq.join("\n") : "  (none — NOT hitting real backend!)");
  console.log("\n=== console errors ===");
  console.log(consoleErrors.length ? consoleErrors.slice(0, 20).join("\n") : "  (none)");
  await browser.close();
}
