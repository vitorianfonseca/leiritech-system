"use client";

import { useQuery } from "@tanstack/react-query";
import { directoryQueryKey, listDirectory } from "@/lib/api/directory";

export interface OwnerOption {
  value: string;
  label: string;
}

/**
 * Owner ("responsável") options for a form select, backed by the real user
 * directory. Returns real user ids, so the value a form submits is one the
 * backend accepts.
 *
 * On failure the list is empty rather than falling back to invented people:
 * an empty select is honest and a validation error is legible, whereas a
 * fake name produces a 422 that looks like the user's fault.
 */
export function useOwnerOptions(): {
  options: OwnerOption[];
  loading: boolean;
  error: boolean;
} {
  const { data, isLoading, isError } = useQuery({
    queryKey: directoryQueryKey,
    queryFn: listDirectory,
    staleTime: 5 * 60 * 1000, // the roster of a small team barely moves
  });

  return {
    options: (data ?? []).map((u) => ({ value: u.id, label: u.name })),
    loading: isLoading,
    error: isError,
  };
}
