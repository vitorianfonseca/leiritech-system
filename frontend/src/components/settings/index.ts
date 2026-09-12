/**
 * Settings feature (issue #42). Route pages import the section views + the
 * layout shell from here. Templates (#33) is linked, not rebuilt.
 */

export { SettingsLayoutClient } from "./settings-layout-client";
export { SettingsNav } from "./settings-nav";
export { SettingsLanding } from "./settings-landing";
export { LeiritechSettingsView } from "./leiritech-settings-view";
export { MembersSettingsView } from "./members-settings-view";
export { InviteMemberView } from "./invite-member-view";
export { PipelineStagesView } from "./pipeline-stages-view";
export { NotificationsSettingsView } from "./notifications-settings-view";
export { ArchiveSettingsView } from "./archive-settings-view";
export {
  visibleSettingsGroups,
  visibleSettingsItems,
  canSeeSettingsItem,
} from "./settings-nav-config";
export { FunctionConfigView } from "./function-config-view";
