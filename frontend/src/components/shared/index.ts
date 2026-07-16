/**
 * Shared component library for Aurea System (issue #7).
 *
 * Feature builders import from `@/components/shared` — never reach into the
 * individual files. Everything here consumes the DESIGN.md tokens, is fully
 * i18n'd via next-intl, and meets WCAG AA (keyboard nav, focus, aria).
 */

// Data display
export { SmartTable } from "./smart-table";
export type {
  SmartTableProps,
  SmartTableColumn,
  RowAction,
} from "./smart-table";

// Inputs
export { SearchableCombobox } from "./searchable-combobox";
export type { SearchableComboboxProps, ComboboxItem } from "./searchable-combobox";

// Overlays
export { DetailSidePanel } from "./detail-side-panel";
export type { DetailSidePanelProps } from "./detail-side-panel";
export { ConfirmDialog, useConfirmDialog } from "./confirm-dialog";
export type { ConfirmDialogProps, ConfirmVariant } from "./confirm-dialog";

// Feedback
export { EmptyState } from "./empty-state";
export type { EmptyStateProps } from "./empty-state";
export {
  Skeleton,
  SkeletonText,
  SkeletonTable,
  SkeletonCard,
  SkeletonList,
} from "./skeletons";
export type {
  SkeletonTextProps,
  SkeletonTableProps,
  SkeletonCardProps,
  SkeletonListProps,
} from "./skeletons";
export { ProgressBar } from "./progress-bar";
export type { ProgressBarProps } from "./progress-bar";
export { AnimatedCounter } from "./animated-counter";
export type { AnimatedCounterProps } from "./animated-counter";

// Toast + undo
export {
  Toaster,
  useToast,
  toast,
  toastWithUndo,
  dismissToast,
  aureaToastManager,
} from "./toast";
export type {
  ToastOptions,
  UndoToastOptions,
  ToastTone,
  AureaToastData,
} from "./toast";

// Collaboration (issue #40) — reusable across companies/opportunities/projects/tasks
export { CommentThread } from "./comment-thread";
export type {
  CommentThreadProps,
  CommentThreadCurrentUser,
} from "./comment-thread";
export { ActivityFeed } from "./activity-feed";
export type { ActivityFeedProps } from "./activity-feed";
export { MentionInput, deriveMentionIds } from "./mention-input";
export type { MentionInputProps } from "./mention-input";

// Pre-existing shared utilities (foundation)
export { LocaleSwitcher } from "./locale-switcher";
export { ThemeToggle } from "./theme-toggle";
export { TextSizeSwitcher } from "./text-size-switcher";
