"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, FileText, Download, Trash2, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, ConfirmDialog, useToast } from "@/components/shared";
import {
  attachmentsApi,
  StorageNotConfiguredError,
  type AttachmentMeta,
} from "@/lib/api/attachments";
import type { Project } from "@/lib/api/projects-types";
import { formatDate } from "./project-format";

/** Bytes as something a person reads, not a number they decode. */
function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Project files.
 *
 * This tab used to render a hardcoded list of three invented filenames under a
 * note saying upload was coming later — which is worse than an empty state,
 * because it looks like data. It is the real attachment store now: upload,
 * download and delete, against whichever provider is configured.
 */
export function FilesTab({ project }: { project: Project }) {
  const t = useTranslations("projects.filesTab");
  const { toast } = useToast();
  const qc = useQueryClient();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = React.useState<AttachmentMeta | null>(null);

  const queryKey = React.useMemo(() => ["attachments", "project", project.id], [project.id]);
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => attachmentsApi.list("project", project.id),
  });
  const files = React.useMemo(() => data ?? [], [data]);

  const upload = useMutation({
    mutationFn: (file: File) => attachmentsApi.upload("project", project.id, file),
    onSuccess: (meta) => {
      toast({ tone: "success", title: t("uploaded", { name: meta.filename }) });
      void qc.invalidateQueries({ queryKey });
    },
    onError: (err: unknown) => {
      // The server decides what may be stored; say which rule was hit rather
      // than "something went wrong", so the next attempt can succeed.
      const message =
        err instanceof StorageNotConfiguredError
          ? err.message
          : err instanceof Error && /size|grande|large/i.test(err.message)
            ? t("tooLarge")
            : err instanceof Error && /type|tipo|allow/i.test(err.message)
              ? t("notAllowed")
              : t("uploadFailed");
      toast({ tone: "destructive", title: message });
    },
  });

  const remove = useMutation({
    mutationFn: (meta: AttachmentMeta) => attachmentsApi.remove(meta.id),
    onSuccess: (_r, meta) => {
      toast({ tone: "success", title: t("removed", { name: meta.filename }) });
      void qc.invalidateQueries({ queryKey });
    },
    onError: () => toast({ tone: "destructive", title: t("removeFailed") }),
  });

  async function download(meta: AttachmentMeta) {
    try {
      const url = await attachmentsApi.getDownloadUrl(meta.id);
      // The URL is short-lived and forces an attachment disposition, so opening
      // it is a download rather than a navigation.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast({ tone: "destructive", title: t("loadFailed") });
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset first: picking the same file twice in a row must fire again.
    e.target.value = "";
    if (file) upload.mutate(file);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Paperclip className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
              {t("title")}
            </CardTitle>
            <div>
              <input
                ref={inputRef}
                type="file"
                className="sr-only"
                onChange={onPick}
                aria-label={t("upload")}
              />
              <Button
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={upload.isPending}
              >
                <Upload aria-hidden />
                {upload.isPending ? t("uploading") : t("upload")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ul className="space-y-2" aria-busy>
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </ul>
          ) : isError ? (
            <p className="text-sm text-status-overdue">{t("loadFailed")}</p>
          ) : files.length === 0 ? (
            <EmptyState
              variant="bare"
              icon={Paperclip}
              title={t("empty.title")}
              description={t("empty.description")}
            />
          ) : (
            <ul className="divide-y divide-border">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <FileText className="size-4" strokeWidth={1.8} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{f.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSize(f.sizeBytes)} · {formatDate(f.createdAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("download")}
                    title={t("download")}
                    onClick={() => void download(f)}
                  >
                    <Download aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("remove")}
                    title={t("remove")}
                    onClick={() => setPendingDelete(f)}
                    disabled={remove.isPending}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? t("confirmRemove", { name: pendingDelete.filename }) : ""}
        description={t("confirmRemoveBody")}
        confirmLabel={t("remove")}
        variant="destructive"
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </>
  );
}
