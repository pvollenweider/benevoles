import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs/config"
import { CALENDAR_FEED_HEADER_RULES, securityHeaders } from "./src/lib/security-headers"
import { STATIC_CACHE_HEADERS } from "./src/lib/static-cache-headers"
import { IMAGE_LOCAL_PATTERNS } from "./src/lib/image-local-patterns"
import pkg from "./package.json"

const nextConfig: NextConfig = {
  output: "standalone",
  // No `X-Powered-By: Next.js` on the responses (#759 F7): it tells nothing a visitor needs.
  poweredByHeader: false,
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  // The version shown by client components (src/lib/app-version.ts), inlined at build time: importing
  // package.json there shipped the whole file in the public pages' JavaScript (#773).
  env: { APP_VERSION: pkg.version },
  async headers() {
    return [
      { source: "/:path*", headers: [...securityHeaders({ dev: process.env.NODE_ENV === "development" })] },
      ...STATIC_CACHE_HEADERS,
      ...CALENDAR_FEED_HEADER_RULES.map((r) => ({ source: r.source, headers: [...r.headers] })),
    ]
  },
  images: {
    // 512 between the default 384 and 640 (#773): the home page's phone capture is 280 CSS px
    // wide, so a 1.75x screen asks for 490 px and got the 640 px file; it now gets 512 px.
    imageSizes: [32, 48, 64, 96, 128, 256, 384, 512],
    // Only the doc screenshots: the optimiser never fetches another local path (API routes included).
    localPatterns: IMAGE_LOCAL_PATTERNS.map((p) => ({ ...p })),
  },
}

export default withSentryConfig(nextConfig, {
  org: "benevolapp",
  project: "benevoles",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  // No `tunnelRoute`: its rewrite relays to any Sentry project. The browser SDK sends to
  // /monitoring (src/app/monitoring/route.ts), which forwards to this project's DSN only.
  silent: !process.env.CI,
  telemetry: false,
})
