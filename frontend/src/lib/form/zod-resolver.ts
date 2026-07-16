import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { ZodType } from "zod";

/**
 * Minimal zod ⇆ react-hook-form resolver.
 *
 * The project does not ship `@hookform/resolvers`, so this adapts a zod v4
 * schema to RHF's `Resolver` contract directly: on success it returns parsed
 * values and no errors; on failure it maps each `ZodIssue` to a field error
 * keyed by its dotted path. Later issues on the same path do not overwrite the
 * first (RHF surfaces one message per field).
 */
export function zodResolver<T extends FieldValues>(
  schema: ZodType<T>,
): Resolver<T> {
  return async (values) => {
    const result = schema.safeParse(values);

    if (result.success) {
      return { values: result.data, errors: {} };
    }

    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "root";
      if (!errors[path]) {
        errors[path] = { type: issue.code ?? "validation", message: issue.message };
      }
    }

    return {
      values: {},
      errors: errors as FieldErrors<T>,
    };
  };
}
