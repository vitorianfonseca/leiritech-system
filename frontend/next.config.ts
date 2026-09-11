import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Standalone output traces only the dependencies each route actually
  // needs into `.next/standalone`, so the production Docker image can ship
  // without `node_modules` (see `frontend/Dockerfile`).
  output: "standalone",
};

export default withNextIntl(nextConfig);
