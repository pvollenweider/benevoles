import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs/config"
import { SECURITY_HEADERS } from "./src/lib/security-headers"

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  async headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS] }]
  },
}

export default withSentryConfig(nextConfig, {
  org: "benevolapp",
  project: "benevoles",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  // Proxy Sentry requests through /monitoring to bypass ad-blockers
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  telemetry: false,
})
