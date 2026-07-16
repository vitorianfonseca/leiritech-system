import * as React from "react";
import { getTranslations } from "next-intl/server";
import {
  Wallet,
  FolderKanban,
  TriangleAlert,
  GitBranch,
  Clock,
  FileText,
  UserRoundCog,
  ArrowRight,
} from "lucide-react";
import { getSession } from "@/lib/session";
import { PageHeader } from "@/components/shell/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { PipelineChart } from "@/components/dashboard/pipeline-chart";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default async function DashboardPage() {
  const t = await getTranslations("foundation.dashboard");
  const ts = await getTranslations("status");
  const session = await getSession();
  const firstName = session?.name.split(" ")[0] ?? "";

  const attention = [
    {
      icon: TriangleAlert,
      title: "Website — Solar do Douro",
      meta: "Marco de entrega em 2 dias · progresso 40%",
      badge: { label: ts("atRisk"), variant: "atRisk" as const },
    },
    {
      icon: Clock,
      title: "Rebranding — Adega Vale",
      meta: "3 tarefas atrasadas",
      badge: { label: ts("overdue"), variant: "overdue" as const },
    },
    {
      icon: GitBranch,
      title: "Oportunidade — App Fidelização",
      meta: "Sem próxima ação definida",
      badge: { label: ts("attention"), variant: "attention" as const },
    },
    {
      icon: FileText,
      title: "Proposta — Portal Interno Lumina",
      meta: "Expira amanhã",
      badge: { label: ts("due"), variant: "due" as const },
    },
    {
      icon: UserRoundCog,
      title: "Carla Nunes",
      meta: "Sobrecarga de 118% esta semana",
      badge: { label: ts("attention"), variant: "attention" as const },
    },
    {
      icon: Wallet,
      title: "Pagamento — Manutenção Mensal Fábrica",
      meta: "Recebimento em atraso · 4.500 €",
      badge: { label: ts("overdue"), variant: "overdue" as const },
    },
  ];

  const health = [
    { label: ts("healthy"), count: 9, variant: "healthy" as const, bar: "bg-health-healthy" },
    { label: ts("attention"), count: 4, variant: "attention" as const, bar: "bg-health-attention" },
    { label: ts("atRisk"), count: 2, variant: "atRisk" as const, bar: "bg-health-at-risk" },
  ];
  const totalHealth = health.reduce((s, h) => s + h.count, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("greeting", { name: firstName })}
        subtitle={t("subtitle")}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t("metricPipeline")}
          value="104 k€"
          icon={GitBranch}
          tone="gold"
          delta={{ value: "12%", direction: "up" }}
        />
        <StatTile
          label={t("metricActiveProjects")}
          value="15"
          icon={FolderKanban}
          tone="neutral"
        />
        <StatTile
          label={t("metricOverdueTasks")}
          value="7"
          icon={TriangleAlert}
          tone="destructive"
          delta={{ value: "3", direction: "up", positive: false }}
        />
        <StatTile
          label={t("metricReceivable")}
          value="38,2 k€"
          icon={Wallet}
          tone="success"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Attention panel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("attentionTitle")}</CardTitle>
            <CardDescription>{t("attentionSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Separator />
            <ul className="divide-y divide-border">
              {attention.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.title}>
                    <a
                      href="#"
                      className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-accent/50"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                        <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.meta}
                        </p>
                      </div>
                      <Badge variant={item.badge.variant}>{item.badge.label}</Badge>
                      <ArrowRight
                        className="size-4 shrink-0 text-muted-foreground/50"
                        aria-hidden
                      />
                    </a>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {/* Project health */}
        <Card>
          <CardHeader>
            <CardTitle>{t("healthTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full">
              {health.map((h) => (
                <div
                  key={h.label}
                  className={h.bar}
                  style={{ width: `${(h.count / totalHealth) * 100}%` }}
                />
              ))}
            </div>
            <ul className="space-y-3">
              {health.map((h) => (
                <li key={h.label} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm">
                    <span className={`size-2.5 rounded-full ${h.bar}`} aria-hidden />
                    {h.label}
                  </span>
                  <span className="font-heading text-sm font-semibold tabular-nums">
                    {h.count}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t("chartTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <PipelineChart />
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground/70">
        {t("placeholderNote")}
      </p>
    </div>
  );
}
