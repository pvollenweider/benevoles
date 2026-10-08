import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs/config"
import { SECURITY_HEADERS } from "./src/lib/security-headers"
import { STATIC_CACHE_HEADERS } from "./src/lib/static-cache-headers"

const nextConfig: NextConfig = {
  output: "standalone",
  // No `X-Powered-By: Next.js` on the responses (#759 F7): it tells nothing a visitor needs.
  poweredByHeader: false,
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  async headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS] }, ...STATIC_CACHE_HEADERS]
  },
  images: {
    // 512 between the default 384 and 640 (#773): the home page's phone capture is 280 CSS px
    // wide, so a 1.75x screen asks for 490 px and got the 640 px file; it now gets 512 px.
    imageSizes: [32, 48, 64, 96, 128, 256, 384, 512],
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
