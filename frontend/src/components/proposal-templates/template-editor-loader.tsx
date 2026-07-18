"use client";

import { useQuery } from "@tanstack/react-query";
import { SkeletonCard, EmptyState } from "@/components/shared";
import { useTranslations } from "next-intl";
import { proposalTemplatesApi } from "@/lib/api/proposal-templates";
import { TemplateEditor } from "./template-editor";

/** Loads a template by id and renders the editor in edit mode. */
export function TemplateEditorLoader({ id }: { id: string }) {
  const t = useTranslations("proposalTemplates.editor");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["proposal-templates", "item", id],
    queryFn: () => proposalTemplatesApi.get(id),
  });

  if (isLoading) return <SkeletonCard />;
  if (isError || !data) {
    return <EmptyState title={t("notFoundTitle")} description={t("notFoundDescription")} />;
  }
  return <TemplateEditor template={data} />;
}
