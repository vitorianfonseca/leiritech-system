"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  FileText,
  FolderPlus,
  Info,
  Layers,
  Trophy,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shell/page-header";
import { CrmField } from "@/components/crm/crm-field";
import { SearchableCombobox, EmptyState, toast, type ComboboxItem } from "@/components/shared";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/session";
import { conversionApi } from "@/lib/api/conversion";
import {
  ConversionError,
  deriveMilestoneDrafts,
  deriveTemplateDefaults,
  sumDrafts,
  todayIso,
  type ConversionContext,
  type MilestoneDraft,
} from "@/lib/api/conversion-types";
import { templatesApi } from "@/lib/api/templates";
import { projectRoutes, PROJECT_MANAGERS } from "@/lib/api/projects";
import { pipelineRoutes } from "@/lib/api/opportunities";
import type { InstantiatedPhaseInput } from "@/lib/api/projects-types";
import { convertDetailsSchema } from "@/lib/validation/conversion-schemas";
import { formatEUR, formatDate, parseEuroToCents, initials } from "@/components/projects/project-format";
import { WizardStepper, type WizardStep } from "./wizard-stepper";

export interface ConvertWizardProps {
  opportunityId: string;
  user: { role: Role; userId: string; paymentsGrant: boolean };
  canFinance: boolean;
}

type StepId = "details" | "template" | "milestones" | "team" | "review";

interface Draft {
  name: string;
  startDate: string;
  contractedValue: string;
  description: string;
  templateId: string;
  dueDate: string;
  hoursBudget: string;
  phases: InstantiatedPhaseInput[];
  milestones: MilestoneDraft[];
  milestonesConfirmed: boolean;
  managerId: string;
  teamMemberIds: string[];
}

const EMPTY_DRAFT: Draft = {
  name: "",
  startDate: todayIso(),
  contractedValue: "",
  description: "",
  templateId: "",
  dueDate: "",
  hoursBudget: "",
  phases: [],
  milestones: [],
  milestonesConfirmed: false,
  managerId: "",
  teamMemberIds: [],
};

export function ConvertWizard({ opportunityId, user, canFinance }: ConvertWizardProps) {
  const t = useTranslations("conversion");
  const tv = useTranslations("conversion.validation");
  const locale = useLocale();
  const router = useRouter();
  const reduce = useReducedMotion();

  const contextQuery = useQuery<ConversionContext, unknown>({
    queryKey: ["conversion", "context", opportunityId, user.role, user.userId, user.paymentsGrant],
    queryFn: () =>
      conversionApi.getContext(opportunityId, {
        role: user.role,
        userId: user.userId,
        paymentsGrant: user.paymentsGrant,
      }),
    retry: false,
  });

  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [furthest, setFurthest] = React.useState(0);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const seededRef = React.useRef(false);

  const update = React.useCallback((patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  // Prefill once the context arrives (BR-035 zero re-entry).
  React.useEffect(() => {
    const ctx = contextQuery.data;
    if (!ctx || seededRef.current) return;
    seededRef.current = true;
    const value = ctx.suggestedValueCents;
    setDraft((d) => ({
      ...d,
      name: ctx.opportunity.title,
      description: ctx.acceptedProposal
        ? t("details.descriptionFromProposal", { reference: ctx.acceptedProposal.reference })
        : "",
      contractedValue:
        canFinance && value != null ? (value / 100).toFixed(2).replace(".", ",") : "",
      managerId: ctx.opportunity.ownerId || user.userId,
    }));
  }, [contextQuery.data, canFinance, t, user.userId]);

  // Template detail (drives phases / schedule / milestone defaults).
  const templateQuery = useQuery({
    queryKey: ["conversion", "template", draft.templateId],
    queryFn: () => templatesApi.get(draft.templateId),
    enabled: draft.templateId.length > 0,
  });

  const lastSeededTemplate = React.useRef<string>("");
  React.useEffect(() => {
    const detail = templateQuery.data;
    if (!detail || lastSeededTemplate.current === detail.id) return;
    lastSeededTemplate.current = detail.id;
    const { phases, dueDate, hoursBudget } = deriveTemplateDefaults(detail, draft.startDate);
    const contractedValueCents =
      canFinance && draft.contractedValue ? parseEuroToCents(draft.contractedValue) : null;
    const milestones = canFinance
      ? deriveMilestoneDrafts(detail, contractedValueCents, draft.startDate, {
          finalPayment: t("milestones.finalPaymentLabel"),
          criteria: (phase) => t("milestones.defaultCriteria", { phase }),
        })
      : [];
    setDraft((d) => ({
      ...d,
      phases,
      dueDate: dueDate || d.dueDate,
      hoursBudget: hoursBudget ? String(hoursBudget) : d.hoursBudget,
      milestones,
      milestonesConfirmed: false,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateQuery.data]);

  // ---- Steps (milestones step is finance-gated) -------------------------
  const steps: { id: StepId; label: string }[] = React.useMemo(() => {
    const base: { id: StepId; label: string }[] = [
      { id: "details", label: t("steps.details") },
      { id: "template", label: t("steps.template") },
    ];
    if (canFinance) base.push({ id: "milestones", label: t("steps.milestones") });
    base.push({ id: "team", label: t("steps.team") }, { id: "review", label: t("steps.review") });
    return base;
  }, [canFinance, t]);

  const stepperSteps: WizardStep[] = steps.map((s) => ({ id: s.id, label: s.label }));
  const currentStep = steps[stepIndex]?.id ?? "details";

  const ctx = contextQuery.data;

  // ---- Guard / loading states -------------------------------------------
  if (contextQuery.isError) {
    const err = contextQuery.error;
    return <ConversionGuard error={err} opportunityId={opportunityId} />;
  }
  if (contextQuery.isPending || !ctx) {
    return <WizardSkeleton />;
  }

  const isVerbalClose = ctx.acceptedProposal === null;
  const requireValue = canFinance && isVerbalClose;
  const contractedValueCents =
    canFinance && draft.contractedValue ? parseEuroToCents(draft.contractedValue) : null;

  // ---- Per-step validation ----------------------------------------------
  function validateStep(step: StepId): boolean {
    const next: Record<string, string> = {};
    if (step === "details") {
      const res = convertDetailsSchema((k) => tv(k), requireValue).safeParse({
        name: draft.name,
        startDate: draft.startDate,
        contractedValue: draft.contractedValue,
      });
      if (!res.success) {
        for (const issue of res.error.issues) {
          const key = issue.path.join(".") || "root";
          if (!next[key]) next[key] = issue.message;
        }
      }
    } else if (step === "template") {
      if (!draft.templateId) next.templateId = tv("templateRequired");
      else if (templateQuery.isPending) next.templateId = tv("templateLoading");
    } else if (step === "milestones") {
      const invalid = draft.milestones.some(
        (m) => !m.description.trim() || !m.expectedDate || !m.completionCriteria.trim() || m.amountCents < 0
      );
      if (invalid) next.milestones = tv("milestonesInvalid");
      if (!draft.milestonesConfirmed) next.milestonesConfirmed = tv("milestonesConfirmRequired");
    } else if (step === "team") {
      if (!draft.managerId) next.managerId = tv("managerRequired");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (!validateStep(currentStep)) return;
    const nextIndex = Math.min(stepIndex + 1, steps.length - 1);
    setStepIndex(nextIndex);
    setFurthest((f) => Math.max(f, nextIndex));
    setErrors({});
  }
  function goBack() {
    setStepIndex((i) => Math.max(0, i - 1));
    setErrors({});
  }
  function jumpTo(index: number) {
    if (index <= furthest) {
      setStepIndex(index);
      setErrors({});
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href={pipelineRoutes.opportunity(opportunityId)}
        className="inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden />
        {t("back")}
      </Link>

      <PageHeader title={t("title")} subtitle={t("subtitle", { title: ctx.opportunity.title })} />

      {/* Source banner — BR-036 links preserved, read-only */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-signal/25 bg-signal-muted/50 px-4 py-3 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <Trophy className="size-4 text-signal" strokeWidth={1.8} aria-hidden />
          {t("source.won")}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Building2 className="size-4" strokeWidth={1.6} aria-hidden />
          {ctx.company.name}
        </span>
        {ctx.acceptedProposal ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <FileText className="size-4" strokeWidth={1.6} aria-hidden />
            {t("source.proposal", { reference: ctx.acceptedProposal.reference })}
          </span>
        ) : (
          <Badge variant="warning" className="gap-1">
            <TriangleAlert className="size-3.5" strokeWidth={1.8} aria-hidden />
            {t("source.verbalClose")}
          </Badge>
        )}
      </div>

      <WizardStepper
        steps={stepperSteps}
        current={stepIndex}
        furthest={furthest}
        onStepClick={jumpTo}
        labels={{ stepOf: (n, total) => t("stepOf", { n, total }) }}
      />

      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          {currentStep === "details" ? (
            <StepDetails
              ctx={ctx}
              draft={draft}
              update={update}
              errors={errors}
              canFinance={canFinance}
              requireValue={requireValue}
              locale={locale}
            />
          ) : currentStep === "template" ? (
            <StepTemplate ctx={ctx} draft={draft} update={update} errors={errors} loading={templateQuery.isPending} />
          ) : currentStep === "milestones" ? (
            <StepMilestones
              draft={draft}
              update={update}
              errors={errors}
              locale={locale}
              contractedValueCents={contractedValueCents}
            />
          ) : currentStep === "team" ? (
            <StepTeam draft={draft} update={update} errors={errors} />
          ) : (
            <StepReview
              ctx={ctx}
              draft={draft}
              canFinance={canFinance}
              contractedValueCents={contractedValueCents}
              locale={locale}
              opportunityId={opportunityId}
              user={user}
              reduce={!!reduce}
              onCreated={(id) => router.push(projectRoutes.detail(id))}
            />
          )}
        </CardContent>
      </Card>

      {currentStep !== "review" ? (
        <div className="flex max-w-3xl items-center justify-between">
          <Button type="button" variant="ghost" size="lg" onClick={goBack} disabled={stepIndex === 0}>
            <ArrowLeft aria-hidden />
            {t("nav.back")}
          </Button>
          <Button type="button" size="lg" onClick={goNext}>
            {t("nav.next")}
            <ArrowRight aria-hidden />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ====================================================================== *
 * Step 1 — Details (pre-filled, all editable; verbal-close value required)
 * ====================================================================== */

function StepDetails({
  ctx,
  draft,
  update,
  errors,
  canFinance,
  requireValue,
  locale,
}: {
  ctx: ConversionContext;
  draft: Draft;
  update: (p: Partial<Draft>) => void;
  errors: Record<string, string>;
  canFinance: boolean;
  requireValue: boolean;
  locale: string;
}) {
  const t = useTranslations("conversion.details");
  return (
    <div className="flex flex-col gap-4">
      <SectionTitle icon={Info} title={t("title")} hint={t("hint")} />

      <CrmField label={t("name")} required error={errors.name}>
        {({ controlProps }) => (
          <Input
            {...controlProps}
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder={t("namePlaceholder")}
          />
        )}
      </CrmField>

      {/* Company (read-only, pre-filled) */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">{t("company")}</span>
        <div className="flex items-center justify-between rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" strokeWidth={1.6} aria-hidden />
            {ctx.company.name}
          </span>
          {ctx.company.clienteAtivo ? (
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="size-3.5" strokeWidth={1.8} aria-hidden />
              {t("clienteAtivo")}
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Contacts (read-only preview) */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">{t("contacts")}</span>
        {ctx.contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noContacts")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {ctx.contacts.slice(0, 4).map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
                  {initials(c.name)}
                </span>
                <span className="text-foreground">{c.name}</span>
                {c.role ? <span className="text-muted-foreground">· {c.role}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CrmField label={t("startDate")} required error={errors.startDate}>
          {({ controlProps }) => (
            <Input
              {...controlProps}
              type="date"
              value={draft.startDate}
              onChange={(e) => update({ startDate: e.target.value })}
            />
          )}
        </CrmField>
        {canFinance ? (
          <CrmField
            label={t("value")}
            required={requireValue}
            error={errors.contractedValue}
            hint={requireValue ? t("valueVerbalHint") : t("valueHint")}
          >
            {({ controlProps }) => (
              <Input
                {...controlProps}
                inputMode="decimal"
                value={draft.contractedValue}
                onChange={(e) => update({ contractedValue: e.target.value })}
                placeholder={t("valuePlaceholder")}
              />
            )}
          </CrmField>
        ) : null}
      </div>

      {canFinance && ctx.acceptedProposal?.valueCents != null ? (
        <p className="text-xs text-muted-foreground">
          {t("proposalValue", { value: formatEUR(ctx.acceptedProposal.valueCents, locale) })}
        </p>
      ) : null}

      <CrmField label={t("description")} error={errors.description}>
        {({ controlProps }) => (
          <textarea
            {...controlProps}
            value={draft.description}
            onChange={(e) => update({ description: e.target.value })}
            rows={3}
            placeholder={t("descriptionPlaceholder")}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
          />
        )}
      </CrmField>
    </div>
  );
}

/* ====================================================================== *
 * Step 2 — Template
 * ====================================================================== */

function StepTemplate({
  ctx,
  draft,
  update,
  errors,
  loading,
}: {
  ctx: ConversionContext;
  draft: Draft;
  update: (p: Partial<Draft>) => void;
  errors: Record<string, string>;
  loading: boolean;
}) {
  const t = useTranslations("conversion.template");
  return (
    <div className="flex flex-col gap-4">
      <SectionTitle icon={Layers} title={t("title")} hint={t("hint")} />

      {ctx.templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <div role="radiogroup" aria-label={t("title")} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ctx.templates.map((tpl) => {
            const selected = draft.templateId === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => update({ templateId: tpl.id })}
                className={cn(
                  "flex flex-col gap-1.5 rounded-lg border p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-signal bg-signal-muted/40 ring-1 ring-signal" : "border-border hover:bg-accent"
                )}
              >
                <span className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{tpl.name}</span>
                  {selected ? <Check className="size-4 text-signal" strokeWidth={2.2} aria-hidden /> : null}
                </span>
                <span className="text-xs text-muted-foreground">{tpl.description}</span>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{t("phaseCount", { count: tpl.phaseCount })}</Badge>
                  <Badge variant="outline">{t("taskCount", { count: tpl.taskCount })}</Badge>
                  <Badge variant="outline">{t("hours", { hours: tpl.totalEstimateHours })}</Badge>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {errors.templateId ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.templateId}
        </p>
      ) : null}

      {draft.templateId && !loading && draft.phases.length > 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="mb-2 text-sm font-medium text-foreground">{t("preview")}</p>
          <ol className="flex flex-col gap-1.5">
            {draft.phases.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold tabular-nums text-secondary-foreground">
                    {i + 1}
                  </span>
                  {p.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("tasksLabel", { count: p.tasksTotal })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

/* ====================================================================== *
 * Step 3 — Payment milestones (finance-gated, must be confirmed BR-037)
 * ====================================================================== */

function StepMilestones({
  draft,
  update,
  errors,
  locale,
  contractedValueCents,
}: {
  draft: Draft;
  update: (p: Partial<Draft>) => void;
  errors: Record<string, string>;
  locale: string;
  contractedValueCents: number | null;
}) {
  const t = useTranslations("conversion.milestones");

  function patchRow(key: string, patch: Partial<MilestoneDraft>) {
    update({
      milestones: draft.milestones.map((m) => (m.key === key ? { ...m, ...patch } : m)),
      milestonesConfirmed: false,
    });
  }
  function removeRow(key: string) {
    update({
      milestones: draft.milestones.filter((m) => m.key !== key),
      milestonesConfirmed: false,
    });
  }
  function addRow() {
    update({
      milestones: [
        ...draft.milestones,
        {
          key: `ms-${Math.random().toString(36).slice(2, 9)}`,
          description: "",
          amountCents: 0,
          expectedDate: draft.startDate || todayIso(),
          completionCriteria: "",
        },
      ],
      milestonesConfirmed: false,
    });
  }

  const total = sumDrafts(draft.milestones);
  const target = contractedValueCents ?? 0;
  const mismatch = target > 0 && total !== target;

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle icon={Wallet} title={t("title")} hint={t("hint")} />

      {draft.milestones.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {draft.milestones.map((m, i) => (
            <li key={m.key} className="rounded-lg border border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{t("rowLabel", { n: i + 1 })}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(m.key)}
                  aria-label={t("remove")}
                >
                  {t("remove")}
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <CrmField label={t("description")} required>
                  {({ controlProps }) => (
                    <Input
                      {...controlProps}
                      value={m.description}
                      onChange={(e) => patchRow(m.key, { description: e.target.value })}
                      placeholder={t("descriptionPlaceholder")}
                    />
                  )}
                </CrmField>
                <CrmField label={t("amount")} required>
                  {({ controlProps }) => (
                    <Input
                      {...controlProps}
                      inputMode="decimal"
                      defaultValue={(m.amountCents / 100).toFixed(2).replace(".", ",")}
                      onChange={(e) =>
                        patchRow(m.key, { amountCents: parseEuroToCents(e.target.value) ?? 0 })
                      }
                      placeholder="0,00"
                    />
                  )}
                </CrmField>
                <CrmField label={t("expectedDate")} required>
                  {({ controlProps }) => (
                    <Input
                      {...controlProps}
                      type="date"
                      value={m.expectedDate}
                      onChange={(e) => patchRow(m.key, { expectedDate: e.target.value })}
                    />
                  )}
                </CrmField>
                <CrmField label={t("criteria")} required hint={t("criteriaHint")}>
                  {({ controlProps }) => (
                    <Input
                      {...controlProps}
                      value={m.completionCriteria}
                      onChange={(e) => patchRow(m.key, { completionCriteria: e.target.value })}
                      placeholder={t("criteriaPlaceholder")}
                    />
                  )}
                </CrmField>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          {t("add")}
        </Button>
        <span className="text-sm tabular-nums text-muted-foreground">
          {t("total", { total: formatEUR(total, locale) })}
        </span>
      </div>

      {mismatch ? (
        <div
          role="note"
          className="flex items-start gap-2 rounded-lg bg-warning-muted px-3 py-2.5 text-xs text-warning-foreground"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} aria-hidden />
          <span>{t("mismatch", { target: formatEUR(target, locale), total: formatEUR(total, locale) })}</span>
        </div>
      ) : null}

      {errors.milestones ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.milestones}
        </p>
      ) : null}

      {/* BR-037 confirmation gate */}
      <label className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-sm">
        <input
          type="checkbox"
          checked={draft.milestonesConfirmed}
          onChange={(e) => update({ milestonesConfirmed: e.target.checked })}
          className="mt-0.5 size-4 accent-signal"
          aria-describedby="ms-confirm-hint"
        />
        <span>
          <span className="font-medium text-foreground">{t("confirmLabel")}</span>
          <span id="ms-confirm-hint" className="mt-0.5 block text-xs text-muted-foreground">
            {t("confirmHint")}
          </span>
        </span>
      </label>
      {errors.milestonesConfirmed ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.milestonesConfirmed}
        </p>
      ) : null}
    </div>
  );
}

/* ====================================================================== *
 * Step 4 — Team
 * ====================================================================== */

function StepTeam({
  draft,
  update,
  errors,
}: {
  draft: Draft;
  update: (p: Partial<Draft>) => void;
  errors: Record<string, string>;
}) {
  const t = useTranslations("conversion.team");
  const managerOptions: ComboboxItem[] = PROJECT_MANAGERS.map((m) => ({ value: m.id, label: m.name }));
  const memberPool = PROJECT_MANAGERS.filter((m) => m.id !== draft.managerId);

  function toggleMember(id: string) {
    const has = draft.teamMemberIds.includes(id);
    update({
      teamMemberIds: has
        ? draft.teamMemberIds.filter((x) => x !== id)
        : [...draft.teamMemberIds, id],
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle icon={Users} title={t("title")} hint={t("hint")} />

      <CrmField label={t("manager")} required error={errors.managerId}>
        {({ controlProps }) => (
          <SearchableCombobox
            id={controlProps.id}
            aria-label={t("manager")}
            items={managerOptions}
            value={draft.managerId || null}
            placeholder={t("managerPlaceholder")}
            emptyMessage={t("noManagers")}
            onValueChange={(v) =>
              update({
                managerId: v ?? "",
                teamMemberIds: draft.teamMemberIds.filter((x) => x !== v),
              })
            }
          />
        )}
      </CrmField>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">{t("members")}</span>
        <p className="text-xs text-muted-foreground">{t("membersHint")}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {memberPool.map((m) => {
            const checked = draft.teamMemberIds.includes(m.id);
            return (
              <label
                key={m.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors",
                  checked ? "border-signal bg-signal-muted/30" : "border-border hover:bg-accent"
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleMember(m.id)}
                  className="size-4 accent-signal"
                />
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
                  {initials(m.name)}
                </span>
                {m.name}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ====================================================================== *
 * Step 5 — Review + create (success animation)
 * ====================================================================== */

function StepReview({
  ctx,
  draft,
  canFinance,
  contractedValueCents,
  locale,
  opportunityId,
  user,
  reduce,
  onCreated,
}: {
  ctx: ConversionContext;
  draft: Draft;
  canFinance: boolean;
  contractedValueCents: number | null;
  locale: string;
  opportunityId: string;
  user: { role: Role; userId: string; paymentsGrant: boolean };
  reduce: boolean;
  onCreated: (projectId: string) => void;
}) {
  const t = useTranslations("conversion.review");
  const [done, setDone] = React.useState(false);

  const managerName = PROJECT_MANAGERS.find((m) => m.id === draft.managerId)?.name ?? draft.managerId;
  const memberNames = draft.teamMemberIds
    .map((id) => PROJECT_MANAGERS.find((m) => m.id === id)?.name)
    .filter(Boolean) as string[];

  const mutation = useMutation({
    mutationFn: () =>
      conversionApi.convert(
        {
          opportunityId,
          proposalId: ctx.acceptedProposal?.id ?? null,
          name: draft.name.trim(),
          clientId: ctx.company.id,
          clientName: ctx.company.name,
          managerId: draft.managerId,
          teamMemberIds: draft.teamMemberIds,
          templateId: draft.templateId,
          phases: draft.phases,
          startDate: draft.startDate,
          dueDate: draft.dueDate || draft.startDate,
          hoursBudget: Number(draft.hoursBudget) || 0,
          contractedValueCents,
          description: draft.description,
          milestones: canFinance ? draft.milestones : [],
          paymentMilestonesConfirmed: canFinance ? draft.milestonesConfirmed : false,
        },
        { role: user.role, userId: user.userId, paymentsGrant: user.paymentsGrant }
      ),
    onSuccess: (project) => {
      setDone(true);
      toast({ tone: "success", title: t("createdToast", { name: project.name }) });
      const delayMs = reduce ? 0 : 700;
      window.setTimeout(() => onCreated(project.id), delayMs);
    },
    onError: () => {
      toast({ tone: "destructive", title: t("errorToast") });
    },
  });

  if (done) {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <motion.span
          initial={reduce ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 18 }}
          className="flex size-16 items-center justify-center rounded-full bg-success-muted text-success"
        >
          <CheckCircle2 className="size-8" strokeWidth={1.8} aria-hidden />
        </motion.span>
        <p className="mt-4 font-heading text-lg font-semibold text-foreground">{t("successTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("successSubtitle")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionTitle icon={FolderPlus} title={t("title")} hint={t("hint")} />

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <ReviewRow label={t("name")}>{draft.name}</ReviewRow>
        <ReviewRow label={t("client")}>{ctx.company.name}</ReviewRow>
        <ReviewRow label={t("template")}>
          {ctx.templates.find((x) => x.id === draft.templateId)?.name ?? "—"}
        </ReviewRow>
        <ReviewRow label={t("phases")}>{t("phasesValue", { count: draft.phases.length })}</ReviewRow>
        <ReviewRow label={t("startDate")}>{formatDate(draft.startDate)}</ReviewRow>
        <ReviewRow label={t("dueDate")}>{formatDate(draft.dueDate || draft.startDate)}</ReviewRow>
        {canFinance ? (
          <ReviewRow label={t("value")}>
            {contractedValueCents != null ? formatEUR(contractedValueCents, locale) : "—"}
          </ReviewRow>
        ) : null}
        {canFinance ? (
          <ReviewRow label={t("milestones")}>
            {t("milestonesValue", { count: draft.milestones.length })}
          </ReviewRow>
        ) : null}
        <ReviewRow label={t("manager")}>{managerName}</ReviewRow>
        <ReviewRow label={t("members")}>
          {memberNames.length ? memberNames.join(", ") : t("noMembers")}
        </ReviewRow>
      </dl>

      {/* BR-036 preserved links */}
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
        <p className="mb-1.5 font-medium text-foreground">{t("linksTitle")}</p>
        <ul className="flex flex-col gap-1 text-muted-foreground">
          <li className="inline-flex items-center gap-1.5">
            <Trophy className="size-3.5 text-signal" strokeWidth={1.8} aria-hidden />
            {t("linkOpportunity", { title: ctx.opportunity.title })}
          </li>
          {ctx.acceptedProposal ? (
            <li className="inline-flex items-center gap-1.5">
              <FileText className="size-3.5" strokeWidth={1.6} aria-hidden />
              {t("linkProposal", { reference: ctx.acceptedProposal.reference })}
            </li>
          ) : null}
          <li className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-success" strokeWidth={1.8} aria-hidden />
            {t("linkClient", { name: ctx.company.name })}
          </li>
        </ul>
      </div>

      <div className="flex justify-end">
        <Button type="button" size="lg" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? (
            t("creating")
          ) : (
            <>
              <FolderPlus aria-hidden />
              {t("create")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- helpers */

function SectionTitle({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-1 flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-signal-muted text-signal">
        <Icon className="size-5" strokeWidth={1.8} aria-hidden />
      </span>
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground">{title}</h2>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

function WizardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="space-y-2">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted/70" />
      </div>
      <div className="h-10 w-full max-w-md animate-pulse rounded bg-muted/60" />
      <div className="h-80 w-full max-w-3xl animate-pulse rounded-xl bg-muted/50" />
    </div>
  );
}

function ConversionGuard({ error, opportunityId }: { error: unknown; opportunityId: string }) {
  const t = useTranslations("conversion.guard");
  let title = t("genericTitle");
  let description = t("genericDescription");
  let href = pipelineRoutes.opportunity(opportunityId);
  let cta = t("backToOpportunity");

  if (error instanceof ConversionError) {
    if (error.code === "already_converted") {
      title = t("alreadyTitle");
      description = t("alreadyDescription");
      if (error.projectId) {
        href = projectRoutes.detail(error.projectId);
        cta = t("viewProject");
      }
    } else if (error.code === "not_won") {
      title = t("notWonTitle");
      description = t("notWonDescription");
    }
  }

  return (
    <div className="py-8">
      <EmptyState
        icon={TriangleAlert}
        title={title}
        description={description}
        action={
          <Button size="lg" nativeButton={false} render={<Link href={href} />}>
            {cta}
          </Button>
        }
      />
    </div>
  );
}
