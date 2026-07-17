/**
 * Case-mapping between the backend (snake_case JSON) and the frontend
 * (camelCase types). The backend is snake_case everywhere EXCEPT a handful of
 * pre-camelCased aggregate endpoints (e.g. /dashboard); running snake→camel on
 * an already-camelCase payload is a no-op, so it is always safe to apply.
 *
 * Only object KEYS are transformed — string values (enum codes, ids, ISO dates)
 * are never touched. Arrays and nested objects are walked recursively.
 */

function toCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

type Json = unknown;

function isPlainObject(value: Json): value is Record<string, Json> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function mapKeys(value: Json, mapKey: (k: string) => string): Json {
  if (Array.isArray(value)) {
    return value.map((v) => mapKeys(v, mapKey));
  }
  if (isPlainObject(value)) {
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(value)) {
      out[mapKey(k)] = mapKeys(v, mapKey);
    }
    return out;
  }
  return value;
}

/** Deep snake_case → camelCase (backend response → frontend). */
export function keysToCamel<T = unknown>(value: Json): T {
  return mapKeys(value, toCamel) as T;
}

/** Deep camelCase → snake_case (frontend request body → backend). */
export function keysToSnake<T = unknown>(value: Json): T {
  return mapKeys(value, toSnake) as T;
}
