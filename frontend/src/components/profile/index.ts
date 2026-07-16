/**
 * Personal profile feature (issue #43 / §8 /profile).
 *
 * The route page imports `ProfileView` from here. All roles view/edit their own
 * profile; role is read-only. Theme + locale controls REUSE the foundation
 * components (ThemeToggle/LocaleSwitcher + next-themes provider) — never rebuilt.
 */

export { ProfileView } from "./profile-view";
export { PersonalInfoForm } from "./personal-info-form";
export { PreferencesSection } from "./preferences-section";
export { SecuritySection } from "./security-section";
export { ProfileField } from "./profile-field";
export { PreferenceToggle } from "./preference-toggle";
