import * as React from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import messages from "@/messages/pt-PT.json";

/**
 * Shared render helper.
 *
 * Wraps the subject in the same providers the real app mounts in
 * `<AppProviders>` — next-intl (with the REAL canonical pt-PT catalogue, so a
 * missing or renamed key fails the test instead of silently passing), TanStack
 * Query (a throwaway client per test, retries off) and the Base UI tooltip
 * provider.
 */

export const testMessages = messages;

/** Canonical locale + a fixed timezone so date formatting is deterministic. */
export const TEST_LOCALE = "pt-PT";
export const TEST_TIME_ZONE = "Europe/Lisbon";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  queryClient?: QueryClient;
  /** Override or extend the pt-PT catalogue (e.g. to test a fallback). */
  messages?: Record<string, unknown>;
  locale?: string;
}

export interface RenderWithProvidersResult extends RenderResult {
  queryClient: QueryClient;
}

export function renderWithProviders(
  ui: React.ReactNode,
  options: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  const {
    queryClient = createTestQueryClient(),
    messages: msgs = messages,
    locale = TEST_LOCALE,
    ...rest
  } = options;

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <NextIntlClientProvider
        locale={locale}
        timeZone={TEST_TIME_ZONE}
        messages={msgs as never}
      >
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delay={0}>{children}</TooltipProvider>
        </QueryClientProvider>
      </NextIntlClientProvider>
    );
  }

  const result = render(ui, { wrapper: Wrapper, ...rest });
  return Object.assign(result, { queryClient });
}
