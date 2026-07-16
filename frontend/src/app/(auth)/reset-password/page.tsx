import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/auth/form-alert";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  return { title: t("title") };
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const t = await getTranslations("auth.reset");
  const raw = (await searchParams).token;
  const token = Array.isArray(raw) ? raw[0] : (raw ?? "");

  if (!token) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <FormAlert
            tone="error"
            title={t("missingTokenTitle")}
            description={t("missingTokenBody")}
          />
        </CardHeader>
        <CardContent>
          <Button
            className="h-10 w-full"
            nativeButton={false}
            render={<Link href="/forgot-password" />}
          >
            {t("requestNew")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm token={token} />
      </CardContent>
    </Card>
  );
}
