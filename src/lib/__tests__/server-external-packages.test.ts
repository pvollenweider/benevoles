import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8")
const lock = JSON.parse(readFileSync(join(process.cwd(), "package-lock.json"), "utf8")) as { packages: Record<string, unknown> }

describe("server external packages", () => {
  // A webpack build (the video production build) bundled isomorphic-dompurify with its own jsdom,
  // which then opened browser/default-stylesheet.css next to the bundle: page-data collection failed.
  it("keeps isomorphic-dompurify on node_modules while it carries its own jsdom", () => {
    if (!("node_modules/isomorphic-dompurify/node_modules/jsdom" in lock.packages)) return
    expect(config).toMatch(/serverExternalPackages:\s*\[[^\]]*"isomorphic-dompurify"/)
  })
})
