# Domain Research: Internal PSA (Professional Services Automation) for a Software Development Company

**App**: LeiriTech
**Domain**: Professional Services Automation (PSA) / Agency Operations — internal tool for a software house
**Researched**: 2026-07-16

## Industry Overview

LeiriTech sits in the PSA (Professional Services Automation) category — software built for firms that sell time, expertise, and delivered projects rather than physical goods. This category is distinct from generic project management (Jira, Asana) and generic CRM (Salesforce, HubSpot) because it fuses the **commercial pipeline**, **delivery execution**, and **financial health of engagements** into one continuous data model. The industry term for the full lifecycle is **"quote-to-cash"**: first contact → opportunity → proposal/quote → won deal → project kickoff → execution → delivery → invoicing/payment → account follow-up. PSA vendors (Scoro, Productive, Kantata/Mavenlink, BigTime, Deltek, Accelo, Rocketlane) exist specifically because generic PM tools don't track profitability and generic CRMs don't track delivery capacity.

The core tension every PSA product manages is **capacity vs. commercial promises**: sales teams sell hours/outcomes, delivery teams have finite people-hours, and finance needs margin visibility connecting the two. A tool that only does Kanban tasks (like plain ClickUp/Monday) or only does CRM (like plain HubSpot) cannot answer "are we over-committed next month" or "is this project still profitable." That's the gap LeiriTech is built to close — as an **internal, single-tenant** version of this pattern, not a multi-tenant SaaS, which simplifies some things (no multi-org data isolation, no public onboarding) but does NOT reduce the need for correct domain modeling of pipeline, delivery, and financial-tracking workflows.

Because LeiriTech explicitly excludes accounting/legal invoicing, client portals, and chat, it occupies a narrower slice than full PSA suites — closer to "Productive's project/resourcing/time core + Scoro's lightweight CRM" combined, minus the billing/invoicing engine. This is a legitimate scope: several PSA vendors sell this narrower slice as "operations" modules and integrate with a separate accounting system for the actual invoice document and tax compliance.

## Standard Terminology

| Term | Industry-standard definition | Notes / mapping to LeiriTech |
|---|---|---|
| **Opportunity / Deal** | A qualified potential sale tracked through pipeline stages until won or lost | LeiriTech's `opportunities` entity — correct standard term |
| **Pipeline stage** | A discrete, buyer-progress-defined step (not rep-activity-defined) with exit criteria and a historical win-probability | `pipeline_stages` — must reflect **buyer's state** (e.g. "Proposal Sent", "Verbal Commitment"), not internal activity like "Called Twice" |
| **Win probability / stage probability** | % likelihood a deal in a given stage closes won, ideally derived from historical conversion data per stage, not a guessed default | Recommend LeiriTech let admins tune per-stage probability after ~1 quarter of real data rather than hardcoding guesses |
| **Proposal / Quote** | Commercial document with scope, price, terms sent to prospect for approval | LeiriTech explicitly stores metadata + generates PDF, no editor — matches "quote" tier of quote-to-cash, not a full CPQ (configure-price-quote) engine |
| **Won-deal conversion / Deal-to-project handoff** | The industry's most failure-prone step: commercial data (scope, budget, contacts, proposal terms) must carry over into the delivery record without re-entry | LeiriTech's "won→project spin-up reusing commercial data + template" directly matches PSA best practice; competitors (Kantata, Productive) all treat this handoff as a first-class flow, not an afterthought |
| **Billable hours / Non-billable hours** | Billable = time chargeable to a client engagement; non-billable = internal/admin/PTO/business-development time | LeiriTech's `time_entries.billable` flag — standard boolean split used industry-wide |
| **Utilization rate (billable utilization)** | Billable hours ÷ available hours × 100. Industry benchmark: **75–80%** for delivery/consultant roles, **35–50%** for managers/leads, ~55–60% company-wide average | Use this as the basis for "capacity vs load" — do NOT apply one flat target % to all roles; managers should have a materially lower target than engineers |
| **Capacity / Delivery capacity** | Hours a person/team can realistically deliver, net of PTO, meetings, admin ("culture hours") — Delivery Capacity = (Gross Capacity − Non-project hours) × Utilization Target | LeiriTech's team/workload view should model capacity as *net* available hours, not raw calendar hours |
| **Resource heatmap** | Color-coded visualization (cold/warm/hot) of over- vs under-allocation across people/teams/time | Matches LeiriTech's "capacity vs. load, availability states" feature — industry-standard visualization pattern is color intensity, not raw numbers alone |
| **Project health / RAG status** | Red-Amber-Green traffic-light indicator of schedule/budget/scope/risk health | Matches LeiriTech's "manual + auto-suggested health" — industry consensus: **auto-suggest from data (milestone slippage, overdue tasks, budget burn) but let a human confirm/override the final published status**, never fully automate without review |
</br>
| **Milestone billing / Milestone-based payment** | Payment tied to completion of a defined, client-agreed deliverable rather than time elapsed | LeiriTech's `payment_milestones` — standard pattern; industry best practice is each milestone must define: (1) what constitutes completion, (2) who confirms it, (3) the client acceptance step, (4) the amount/percentage it triggers |
| **Margin / Project profitability** | (Contracted value − delivered cost, usually derived from time × internal cost rate) ÷ contracted value | LeiriTech's "margin estimation" — standard PSA metric is **budget vs. actuals**, tracked continuously, not just at project close |
| **WIP (Work in Progress)** | Kanban/Lean term for tasks actively being worked, deliberately capped to avoid overload | Relevant to LeiriTech's task Kanban — consider WIP limits per column as an optional health signal, though not explicitly in MVP scope |
| **Blocker / Dependency** | A task/relationship preventing another task's progress; distinct from a generic "note" | LeiriTech's task blockers/dependencies — standard practice is to make blocked status **visually distinct** on the board and surface it in daily/dashboard views, matching LeiriTech's "Atenção necessária" panel intent |
| **Quote-to-cash** | The end-to-end commercial+delivery+billing lifecycle | This is literally LeiriTech's mission statement, confirming the domain framing is correct |

*pt-PT note: "Custódia"/"posse" are not relevant here (that's asset-management terminology); for LeiriTech the closer pt-PT industry terms are "funil comercial" (pipeline), "proposta" (proposal), "faturação por marcos" (milestone billing), "taxa de ocupação/utilização" (utilization rate), "capacidade" (capacity).*

## Regulatory / Compliance Requirements

### GDPR (Regulation (EU) 2016/679) — directly applicable
LeiriTech stores personal data of contacts (names, emails, phone numbers, job titles, interaction history) belonging to client-side individuals, and of its own employees (workload, time entries, capacity). Under GDPR this is personal data regardless of the tool being internal/single-tenant — GDPR applies to *any* processing of EU individuals' data, not just public SaaS products.

Practical requirements for LeiriTech:
- **Data minimisation**: only collect contact fields actually used by the CRM/interaction workflow (name, email, phone, role, company) — do not add speculative fields "in case."
- **Storage limitation**: stale contacts/companies with no interaction and no active relationship should be identifiable for review/deletion, not retained indefinitely by default. A soft-delete/archive pattern with a defined retention review is standard practice, though full automated purge is not typically MVP — flag as a policy the Administrador should be able to action manually at minimum.
- **Access control / least privilege**: LeiriTech's role model (Administrador/Gestor/Membro with "own projects/clients" scoping for Membro) is itself a GDPR technical-and-organizational safeguard (Article 32) — this validates the existing role design rather than adding new scope.
- **Audit trail**: `activity_logs` satisfies the "demonstrate compliance" requirement (who accessed/changed what personal data, when) — this is a genuine compliance-relevant entity, not just a nice-to-have feature.
- **Employee data**: time entries and workload data are also personal data of LeiriTech's own staff; the same minimisation/access principles apply internally (e.g., a Membro's manager should see their workload, but this is more sensitive than generic task data and role-based visibility should be deliberate, not incidental).

No DPIA (Data Protection Impact Assessment) is likely required for this scale/sensitivity (no special-category data, no large-scale profiling), but this is a reasonable one-line risk note for LeiriTech's admin, not an MVP feature.

### SAF-T (PT) / Certified Invoicing Software — explicitly OUT OF SCOPE, confirmed
Portugal requires **AT-certified invoicing software** for any legal invoice issued to a Portuguese VAT taxpayer, with SAF-T (PT) monthly XML export, ATCUD codes, QR codes, and (from Jan 2027) qualified electronic signatures on PDF invoices. Fines for non-certified invoicing software range €3,000–€18,750 per infraction.

**This confirms and validates LeiriTech's explicit scope boundary**: LeiriTech's `payment_milestones` must be understood strictly as **internal financial tracking / forecasting** (contracted amount, received amount, pending amount, expected dates) — it must NOT attempt to generate anything resembling a legal invoice, invoice number, or fiscal document. The actual invoice document must continue to be issued by LeiriTech's certified accounting/invoicing system (e.g., their existing Portuguese accounting software), with LeiriTech's payment milestone acting purely as an internal "we expect/received €X on this date for this deliverable" record that a human reconciles against the real invoice. Any UI copy or PDF export in LeiriTech referencing "invoice" should be avoided in favor of "payment milestone" / "marco de pagamento" to avoid implying fiscal validity.

## Competitor Landscape

| Competitor | Key Features | Strengths | Weaknesses (relative to LeiriTech's goals) |
|---|---|---|---|
| **Scoro** | Full CRM (deal stages, quote send/track), project delivery, billing/invoicing, reporting, 2-way accounting sync | Most "complete business OS" positioning; strong CRM+quoting | Heavier, more configuration surface than a lean internal tool needs; per-user pricing model irrelevant to LeiriTech (internal, not sold) |
| **Productive** | Best-in-class resourcing (scheduler, utilization reports, capacity forecasting), time tracking, budgeting, profitability focus, modern UI, fast adoption | Closest functional analogue to LeiriTech's project+time+capacity core; validates that deep resourcing/utilization views are the differentiator worth investing engineering effort in | CRM is "basic" — validates that LeiriTech's lighter CRM (companies/contacts/interactions, no marketing automation) is an appropriate, not under-built, scope |
| **Kantata (formerly Mavenlink)** | Enterprise-grade resource optimization, portfolio-level forecasting, 1,200+ integrations, no native CRM | Confirms CRM and delivery are often separate concerns even in mature PSA products (Kantata doesn't even try to do CRM well) | Requires heavy training/onboarding — a caution for LeiriTech: keep the UI simpler since it's a small internal team, not an enterprise rollout |
| **Teamwork / Monday / ClickUp / Jira** | Generic task/Kanban PM, some billing add-ons bolted on | Familiar, flexible | Explicitly what LeiriTech is reacting against ("no bloat like...") — these tools lack native commercial-pipeline-to-delivery continuity and true profitability tracking without heavy customization/add-ons, validating LeiriTech's premise |
| **BigTime / Deltek / Rocketlane** | Time/expense-heavy PSA (BigTime), enterprise services ERP (Deltek), client-facing onboarding/implementation tracking (Rocketlane) | Reinforce industry-standard vocabulary: quote-to-cash, utilization, milestone billing, RAG status | Not directly comparable (Rocketlane is client-facing portal-centric, which LeiriTech explicitly excludes) |

**Table-stakes features validated by competitor research** (LeiriTech should treat these as non-negotiable quality bars, already in MVP scope): pipeline with stage-based probability, won→project handoff without re-entry, single-timer time tracking, billable/non-billable split, capacity/utilization view, milestone-based payment tracking, project health indicator.

**Explicitly differentiating/excluded features** (confirmed correctly out of scope for LeiriTech): multi-tenant CRM marketing automation, CPQ/configurable quoting engines, native invoicing/accounting sync, client-facing portals, Gantt charts, 1000+ integrations. These are enterprise-PSA or agency-selling-software features irrelevant to a single internal shop.

## Standard Workflows

### Workflow 1: Commercial Pipeline (Opportunity Lifecycle)

**Industry standard process:**
1. **First contact / Lead** — a prospect or referral enters the pipeline, minimal data captured (company, contact, source).
2. **Qualification** — Gestor/Manager confirms budget, authority, need, timeline (BANT-style, informally).
3. **Proposal stage** — proposal drafted and sent; this is the highest-effort, most failure-prone stage industry-wide (proposals stall in draft).
4. **Negotiation / Verbal commitment** — terms discussed, near-close.
5. **Won** — triggers project spin-up.
6. **Lost** — archived with a loss reason (industry best practice: always capture a loss reason field, even freeform, for later pipeline-stage tuning).

**Standard state machine:**
```
Lead → Qualification → Proposal Sent → Negotiation → Won
                                              ↓
                                            Lost (from any stage)
```

**Business rules (universal in this domain):**
- Stages represent **buyer progress**, never internal rep activity ("called twice" is not a stage).
- Each stage should carry a default win-probability %, ideally recalibrated from historical won/lost data after enough volume, not left as an arbitrary guess forever.
- "Lost" must be reachable from any active stage, and always requires a reason code/note — this is the #1 data industry teams regret not capturing.
- A deal should not silently sit in a stage indefinitely — stale-opportunity flagging (e.g., "no activity in N days") is standard and maps well to LeiriTech's "Atenção necessária" panel.

### Workflow 2: Won-Deal → Project Conversion

**Industry standard process:**
1. Deal marked Won.
2. System pre-fills a new project record from: the opportunity's company/contact, the proposal's scope/value, and a selected project template (phases/tasks).
3. A Gestor/Administrador reviews and confirms the pre-filled project (adjusts phases, assigns team, sets payment milestones from proposal value).
4. Project enters active delivery state; commercial entities (opportunity, proposal) remain linked/read-only for history but are no longer edited.

**Business rules (universal in this domain):**
- **No re-entry of scope/value/contact data** — this hand-off is the single most common integration gap PSA vendors solve for (Kantata/Scoro/Productive all treat this as first-class). LeiriTech's design already reflects this correctly.
- The originating opportunity and proposal should remain permanently linked to the project for audit/history (e.g., "why did we scope 200 hours" traceability), not deleted or orphaned.
- Payment milestones on the project should default from the proposal's total value/terms if the proposal specified a payment schedule, reducing duplicate financial data entry.

### Workflow 3: Project Delivery, Health, and Templates

**Industry standard process:**
1. Project created from template → phases and starter tasks pre-populated.
2. Team assigned per phase/role, tasks broken down with checklists, blockers/dependencies marked.
3. Health status (RAG) reviewed at least weekly by the PM/Gestor.
4. Milestones (delivery milestones — not payment milestones, though the two are often coupled 1:1) mark phase completion, sometimes gating client sign-off.

**Standard state machine (project health):**
```
Green (on track) → Amber (at risk: schedule/budget/scope variance) → Red (critical: needs escalation)
        ↑_____________________________________________________________|
        (recoverable — status can move back to Green after remediation)
```

**Business rules (universal in this domain):**
- RAG/health status should be **auto-suggested from objective signals** (overdue tasks, milestone slippage, budget burn vs. plan, blocked-task count) but a human (PM/Gestor) should be able to **override with a reason** before it's "published" on dashboards — pure automation without human confirmation is explicitly discouraged in PM literature because it lacks the "why" and the recovery plan context stakeholders need.
- Templates should provide a **consistent skeleton (phases, gate structure) org-wide** while allowing task-level customization per project — rigid full-template enforcement causes adoption resistance; too much freedom causes inconsistent delivery data. LeiriTech's `project_templates`/`template_phases`/`template_tasks` model matches this "skeleton + customizable detail" pattern.
- Blockers/dependencies must be **visually distinct** on the Kanban/list view (not just a hidden field) — this is a near-universal finding across Kanban best-practice sources, and validates prioritizing blocker visibility in LeiriTech's task UI and dashboard panel.

### Workflow 4: Time Tracking (Billable/Non-billable)

**Industry standard process:**
1. User starts a timer when beginning task work; stops when switching tasks.
2. Manual entries permitted for retroactive/offline work, always requiring project/task attribution.
3. Each entry flagged billable or non-billable at the time of entry (not backfilled later, which introduces errors).
4. Aggregated into utilization reports (per person, per team, per project).

**Business rules (universal in this domain):**
- **Single active timer per user** is the correct, industry-validated UX pattern (Toggl, Harvest, Clockify, Memtime all default to this) — running multiple simultaneous timers is a data-integrity anti-pattern the industry actively designs against, confirming LeiriTech's "single active timer" constraint is correct, not a limitation to loosen.
- Real-time timer tracking is measurably more accurate than end-of-day/end-of-week recall — literature cites 10–25% billable-hour loss from delayed logging. This supports nudging users toward timers over pure manual entry, though manual entry must remain available for offline/forgotten cases.
- Billable/non-billable should be set at entry time, defaulting from the task/project's billable nature where possible, to reduce friction and misclassification.

### Workflow 5: Resourcing / Capacity & Workload

**Industry standard process:**
1. Each person's gross capacity (contracted hours, e.g., 40h/week) is reduced by known non-project time (PTO, meetings, admin — "culture hours") to get net delivery capacity.
2. Assigned task/project load is compared against net capacity to compute over/under-allocation.
3. Visualized via heatmap (color intensity) rather than raw numbers alone, for fast scanning by managers.
4. Utilization rate = billable hours ÷ available hours, tracked per person/team over time, benchmarked against role-specific targets.

**Business rules (universal in this domain):**
- Utilization targets are **role-dependent**, not flat: delivery/engineering roles target ~75–80%, management/leadership roles target ~35–50% (they have inherent non-billable overhead: reviews, 1:1s, sales support). A single global target % for all roles is a common and incorrect simplification.
- Availability states (e.g., available / at-capacity / over-allocated / away) should be derived, not just manually toggled — deriving from actual assigned load vs. capacity keeps the signal trustworthy; purely manual status setting drifts out of sync quickly.

### Workflow 6: Payment Milestones & Margin (internal financial tracking only)

**Industry standard process:**
1. Payment milestones are defined at project setup (often 1:1 with proposal payment terms or delivery phases): e.g., 30% on signature, 40% at mid-project milestone, 30% on delivery.
2. Each milestone tracks: contracted amount, expected/trigger date, actual received date/amount, status (pending/invoiced-externally/received/overdue).
3. Margin is estimated continuously (budget vs. actual cost-to-date, usually cost = time entries × internal cost rate), not just calculated retrospectively at project close.

**Business rules (universal in this domain):**
- Every milestone must define, per best practice: what constitutes completion, who confirms it, and what amount it triggers — vague milestone names ("Phase 2 payment") without completion criteria are a recurring cause of billing disputes industry-wide. LeiriTech's UI should require/encourage a completion criterion field per payment milestone, not just a label and amount.
- Margin/profitability should treat "budget vs actuals" as a **live, continuous** view connected to time tracking, not a report generated once at project close — this directly supports LeiriTech's dashboard-driven, ongoing "margin estimation" rather than a static end-of-project calculation.
- Reiterating the compliance boundary: these are internal projections/reconciliation aids, never legal invoices.

## Common Pitfalls

1. **Treating pipeline stages as activity log, not buyer state** — leads to unreliable forecasting (probability becomes meaningless because stages don't reflect real deal progress). LeiriTech must define stage exit criteria, not just stage names.
2. **Duplicate data entry at the won→project handoff** — the single most common integration failure across PSA tools; if LeiriTech's spin-up doesn't fully carry over contact/scope/value data, users will route around the system with spreadsheets, defeating the product's purpose.
3. **Flat utilization targets applied to every role** — produces false "underperformance" alerts on managers/leads who structurally have less billable time; LeiriTech's capacity/workload view should differentiate targets by role.
4. **Fully automated health status with no human override** — auto-computed RAG status without a human-confirmed "why" and recovery plan erodes trust in the dashboard; teams start ignoring it. LeiriTech should keep health as "auto-suggested, human-confirmed."
5. **Vague payment milestones without completion criteria** — causes billing disputes and stalled cash flow; every milestone needs an explicit completion definition and confirmer, not just a label/amount/date.
6. **End-of-day/end-of-week time logging instead of real-time timers** — measurable revenue leakage (10–25% of billable time lost to recall gaps); LeiriTech's single-active-timer design should be promoted as the default behavior, with manual entry as the fallback, not the primary path.
7. **Multiple simultaneous timers per user** — a data-integrity anti-pattern; LeiriTech's single-timer constraint is correct and should not be "relaxed" for user convenience requests, since it breaks utilization math.
8. **Blockers/dependencies hidden in a detail field rather than surfaced visually** — teams miss blocked work until it's already late; blockers need first-class visual treatment on boards and in daily/dashboard views.
9. **Confusing internal payment-milestone tracking with legal invoicing** — given Portugal's SAF-T/certified-software regime, any UI/PDF output that looks like an invoice (sequential invoice numbers, tax breakdowns, ATCUD-style codes) risks legal exposure; LeiriTech must keep strict, visible separation between "payment milestone" (internal tracking) and the actual invoice issued by certified accounting software.
10. **Over-building the CRM/proposal side into a full quoting/document-editor engine** — competitor research shows even mature PSA tools (Productive) deliberately keep CRM/quoting "basic" and let dedicated tools handle heavy quoting; LeiriTech's decision to store proposal metadata + generate a PDF (no in-app document editor) matches the leaner, appropriate scope observed industry-wide, not an under-build.
11. **Retaining stale contact/company data indefinitely** — a common GDPR compliance gap; LeiriTech should support identifying/archiving contacts with no activity, even if full automated deletion isn't MVP.

## Recommendations for Our App
*(How in-scope features should behave per industry standard — no new features proposed, scope boundaries respected)*

1. **Pipeline stages must encode buyer-progress exit criteria**, and each stage should carry an editable win-probability the Administrador can recalibrate from historical won/lost data over time — because CRM literature consistently identifies rep-activity-based stages as the top cause of unreliable forecasting.
2. **Won→project spin-up must be a true zero-re-entry handoff**: company, contacts, proposal scope/value, and payment terms should pre-fill the project and its payment milestones automatically, with the source opportunity/proposal remaining permanently linked for audit — because this is the highest-value, most-differentiating workflow across every competitor studied.
3. **Project health should be auto-suggested from objective signals (overdue tasks, milestone slippage, budget burn, blocked-task count) but require human confirmation before being "published"** on the dashboard — because PM literature is unanimous that fully automated RAG status without a human-supplied reason/recovery-plan erodes stakeholder trust.
4. **Utilization/capacity targets should be configurable per role**, not a single global percentage — because engineers (~75–80% target) and managers (~35–50% target) have structurally different non-billable overhead, per Scoro/Parakeeto/Float benchmark data.
5. **Every payment milestone should require a completion-criteria field** (what confirms it's done, who confirms it) alongside amount and date — because vague milestone definitions are a recurring documented cause of billing disputes.
6. **The single-active-timer constraint should be preserved as designed, not loosened** — this matches every major time-tracking product (Toggl, Harvest, Clockify, Memtime) and protects utilization-data integrity; billable/non-billable should default from the task's nature at entry time to reduce misclassification.
7. **Blockers/dependencies need first-class visual treatment** (distinct color/badge on Kanban and list views, surfaced in the "Atenção necessária" panel) rather than being a buried field — matching near-universal Kanban best practice.
8. **Payment-milestone UI/exports must avoid any invoice-like presentation** (no sequential invoice numbering, no tax fields, no "invoice" terminology) to keep clear legal separation from Portugal's SAF-T/certified-invoicing regime — this is a compliance boundary, not a feature gap; the actual invoice remains the responsibility of LeiriTech's certified accounting system.
9. **Contact/company records should support an archive/inactive marker** for GDPR storage-limitation hygiene, actionable by an Administrador — a lightweight compliance safeguard consistent with LeiriTech's existing role-based access design, not a new subsystem.
10. **Templates should provide a consistent phase/gate skeleton with customizable task-level detail** — matching the "core skeleton + flexible detail" pattern that adoption-successful agencies use, avoiding both rigid over-enforcement and inconsistent free-for-all project structures.

## Sources
- [Workday: Professional Services Automation Overview](https://www.workday.com/en-us/products/professional-services-automation/overview.html)
- [BigTime: PSA Software Guide 2026](https://www.bigtime.net/blogs/what-is-psa-software/)
- [Planview: Quote-to-Cash Process Guide](https://www.planview.com/resources/guide/professional-services-automation-guide/6-steps-quote-to-cash-process/)
- [Scoro: Productive vs Scoro](https://www.scoro.com/productive-vs-scoro/)
- [Scoro: Kantata vs Scoro](https://www.scoro.com/kantata-vs-scoro/)
- [Ravetree: Kantata vs Productive](https://www.ravetree.com/blog/kantata-vs-productive-strengths-and-weaknesses)
- [Scoro: 7 PSA Software Examples](https://www.scoro.com/blog/psa-software-examples/)
- [HubSpot: Sales Pipeline Guide](https://blog.hubspot.com/sales/sales-pipeline)
- [ORM Tech: How to Define Sales Pipeline Stages](https://orm-tech.com/blog/how-to-define-pipeline-stages/)
- [Prospect CRM: Managing CRM Opportunity Stages](https://www.prospectsoft.com/resources/blog/6-best-practices-for-defining-managing-crm-opportunity-stages/)
- [Mastt: Project RAG Status Dashboard](https://www.mastt.com/blogs/project-rag-status-dashboard)
- [Eleco: Project RAG Status Meanings And Best Practice](https://eleco.com/pm3/knowledge-centre/how-many-rags/)
- [Deltek: RAG Status in Project Management](https://www.deltek.com/en/blog/rag-status)
- [Parakeeto: Utilization Rate & Capacity Forecasting Guide](https://www.parakeeto.com/blog/resource-utilization-capacity-planning-for-marketing-agency-2/)
- [Scoro: Billable Utilization Formula & Benchmarks](https://www.scoro.com/blog/billable-utilization/)
- [Productive: Resource Utilization](https://productive.io/blog/resource-utilization/)
- [Accelo: Calculating Resource Utilization](https://www.accelo.com/post/calculating-resource-utilization-billable-utilization-rate)
- [Float: What Is Resource Utilization](https://www.float.com/resources/resource-utilization)
- [Toggl: How to Track Billable Hours](https://toggl.com/blog/how-to-track-billable-hours)
- [Memtime: Billable Hours Tracking Template](https://www.memtime.com/blog/billable-hours-tracking-template-and-alternatives)
- [Teamwork: How to Track Billable Hours](https://www.teamwork.com/blog/track-billable-hours/)
- [NetSuite: What Is Milestone-based Billing](https://www.netsuite.com/portal/resource/articles/accounting/milestone-based-billing.shtml)
- [BQE: Milestone Billing 101](https://www.bqe.com/blog/what-is-milestone-billing-why-your-firm-may-need-a-phased-billing-model)
- [Rocketlane: Project Billing Complete Guide 2026](https://www.rocketlane.com/blogs/project-billing)
- [Usercentrics: CRM and GDPR Compliance Guide](https://usercentrics.com/knowledge-hub/crm-gdpr/)
- [GDPR Local: GDPR CRM Guide](https://gdprlocal.com/gdpr-crm/)
- [DPO Centre: CRM Data Retention and GDPR Compliance](https://www.dpocentre.com/blog/crm-data-retention-gdpr-compliance/)
- [Fiskaly: ATCUD, SAF-T and QES in Portugal](https://www.fiskaly.com/blog/fiscalization-atcud-qes-in-portugal)
- [VATupdate: Portugal's E-Invoicing Rules](https://www.vatupdate.com/2026/05/29/portugals-e-invoicing-rules-certified-software-atcud-qr-codes-and-saf-t/)
- [EDICOM: SAF-T File Requirement in Portugal](https://edicomgroup.com/blog/key-information-about-saft-pt-portugal-declarations)
- [Marosa: Portuguese SAF-T mandatory for non-established businesses](https://marosavat.com/vat-news/portuguese-saf-t)
- [Teamwork: PM Template Customization Guide](https://www.teamwork.com/blog/pm-template-customization/)
- [Kanban Tool Blog: Strategies for Task Dependencies with Kanban](https://kanbantool.com/blog/strategies-for-staying-on-track-of-task-dependencies-with-kanban)
- [Kanban Zone: How to Better Manage Dependencies with Kanban](https://kanbanzone.com/2021/manage-dependencies-with-kanban/)
- [Saviom: What is a Resource Heatmap](https://www.saviom.com/resources/resource-management/articles/resource-heatmap/)
- [Runn: How to Create a Resource Heatmap](https://www.runn.io/blog/resource-heatmap)
- [Meisterplan: Allocation Heatmap for Capacity Planning](https://meisterplan.com/blog/resource-management/allocation-heatmaps-for-capacity-planning/)
- [Retool: Build vs buy guide for internal tools](https://retool.com/blog/build-vs-buy-guide-for-internal-tools)
- [Workamajig: 8 Biggest Mistakes Agencies Make](https://www.workamajig.com/blog/agency-mistakes)
