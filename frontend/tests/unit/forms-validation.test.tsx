import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  acceptInviteSchema,
  loginSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth-schemas";
import { zodResolver } from "@/lib/form/zod-resolver";
import { ApiError } from "@/lib/api/types";
import { LoginForm } from "@/components/auth/login-form";
import { renderWithProviders, testMessages } from "../utils/render";

/* ------------------------------------------------------------------ *
 * Mocks — the form talks to the auth client, the router and the cookie
 * helper; all three are boundaries, not behaviour under test.
 * ------------------------------------------------------------------ */

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  persistPref: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  authApi: {
    login: mocks.login,
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    getInvite: vi.fn(),
    acceptInvite: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/client-prefs", () => ({ persistPref: mocks.persistPref }));

/** Resolves a validation key exactly as the form does (`t('validation.x')`). */
const v = (key: string) =>
  testMessages.auth.validation[key as keyof typeof testMessages.auth.validation];

beforeEach(() => {
  mocks.login.mockReset();
  mocks.push.mockReset();
  mocks.refresh.mockReset();
  mocks.persistPref.mockReset();
});

/* ------------------------------------------------------------------ *
 * Schemas
 * ------------------------------------------------------------------ */

describe("auth schemas", () => {
  const t = (key: string) => v(key);

  it("requires an email and rejects a malformed one", () => {
    const schema = loginSchema(t);

    const empty = schema.safeParse({ email: "   ", password: "segredo" });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0]?.message).toBe(v("emailRequired"));

    const malformed = schema.safeParse({ email: "nome@", password: "segredo" });
    expect(malformed.success).toBe(false);
    expect(malformed.error?.issues[0]?.message).toBe(v("emailInvalid"));
  });

  it("requires a password and trims the email on success", () => {
    const schema = loginSchema(t);

    const noPassword = schema.safeParse({ email: "ana@leiritech.pt", password: "" });
    expect(noPassword.success).toBe(false);
    expect(noPassword.error?.issues[0]?.message).toBe(v("passwordRequired"));

    const ok = schema.safeParse({ email: "  ana@leiritech.pt  ", password: "x" });
    expect(ok.success).toBe(true);
    expect(ok.data?.email).toBe("ana@leiritech.pt");
  });

  it("enforces the 8-character password policy on reset", () => {
    const result = resetPasswordSchema(t).safeParse({
      password: "curta1",
      confirmPassword: "curta1",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain(v("passwordTooShort"));
  });

  it("reports a password mismatch on the confirmation field, not the password", () => {
    const result = resetPasswordSchema(t).safeParse({
      password: "palavra-passe-1",
      confirmPassword: "palavra-passe-2",
    });
    expect(result.success).toBe(false);
    const issue = result.error?.issues[0];
    expect(issue?.path).toEqual(["confirmPassword"]);
    expect(issue?.message).toBe(v("passwordsMustMatch"));
  });

  it("requires a name of at least two characters on invite acceptance", () => {
    const result = acceptInviteSchema(t).safeParse({
      name: "A",
      password: "palavra-passe-1",
      confirmPassword: "palavra-passe-1",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(v("nameRequired"));
  });
});

/* ------------------------------------------------------------------ *
 * zod <-> react-hook-form resolver
 * ------------------------------------------------------------------ */

describe("zodResolver", () => {
  const resolver = zodResolver(loginSchema(v));
  const noop = { criteriaMode: undefined } as never;

  it("returns parsed values and no errors when the input is valid", async () => {
    const result = await resolver(
      { email: "ana@leiritech.pt", password: "segredo" },
      undefined,
      noop,
    );
    expect(result.errors).toEqual({});
    expect(result.values).toEqual({ email: "ana@leiritech.pt", password: "segredo" });
  });

  it("maps each issue to its dotted field path and drops the values", async () => {
    const result = await resolver({ email: "", password: "" }, undefined, noop);
    expect(result.values).toEqual({});
    expect(result.errors.email?.message).toBe(v("emailRequired"));
    expect(result.errors.password?.message).toBe(v("passwordRequired"));
  });

  it("keeps only the first issue per field (RHF shows one message)", async () => {
    // "nome@" fails `.email()` only; an empty string fails `.min(1)` first —
    // either way exactly one message must survive per path.
    const result = await resolver({ email: "nome@", password: "" }, undefined, noop);
    expect(result.errors.email?.message).toBe(v("emailInvalid"));
    expect(Object.keys(result.errors)).toEqual(["email", "password"]);
  });
});

/* ------------------------------------------------------------------ *
 * LoginForm — client-side validation, submission, server errors
 * ------------------------------------------------------------------ */

describe("<LoginForm />", () => {
  it("blocks submission and shows localized field errors when empty", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Entrar" }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((a) => a.textContent)).toEqual([
      v("emailRequired"),
      v("passwordRequired"),
    ]);
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it("wires aria-invalid / aria-describedby to the error message", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "nao-e-email");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    const email = await screen.findByLabelText("Email");
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    expect(email).toHaveAttribute("aria-describedby", "field-email-error");
    expect(document.getElementById("field-email-error")).toHaveTextContent(
      v("emailInvalid"),
    );
  });

  it("submits valid credentials, persists the role and navigates home", async () => {
    const user = userEvent.setup();
    mocks.login.mockResolvedValue({ userId: "u-1", role: "gestor" });
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "ana@leiritech.pt");
    await user.type(screen.getByLabelText("Palavra-passe"), "palavra-passe-1");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(mocks.login).toHaveBeenCalledWith({
        email: "ana@leiritech.pt",
        password: "palavra-passe-1",
      }),
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/"));
    expect(mocks.persistPref).toHaveBeenCalledWith(expect.any(String), "gestor");
  });

  it("renders the localized server error and does not navigate", async () => {
    const user = userEvent.setup();
    mocks.login.mockRejectedValue(new ApiError("invalid_credentials"));
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "ana@leiritech.pt");
    await user.type(screen.getByLabelText("Palavra-passe"), "errada-errada");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByText(testMessages.auth.errors.invalid_credentials),
    ).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("shows a pending state that prevents a double submission", async () => {
    const user = userEvent.setup();
    let release: (value: { userId: string; role: string }) => void = () => {};
    mocks.login.mockImplementation(
      () => new Promise((resolve) => { release = resolve; }),
    );
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "ana@leiritech.pt");
    await user.type(screen.getByLabelText("Palavra-passe"), "palavra-passe-1");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    const pending = await screen.findByRole("button", { name: /A entrar/ });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute("aria-busy", "true");

    await user.click(pending);
    expect(mocks.login).toHaveBeenCalledTimes(1);

    release({ userId: "u-1", role: "gestor" });
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
  });
});
