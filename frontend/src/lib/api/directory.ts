/**
 * The real user directory (`GET /users`).
 *
 * Every "responsável" select used to be fed from a hardcoded roster with
 * slug ids ("dev-admin", "u-diogo") left over from the mock era. Those ids
 * are not UUIDs, so submitting any form with a required owner produced a
 * `422 uuid_parsing` that the dialogs swallowed — creating a contact, an
 * opportunity or a task was impossible through the UI. This module is the
 * single source of owner options, and every id it returns is a real user id.
 *
 * BR-002: the backend scopes the directory itself — a Membro sees only their
 * own row — so the caller does not filter.
 */

import { http } from "./http";

export interface DirectoryEntry {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface RawDirectoryUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export const directoryQueryKey = ["directory", "users"] as const;

export async function listDirectory(): Promise<DirectoryEntry[]> {
  const data = await http.get<{ items: RawDirectoryUser[] }>("/users");
  return data.items
    .map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));
}
