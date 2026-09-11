# SaaS Pages Audit: LeiriTech

**Date**: 2026-09-10  
**Auditor**: Claude (SaaS Pages Auditor)  
**Project**: LeiriTech (Internal PSA/CRM tool)  
**Framework**: Next.js 16 App Router  
**Spec reference**: forge-prd.md §8 (Frontend Pages & Components)

---

## Framework & Routing

- **Framework**: Next.js 16 App Router
- **Routing**: App Router with (app) and (auth) route groups
- **UI Library**: shadcn/ui (deeply customized)
- **Locale**: Server-side resolved (never in URL)
- **Total routes found**: 49 pages + 34 error/loading states
- **Auth**: Session-based with JWT (access + refresh tokens in HttpOnly cookies)

---

## Page Coverage Summary

### Authentication Pages
| Page | Status | Route | Notes |
|------|--------|-------|-------|
| Login | ✅ EXISTS | /login | Form-based, redirects to / on success |
| Forgot Password | ✅ EXISTS | /forgot-password | Email-based password reset initiation |
| Reset Password | ✅ EXISTS | /reset-password?token=... | Token-based password reset |
| Invite/Accept | ✅ EXISTS | /invite/[token] | Token-based invite acceptance |

### Core Dashboard & Hubs
| Page | Status | Route | Notes |
|------|--------|-------|-------|
| Dashboard / Atenção | ✅ EXISTS | / | Scoped by role; all roles can access |
| My Work (daily hub) | ✅ EXISTS | /my-work | Contextual greeting + task grouping |

### CRM Pages
| Page | Status | Route | Notes |
|------|--------|-------|-------|
| Companies List | ✅ EXISTS | /crm/companies | SmartTable with search/filter |
| Company Create | ✅ EXISTS | /crm/companies/new | Form with company details |
| Company Detail | ✅ EXISTS | /crm/companies/[id] | Full relationship view + tabs |
| Company Edit | ❌ MISSING | /crm/companies/[id]/edit | **SPEC REQUIRES** but no route found |
| Contacts List | ✅ EXISTS | /crm/contacts | SmartTable with search/filter |
| Contact Detail | ✅ EXISTS | /crm/contacts/[id] | Detail card + relationships |
| Opportunity Pipeline | ✅ EXISTS | /crm/pipeline | Kanban board, drag-and-drop |
| Opportunity Detail | ✅ EXISTS | /crm/opportunities/[id] | Detail view + activity feed |
| Proposals List | ✅ EXISTS | /crm/proposals | Table with status + PDF upload |
| Proposal Detail | ✅ EXISTS | /crm/proposals/[id] | Detail + PDF preview |
| Proposal PDF Preview | ✅ EXISTS | /crm/proposals/[id]/preview | Dedicated preview page |
| Proposal Templates | ✅ EXISTS | /crm/proposal-templates | Admin management of templates |
| Proposal Template Detail | ✅ EXISTS | /crm/proposal-templates/[id] | Template editor |
| Catalog | ✅ EXISTS | /crm/catalog | Product/service catalog (not in spec) |
| Catalog Item Detail | ✅ EXISTS | /crm/catalog/[id] | Catalog item editor |

### Projects & Delivery
| Page | Status | Route | Notes |
|------|--------|-------|-------|
| Projects List | ✅ EXISTS | /projects | SmartTable with status + health |
| Project Create | ✅ EXISTS | /projects/new | Form for new project |
| Project Detail | ✅ EXISTS | /projects/[id] | Tabs: Overview, Tasks, Phases, Calendar, Files, Activity, Financial |
| Project Convert (Won→Project) | ✅ EXISTS | /projects/[id]/convert | Wizard for opportunity→project conversion |

### Task Management
| Page | Status | Route | Notes |
|------|--------|-------|-------|
| Tasks | ✅ EXISTS | /tasks | List/Kanban/calendar views + side panel |

### Time Tracking
| Page | Status | Route | Notes |
|------|--------|-------|-------|
| Time Entries | ✅ EXISTS | /time | Time tracking workspace (F11) |

### Calendar & Scheduling
| Page | Status | Route | Notes |
|------|--------|-------|-------|
| Aggregate Calendar | ✅ EXISTS | /calendar | Tasks, meetings, milestones, payments |

### Team & Workload
| Page | Status | Route | Notes |
|------|--------|-------|-------|
| Team + Workload Heatmap | ✅ EXISTS | /team | Member utilization + availability |

### Finance & Billing
| Page | Status | Route | Notes |
|------|--------|-------|-------|
| Financial Dashboard | ✅ EXISTS | /finance | Payment milestones, margin, contracts |

### Reports & Export
| Page | Status | Route | Notes |
|------|--------|-------|-------|
| Reports | ✅ EXISTS | /reports | Commercial, projects, team, financial |

### Notifications
| Page | Status | Route | Notes |
|------|--------|-------|-------|
| Notification Center | ✅ EXISTS | /notifications | Grouped notifications + archive |

### User Profile & Preferences
| Page | Status | Route | Notes |
|------|--------|-------|-------|
| Profile / Account Settings | ✅ EXISTS | /profile | Password change + session management |

### Settings (Admin)
| Page | Status | Route | Notes |
|------|--------|-------|-------|
| Settings Hub | ✅ EXISTS | /settings | Navigation to all settings areas |
| Aurea Details | ✅ EXISTS | /settings/leiritech | Company data/logo configuration |
| Members Management | ✅ EXISTS | /settings/members | Invite, manage, deactivate members |
| Member Invite | ✅ EXISTS | /settings/members/invite | Invite new members by email |
| Roles Management | ✅ EXISTS | /settings/roles | Admin/Gestor/Membro role configuration |
| Pipeline Stages | ✅ EXISTS | /settings/pipeline | Opportunity stage configuration |
| Task States | ✅ EXISTS | /settings/states | Task state management |
| Tags | ✅ EXISTS | /settings/tags | Tag configuration |
| Project Templates | ✅ EXISTS | /settings/templates | Reusable project phase/task templates |
| Template Detail | ✅ EXISTS | /settings/templates/[id] | Template editor |
| Weekly Capacity | ✅ EXISTS | /settings/capacity | Role utilization targets |
| Internal Costs | ✅ EXISTS | /settings/costs | Cost rate configuration |
| Notifications Settings | ✅ EXISTS | /settings/notifications | Notification preferences |
| Theme | ✅ EXISTS | /settings/theme | Light/dark mode preference |
| Archive | ✅ EXISTS | /settings/archive | View/restore archived records |
| Data Export | ✅ EXISTS | /settings/export | CSV export functionality |
| Settings Priorities | ❌ MISSING | /settings/priorities | Spec F20 mentions "priorities" but no page |

### Error & Status Pages
| Page | Status | Route | Notes |
|------|--------|-------|-------|
| 404 Not Found | ✅ EXISTS | app/not-found.tsx | Branded error page with recovery link |
| App-level Error Boundary | ✅ EXISTS | app/(app)/error.tsx | Generic error handler for (app) routes |
| Route-level Error Boundaries | ✅ EXISTS | 31 error.tsx files | Every major route has error handling |
| Loading States | ✅ EXISTS | 30 loading.tsx files | Skeleton/loading states on major routes |

---

## Critical Findings

| # | Severity | Category | Component | Issue | Recommendation |
|---|----------|----------|-----------|-------|-----------------|
| 1 | **CRITICAL** | Auth / Logout | `frontend/src/components/shell/user-menu.tsx` line 71 | Logout button navigates to `/login` via `<Link href="/login" />` but **never calls `/api/auth/logout`**. Sessions are not revoked server-side, creating security risk. | Change button action to call `/api/auth/logout` before navigation. Consider creating a LogoutButton component that: (1) calls POST /api/auth/logout, (2) clears cookies, (3) redirects to /login |
| 2 | **CRITICAL** | Auth / Logout | `frontend/src/components/profile/security-section.tsx` line 159 | Same issue: logout button in profile security section just links to `/login` without revoking session. | Wire logout endpoint call in SecuritySection logout button |
| 3 | **HIGH** | CRM / Pages | Missing route | Spec §8 requires `/crm/companies/[id]/edit` page but only `/crm/companies/[id]` (detail) and `/crm/companies/new` exist | Create edit page at `/crm/companies/[id]/edit` or modify company detail page to include inline edit mode |
| 4 | **MEDIUM** | Settings / Configuration | Missing route | Spec F20 lists "priorities" as configurable in settings, but no `/settings/priorities` page exists. Note: task priorities (low/normal/high/urgent) are modeled as enums; unclear if these need a separate settings page or if they're fixed. | Clarify in spec whether task priorities should be user-configurable or remain fixed enums. If configurable, create `/settings/priorities` page |
| 5 | **MEDIUM** | CRM / Scope | Extra feature | `/crm/catalog` (product/service catalog) exists with list/detail pages but is **not mentioned in forge-prd.md**. Unclear if in scope. | Verify whether product catalog is in scope for this tool. If out of scope, remove. If in scope, add to spec. |

---

## Verification Checklist

### ✅ Authentication Flows
- [x] Login page exists with form
- [x] Forgot password page exists
- [x] Reset password flow with token validation
- [x] Invite acceptance page
- [x] Login redirects to dashboard (/)
- [x] Invite redirects to dashboard after acceptance
- [x] Password reset page checks for token presence
- [x] All auth pages have error boundaries and loading states
- [ ] ❌ Logout actually revokes sessions (CRITICAL ISSUE)

### ✅ Protected Routes
- [x] All (app) routes require getSession() check
- [x] Unauthorized users redirected to /login
- [x] CRM/Finance routes check for Gestor+ role
- [x] Admin-only settings routes check for admin role
- [x] Profile page visible only to authenticated user

### ✅ Core Pages
- [x] Dashboard (/) accessible to all roles, content scoped
- [x] My Work (/my-work) page for all roles
- [x] Tasks management with multiple views
- [x] Calendar with aggregate events
- [x] Notifications center
- [x] Profile page with password change

### ✅ CRM Pages
- [x] Companies CRUD (except edit)
- [x] Contacts CRUD
- [x] Pipeline Kanban
- [x] Opportunities detail
- [x] Proposals list/detail/PDF preview

### ✅ Projects & Delivery
- [x] Projects list with state + health filtering
- [x] Project detail with tabs (Overview, Tasks, Phases, Calendar, Files, Activity, Financial)
- [x] Won→Project conversion wizard (/projects/[id]/convert)
- [x] Project templates with CRUD

### ✅ Team & Operations
- [x] Team page with workload heatmap
- [x] Time tracking workspace (/time)
- [x] Finance dashboard with payment milestones
- [x] Reports with filters + CSV export

### ✅ Settings (Admin)
- [x] Settings hub with navigation
- [x] 15/16 settings sub-areas exist (priorities missing)
- [x] Error boundaries on all settings routes
- [x] Admin-only access enforced

### ✅ Error Handling
- [x] 404 page exists (not-found.tsx)
- [x] Error boundary on app level
- [x] 31 route-level error.tsx files
- [x] 30 loading.tsx skeleton files

### ⚠️ Outstanding Issues
- [x] Logout endpoint exists (/api/auth/logout) but is never called from UI
- [x] No /crm/companies/[id]/edit page (spec requires)
- [x] No /settings/priorities page (unclear if needed)
- [x] /crm/catalog exists but not in spec

---

## Summary

**Total Pages Found**: 49  
**Pages in Spec**: ~48  
**Extra Pages (not in spec)**: /crm/catalog*, /crm/proposal-templates*, /crm/catalog/[id]*, /crm/proposals/[id]/preview*  
*Note: Some extra pages are reasonable implementations (templates, PDF preview); catalog needs clarification.

**Missing from Spec Requirements**:
1. `/crm/companies/[id]/edit` — **CRITICAL TO ADD**
2. `/settings/priorities` — **CLARIFY IF NEEDED**

**Critical Issues**:
1. Logout button not wired to revoke sessions — **FIX IMMEDIATELY**
2. Session revocation missing in user-menu and profile components

**Overall Assessment**: App structure is comprehensive and well-organized with proper error boundaries, loading states, and access controls. **Main blockers**: logout functionality and missing edit page for companies. Once these are fixed, the page structure meets the spec.

---

## Recommendations

### Immediate (CRITICAL)
1. **Fix logout wiring**:
   - Create a `useLogout()` hook that: calls POST `/api/auth/logout`, clears cookies, redirects to `/login`
   - Use this hook in both `user-menu.tsx` and `security-section.tsx`
   - Test that: session cookies are cleared, refresh tokens are revoked, user cannot access protected routes after logout

2. **Add company edit page**:
   - Create `/crm/companies/[id]/edit/page.tsx` OR convert company detail to support edit mode
   - Use same form as `/crm/companies/new` but pre-populate with existing data
   - Ensure proper permission checks (Gestor+ only)

### High Priority
3. **Clarify priorities setting**: Determine if task priorities should be configurable per spec F20 or remain fixed
4. **Clarify catalog scope**: Confirm whether product catalog is in spec or should be removed

### Best Practices (Already Implemented)
- ✅ All protected routes have session checks
- ✅ Error boundaries on every route
- ✅ Loading states on every route
- ✅ Role-based access control enforced
- ✅ Proper redirect flows (login→dashboard, logout→login)

