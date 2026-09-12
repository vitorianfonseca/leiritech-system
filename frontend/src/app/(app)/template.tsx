import { PageTransition } from "@/components/shell/page-transition";

/**
 * `template.tsx` (not `layout.tsx`) because Next gives a template a fresh key
 * on every navigation — which is exactly the remount the enter animation
 * needs. A layout persists and would animate once, on first load only.
 */
export default function AppTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageTransition>{children}</PageTransition>;
}
