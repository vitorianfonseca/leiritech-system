import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canAccessFinance } from "@/lib/api/finance-types";
import { FinanceView } from "@/components/finance/finance-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("finance") };
}

/**
 * /finance — GATED + FINANCIAL (F14, BR-008/066/069).
 *
 * Access: Admin ✅ / Gestor 🔒 (payments grant only) / Membro ❌ entirely
 * hidden. Unauthorized users get a 404 (the route reveals nothing about the
 * existence of financial data). The nav entry is gated separately in
 * `nav-config.ts`, and the mock API refuses unauthorized reads — three layers,
 * one predicate (`canAccessFinance`).
 */
export default async function FinancePage() {
  const session = await getSession();

  if (!session || !canAccessFinance(session.role, session.paymentsGrant)) {
    notFound();
  }

  return (
    <FinanceView
      user={{ role: session.role, paymentsGrant: session.paymentsGrant }}
    />
  );
}
