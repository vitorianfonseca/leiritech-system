# Issue #31 — Won → Project Conversion Wizard

Core differentiator: zero re-entry (BR-035). Route: `/crm/opportunities/[id]/convert`.

## Data facts (from repo)
- One seeded WON opp: `o-8` (Verdejar Bio, c-7) + accepted proposal `p-4` (27.000,00 €) → pre-fill path.
- Need a 2nd WON opp WITHOUT accepted proposal for verbal-close → add `o-10` (additive seed).
- `clienteAtivo` is DERIVED (won opp / accepted proposal) → BR-038 already satisfied; no CRM mutation, review just states it.
- `getProjectFinance` reads milestones from `financeApi.getOverview()` filtered by projectId → seed confirmed milestones via `financeApi.createMilestone`.
- `projects.ts` already imports `financeApi` → orchestrate milestone seeding inside `projectsApi.convertOpportunity`.

## API edits
- `opportunities.ts`: add `markConverted(id, projectId, actorId)` + seed `o-10`.
- `projects-types.ts`: add `ConvertToProjectInput` (extends CreateProjectInput: teamMemberIds, phases[], opportunityId, proposalId, paymentMilestonesConfirmed) + `InstantiatedPhaseInput`.
- `projects.ts`: add `convertOpportunity(input, actorId, canFinance)` — builds enriched project (template phases, team, opportunityId, confirmed flag), seeds payment milestones via financeApi when canFinance.
- New `conversion-types.ts`: ConversionContext, MilestoneDraft, ConvertWizardInput, ConversionError, pure default helpers (deriveMilestoneDrafts, deriveSchedule).
- New `conversion.ts`: `conversionApi.getContext()` + `convert()` (calls projectsApi.convertOpportunity + opportunitiesApi.markConverted). `conversionRoutes`.
- New `conversion-schemas.ts`: per-step zod.

## UI
- Route: `convert/{page,loading,error}.tsx` (guard Gestor+; membro→notFound).
- `components/conversion/`: convert-wizard (orchestrator + state), wizard-stepper (a11y), step-details, step-template, step-milestones (finance-gated), step-team, step-review (create + success spring), index.

## Wiring #29 (flag)
- `opportunity-detail-view.tsx`: persistent "Criar projeto" CTA in won banner (Link) when won && !converted; else "Ver projeto"; enable WonDialog convert.
- `pipeline-board.tsx`: enable WonDialog convert → navigate.

## i18n
- New `conversion` top-level block in pt-PT.json + en.json (parity).

## DoD
- build / tsc / lint clean; key parity counts; Playwright desktop+mobile light+dark, admin pre-fill + verbal-close + membro notFound; commit; comment SHA; kill server; remove temp.
