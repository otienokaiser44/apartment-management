export type Result<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

export type PgError = { code?: string; message: string; details?: string | null };

/**
 * The RPCs raise deliberate, user-safe messages with these SQLSTATEs (22023 invalid/unavailable, 23505 conflict,
 * P0002 not found, 42501 not allowed). Anything else (or a bare RLS "permission denied") is replaced by a generic
 * message so internals never reach the user.
 */
export function failure(error: PgError, fallback: string): { ok: false; message: string } {
  const safe = ["22023", "23505", "P0002", "42501"].includes(error.code ?? "");
  if (safe && !/^permission denied|row-level security/i.test(error.message)) return { ok: false, message: error.message };
  return { ok: false, message: fallback };
}

/** Bulk RPCs put a JSON array of per-row problems in the error DETAIL (errcode 22023). */
export function rowErrorsFrom<T>(error: PgError): T[] | undefined {
  if (error.code !== "22023" || !error.details) return undefined;
  try {
    const parsed = JSON.parse(error.details);
    return Array.isArray(parsed) ? (parsed as T[]) : undefined;
  } catch {
    return undefined;
  }
}
