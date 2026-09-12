import { RouteTransition } from "@/components/shell/route-transition";

/**
 * `template.tsx`, not `layout.tsx`: Next gives a template a fresh key per
 * navigation, which is the remount the transition needs. A layout persists
 * and would animate once, on first load.
 */
export default function AppTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RouteTransition>{children}</RouteTransition>;
}
