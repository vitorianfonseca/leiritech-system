import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Global setup for the E2E suite (issue #54).
 *
 * The LeiriTech frontend has no standalone mode: every page resolves its
 * session against the FastAPI backend (`GET /auth/me` via src/lib/session.ts),
 * so a Playwright run without a backend would not "fail" — it would redirect
 * everything to /login and quietly pass a suite that tested nothing. This setup
 * therefore refuses to start unless the backend answers, and it stamps a known
 * password on the seeded dev identities so the specs can drive the real login
 * form.
 */

const BACKEND =
  process.env.E2E_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const VENV_PYTHON = path.join(REPO_ROOT, "backend", ".venv", "bin", "python");
const BOOTSTRAP = path.join(
  process.cwd(),
  "tests",
  "e2e",
  "scripts",
  "bootstrap_e2e_users.py",
);

async function assertBackendUp(): Promise<void> {
  const url = `${BACKEND.replace(/\/+$/, "")}/openapi.json`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new Error(
      `E2E backend is not reachable at ${BACKEND}. Start the FastAPI app ` +
        `(backend/.venv/bin/uvicorn app.main:app) before running the suite. ` +
        `Cause: ${(err as Error).message}`,
    );
  }
  if (!res.ok) {
    throw new Error(`E2E backend at ${BACKEND} answered ${res.status} for ${url}.`);
  }
}

function bootstrapUsers(): void {
  if (!fs.existsSync(VENV_PYTHON)) {
    throw new Error(
      `Backend virtualenv not found at ${VENV_PYTHON}. The E2E suite needs it to ` +
        `stamp a known password on the seeded dev identities.`,
    );
  }
  const out = execFileSync(VENV_PYTHON, [BOOTSTRAP], {
    cwd: path.join(REPO_ROOT, "backend"),
    encoding: "utf8",
    env: { ...process.env },
  });
  const parsed = JSON.parse(out.trim().split("\n").at(-1) ?? "{}") as {
    users?: Record<string, unknown>;
  };
  const roles = Object.keys(parsed.users ?? {});
  if (roles.length !== 3) {
    throw new Error(`Expected 3 E2E identities, bootstrap resolved: ${roles.join(", ")}`);
  }
}

export default async function globalSetup(): Promise<void> {
  await assertBackendUp();
  bootstrapUsers();
}
