import { ApiError, type AuthErrorCode } from "./types";

/**
 * Normalizes any thrown value into a stable {@link AuthErrorCode} so forms can
 * render a localized message via `t(\`errors.${code}\`)`. Unknown failures
 * (network, unexpected) collapse to `network`.
 */
export function toAuthErrorCode(error: unknown): AuthErrorCode {
  if (error instanceof ApiError) return error.code;
  return "network";
}
