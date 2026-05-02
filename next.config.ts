import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs"

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["localhost", "127.0.0.1"],
}

export default withSentryConfig(nextConfig, {
  org: "pvollenweider",
  project: "benevoles",
  // Upload source maps only in CI (requires SENTRY_AUTH_TOKEN)
  silent: !process.env.CI,
  disableLogger: true,
  // Avoid the Sentry build plugin blocking local dev when DSN is absent
  telemetry: false,
})
