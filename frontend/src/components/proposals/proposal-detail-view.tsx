"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  GitBranch,
  RefreshCw,
  TriangleAlert,
  FileText,
  Send,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ActivityFeed,
  CommentThread,
  ConfirmDialog,
  EmptyState,
  SkeletonCard,
  toast,
  toastWithUndo,
} from "@/components/shared";
import { crmRoutes } from "@/lib/api/crm";
import { pipelineRoutes } from "@/lib/api/opportunities";
import { proposalsApi, proposalCollaborationApi } from "@/lib/api/proposals";
import {
  ProposalError,
  canArchive,
  isPastValidity,
  type Proposal,
  type ProposalErrorCode,
  type RejectProposalInput,
  type ResendProposalInput,
  type UploadPdfInput,
} from "@/lib/api/proposals-types";
import type { Role } from "@/lib/session";
import { PdfUpload } from "./pdf-upload";
import { ProposalContentEditor } from "./proposal-content-editor";
import { ProposalStateBadge } from "./status-badge";
import { SendProposalDialog } from "./send-proposal-dialog";
import { RejectProposalDialog } from "./reject-proposal-dialog";
import { ResendProposalDialog } from "./resend-proposal-dialog";
import { formatEUR, formatDate } from "./proposal-format";

export interface ProposalDetailViewProps {
  proposalId: string;
  user: {
    role: Role;
    userId: string;
    paymentsGrant: boolean;
    name: string;
    avatarUrl: string | null;
  };
}

export function ProposalDetailView({ proposalId, user }: ProposalDetailViewProps) {
  const t = useTranslations("proposals.detail");
  const tErr = useTranslations("proposals.errors");
  const locale = useLocale();
  const qc = useQueryClient();
  const canManage = user.role === "admin" || user.role === "gestor";

  const queryKey = ["proposals", "detail", proposalId, user.role, user.userId, user.paymentsGrant] as const;
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => proposalsApi.getProposal(proposalId, user.role, user.userId, user.paymentsGrant),
    retry: (count, err) => !(err instanceof ProposalError) && count < 1,
  });

  const [sendOpen, setSendOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [resendOpen, setResendOpen] = React.useState(false);
  const [acceptOpen, setAcceptOpen] = React.useState(false);
  const [expireOpen, setExpireOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["proposals"] });
    qc.invalidateQueries({ queryKey: ["collaboration"] });
  }, [qc]);

  const showError = React.useCallback(
    (err: unknown) => {
      const code: ProposalErrorCode =
        err instanceof ProposalError ? err.code : "invalid_transition";
      toast({ tone: "destructive", title: tErr(code) });
    },
    [tErr]
  );

  if (isPending) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <SkeletonCard />
      </div>
    );
  }

  if (isError) {
    const missing =
      error instanceof ProposalError &&
      (error.code === "not_found" || error.code === "forbidden");
    return (
      <div className="space-y-6">
        <BackLink label={t("back")} />
        <EmptyState
          icon={missing ? FileText : TriangleAlert}
          title={missing ? t("notFoundTitle") : t("errorTitle")}
          description={missing ? t("notFoundDescription") : t("errorDescription")}
          action={
            missing ? (
              <Button variant="outline" size="lg" nativeButton={false} render={<Link href="/crm/proposals" />}>
                {t("backToList")}
              </Button>
            ) : (
              <Button variant="outline" size="lg" onClick={() => refetch()}>
                <RefreshCw aria-hidden />
                {t("retry")}
              </Button>
            )
          }
        />
      </div>
    );
  }

  const p: Proposal = data;
  const isDraft = p.state === "draft";
  const isLive = p.state === "sent" || p.state === "viewed";
  const overdue = isLive && isPastValidity(p);

  /* -------- mutations -------- */
  async function uploadPdf(input: UploadPdfInput) {
    setBusy(true);
    try {
      await proposalsApi.uploadPdf(p.id, input, user.userId);
      refresh();
      toast({ tone: "success", title: t("toast.uploaded") });
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }
  async function removePdf() {
    setBusy(true);
    try {
      await proposalsApi.removePdf(p.id, user.userId);
      refresh();
      toast({ title: t("toast.removed") });
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    try {
      await proposalsApi.sendProposal(p.id, user.userId);
      refresh();
      toast({ tone: "success", title: t("toast.sent") });
    } catch (err) {
      showError(err);
      throw err;
    }
  }
  async function markViewed() {
    try {
      await proposalsApi.markViewed(p.id, user.userId);
      refresh();
      toast({ title: t("toast.viewed") });
    } catch (err) {
      showError(err);
    }
  }
  async function accept() {
    try {
      await proposalsApi.acceptProposal(p.id, user.userId);
      refresh();
      toast({ tone: "success", title: t("toast.accepted") });
    } catch (err) {
      showError(err);
      throw err;
    }
  }
  async function reject(input: RejectProposalInput) {
    try {
      await proposalsApi.rejectProposal(p.id, input, user.userId);
      refresh();
      toast({ title: t("toast.rejected") });
      setRejectOpen(false);
    } catch (err) {
      showError(err);
    }
  }
  async function expire() {
    try {
      await proposalsApi.expireProposal(p.id, user.userId);
      refresh();
      toast({ title: t("toast.expired") });
    } catch (err) {
      showError(err);
      throw err;
    }
  }
  async function resend(input: ResendProposalInput) {
    try {
      await proposalsApi.resendProposal(p.id, input, user.userId);
      refresh();
      toast({ tone: "success", title: t("toast.resent") });
      setResendOpen(false);
    } catch (err) {
      showError(err);
    }
  }
  async function archive() {
    try {
      await proposalsApi.archiveProposal(p.id, user.userId);
      refresh();
      toastWithUndo({
        title: t("toast.archived", { reference: p.reference }),
        onUndo: async () => {
          await proposalsApi.restoreProposal(p.id, user.userId);
          refresh();
        },
      });
    } catch (err) {
      showError(err);
      throw err;
    }
  }

  return (
    <div className="space-y-6">
      <BackLink label={t("back")} />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {p.reference}
            </h1>
            <ProposalStateBadge state={p.state} />
          </div>
          <p className="text-sm text-muted-foreground">{p.opportunityTitle}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <Link
              href={pipelineRoutes.opportunity(p.opportunityId)}
              className="inline-flex items-center gap-1.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <GitBranch className="size-3.5" strokeWidth={1.8} aria-hidden />
              {t("viewOpportunity")}
            </Link>
            <Link
              href={crmRoutes.company(p.companyId)}
              className="inline-flex items-center gap-1.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <Building2 className="size-3.5" strokeWidth={1.8} aria-hidden />
              {p.companyName}
            </Link>
          </div>
        </div>

        {canManage ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {isDraft ? (
              <Button size="sm" onClick={() => setSendOpen(true)}>
                <Send aria-hidden />
                {t("actions.send")}
              </Button>
            ) : null}
            {p.state === "sent" ? (
              <Button variant="outline" size="sm" onClick={markViewed}>
                <Eye aria-hidden />
                {t("actions.markViewed")}
              </Button>
            ) : null}
            {isLive ? (
              <>
                <Button size="sm" onClick={() => setAcceptOpen(true)}>
                  <CheckCircle2 aria-hidden />
                  {t("actions.accept")}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setRejectOpen(true)}>
                  <XCircle aria-hidden />
                  {t("actions.reject")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setExpireOpen(true)}>
                  <Clock aria-hidden />
                  {t("actions.expire")}
                </Button>
              </>
            ) : null}
            {p.state === "expired" ? (
              <Button size="sm" onClick={() => setResendOpen(true)}>
                <RotateCcw aria-hidden />
                {t("actions.resend")}
              </Button>
            ) : null}
            {canArchive(p) ? (
              <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
                <Archive aria-hidden />
                {t("actions.archive")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Banners */}
      {p.state === "accepted" ? (
        <Banner tone="success" icon={CheckCircle2}>
          {t("banners.accepted", { date: p.decidedAt ? formatDate(p.decidedAt) : "" })}
        </Banner>
      ) : null}
      {p.state === "rejected" ? (
        <Banner tone="muted" icon={XCircle}>
          {p.rejectionNote
            ? t("banners.rejectedWithNote", {
                date: p.decidedAt ? formatDate(p.decidedAt) : "",
                note: p.rejectionNote,
              })
            : t("banners.rejected", { date: p.decidedAt ? formatDate(p.decidedAt) : "" })}
        </Banner>
      ) : null}
      {p.state === "expired" ? (
        <Banner tone="warning" icon={Clock}>
          {t("banners.expired", { date: p.validUntil ? formatDate(p.validUntil) : "" })}
        </Banner>
      ) : null}
      {overdue ? (
        <Banner tone="warning" icon={TriangleAlert}>
          {t("banners.pastValidity", { date: p.validUntil ? formatDate(p.validUntil) : "" })}
        </Banner>
      ) : null}
      {isDraft && p.file == null ? (
        <Banner tone="muted" icon={FileText}>
          {t("banners.needsPdf")}
        </Banner>
      ) : null}

      <ProposalContentEditor proposalId={p.id} isDraft={isDraft} canManage={canManage} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: document + facts */}
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("documentTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <PdfUpload
                file={p.file}
                editable={canManage && isDraft}
                uploading={busy}
                removing={busy}
                onUpload={uploadPdf}
                onRemove={removePdf}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("factsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Fact label={t("value")}>
                {p.valueCents != null ? (
                  <span className="font-heading font-semibold tabular-nums">
                    {formatEUR(p.valueCents, locale)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t("valueRestricted")}</span>
                )}
              </Fact>
              {p.contactName ? <Fact label={t("contact")}>{p.contactName}</Fact> : null}
              <Fact label={t("created")}>
                <span className="text-muted-foreground">{formatDate(p.createdAt.slice(0, 10))}</span>
              </Fact>
              <Fact label={t("sentAt")}>
                <span className="text-muted-foreground">{p.sentAt ? formatDate(p.sentAt) : "—"}</span>
              </Fact>
              <Fact label={t("validUntil")}>
                <span className={overdue ? "font-medium text-warning-foreground" : "text-muted-foreground"}>
                  {p.validUntil ? formatDate(p.validUntil) : "—"}
                </span>
              </Fact>
              {p.viewedAt ? (
                <Fact label={t("viewedAt")}>
                  <span className="text-muted-foreground">{formatDate(p.viewedAt)}</span>
                </Fact>
              ) : null}
              {p.notes ? (
                <Fact label={t("notes")}>
                  <span className="whitespace-pre-line text-foreground">{p.notes}</span>
                </Fact>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Right: comments + timeline */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("notesTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CommentThread
                entityType="proposal"
                entityId={p.id}
                api={proposalCollaborationApi}
                currentUser={
                  canManage ? { id: user.userId, name: user.name, avatarUrl: user.avatarUrl } : undefined
                }
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("timelineTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed entityType="proposal" entityId={p.id} api={proposalCollaborationApi} />
            </CardContent>
          </Card>
        </div>
      </div>

      {canManage ? (
        <>
          <SendProposalDialog open={sendOpen} onOpenChange={setSendOpen} proposal={p} onConfirm={send} />
          <RejectProposalDialog open={rejectOpen} onOpenChange={setRejectOpen} proposal={p} onConfirm={reject} />
          <ResendProposalDialog open={resendOpen} onOpenChange={setResendOpen} proposal={p} onConfirm={resend} />
          <ConfirmDialog
            open={acceptOpen}
            onOpenChange={setAcceptOpen}
            title={t("acceptConfirm.title")}
            description={t("acceptConfirm.description", { reference: p.reference })}
            confirmLabel={t("actions.accept")}
            onConfirm={accept}
          />
          <ConfirmDialog
            open={expireOpen}
            onOpenChange={setExpireOpen}
            title={t("expireConfirm.title")}
            description={t("expireConfirm.description", { reference: p.reference })}
            confirmLabel={t("actions.expire")}
            onConfirm={expire}
          />
          <ConfirmDialog
            open={archiveOpen}
            onOpenChange={setArchiveOpen}
            title={t("archiveConfirm.title")}
            description={t("archiveConfirm.description", { reference: p.reference })}
            confirmLabel={t("actions.archive")}
            onConfirm={archive}
          />
        </>
      ) : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

const BANNER_TONE = {
  success: "border-success/30 bg-success-muted text-success",
  warning: "border-warning/40 bg-warning-muted text-warning-foreground",
  muted: "border-border bg-muted text-muted-foreground",
} as const;

function Banner({
  tone,
  icon: Icon,
  children,
}: {
  tone: keyof typeof BANNER_TONE;
  icon: typeof CheckCircle2;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-sm ${BANNER_TONE[tone]}`}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
      {children}
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/crm/proposals"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden />
      {label}
    </Link>
  );
}
