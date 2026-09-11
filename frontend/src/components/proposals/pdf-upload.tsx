"use client";

import * as React from "react";
import { useTranslations, useLocale } from "next-intl";
import { FileText, Upload, Download, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_PDF_BYTES } from "@/lib/api/proposals";
import type { ProposalFile, UploadPdfInput } from "@/lib/api/proposals-types";
import { formatDate, formatFileSize } from "./proposal-format";
import { cn } from "@/lib/utils";

export interface PdfUploadProps {
  file: ProposalFile | null;
  /** Whether the caller may attach / replace / remove the file (draft only). */
  editable: boolean;
  uploading?: boolean;
  removing?: boolean;
  onUpload: (input: UploadPdfInput) => void;
  onRemove: () => void;
}

/**
 * PDF attachment control (F6 / F17). Validates type (`application/pdf`) and size
 * (<= MAX_PDF_BYTES) client-side before handing the metadata to the caller — the
 * real bytes are uploaded to R2 during the integration phase. When a file is
 * present it renders name / size / upload date plus a download link (mock signed
 * URL). In `draft` the file may be replaced or removed; once sent it is read-only.
 */
export function PdfUpload({
  file,
  editable,
  uploading = false,
  removing = false,
  onUpload,
  onRemove,
}: PdfUploadProps) {
  const t = useTranslations("proposals.pdf");
  const locale = useLocale();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  function pick() {
    setError(null);
    inputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    // Reset the input so re-selecting the same file re-triggers change.
    e.target.value = "";
    if (!selected) return;

    const isPdf =
      selected.type === "application/pdf" ||
      selected.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError(t("errorType"));
      return;
    }
    if (selected.size > MAX_PDF_BYTES) {
      setError(t("errorSize", { max: formatFileSize(MAX_PDF_BYTES, locale) }));
      return;
    }
    if (selected.size === 0) {
      setError(t("errorEmpty"));
      return;
    }
    setError(null);
    onUpload({ file: selected });
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={onFileChange}
      />

      {file ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gold-muted text-gold">
              <FileText className="size-5" strokeWidth={1.8} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {formatFileSize(file.sizeBytes, locale)} ·{" "}
                {t("uploadedOn", { date: formatDate(file.uploadedAt.slice(0, 10)) })}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <a href={file.url} target="_blank" rel="noopener noreferrer" download />
              }
            >
              <Download aria-hidden />
              {t("download")}
            </Button>
            {editable ? (
              <>
                <Button variant="outline" size="sm" onClick={pick} disabled={uploading}>
                  <Upload aria-hidden />
                  {uploading ? t("uploading") : t("replace")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onRemove}
                  disabled={removing}
                  aria-label={t("remove")}
                >
                  <Trash2 aria-hidden />
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : editable ? (
        <button
          type="button"
          onClick={pick}
          disabled={uploading}
          className={cn(
            "flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-8 text-center outline-none transition-colors",
            "hover:border-gold hover:bg-gold-muted/30 focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <Upload className="size-5" strokeWidth={1.8} aria-hidden />
          </span>
          <span className="text-sm font-medium text-foreground">
            {uploading ? t("uploading") : t("dropTitle")}
          </span>
          <span className="text-xs text-muted-foreground">{t("dropHint")}</span>
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          <FileText className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
          {t("none")}
        </div>
      )}

      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
