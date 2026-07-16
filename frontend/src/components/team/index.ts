/**
 * Team & workload feature (F13 / issue #37) — team roster + weekly workload
 * heatmap + derived availability (BR-080..084). Feature pages import from
 * `@/components/team`, never reach into files.
 */

export { TeamView } from "./team-view";
export type { TeamViewProps } from "./team-view";
export { WorkloadHeatmap } from "./workload-heatmap";
export { TeamTable } from "./team-table";
export { AvailabilityBadge } from "./availability-badge";
export type { AvailabilityBadgeProps } from "./availability-badge";
export { CapacityConfigDialog } from "./capacity-config-dialog";
