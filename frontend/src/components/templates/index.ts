/**
 * Project templates feature (issue #33). The templates list + editor consume the
 * canonical mock API in `@/lib/api/templates`. Other issues (#31 conversion, #42
 * settings nav) import the API/types, not these components.
 */

export { TemplatesListView } from "./templates-list-view";
export type { TemplatesListViewProps } from "./templates-list-view";
export { TemplateEditorView } from "./template-editor-view";
export type { TemplateEditorViewProps } from "./template-editor-view";
export { TemplateFormDialog } from "./template-form-dialog";
export { PhaseFormDialog } from "./phase-form-dialog";
export { TaskFormDialog } from "./task-form-dialog";
export { SortablePhaseCard } from "./sortable-phase-card";
export { SortableTaskRow } from "./sortable-task-row";
export { TemplateTypeBadge, useRoleLabel, useDurationLabel } from "./template-helpers";
export { TemplateField, TemplateSelect } from "./template-field";
