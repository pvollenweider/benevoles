import { describe, it, expect } from "vitest"
import { buildManifest, compareManifests, MANIFEST_VERSION } from "../../../scripts/ci-build-artifact.mjs"

// The Next.js build shared by the E2E shards and Lighthouse in ci.yml: a consumer refuses any
// build that was not made from its own sources, dependencies and public settings in this run.
const base: {
  commit: string
  tree: string
  lockfile: string
  node: string
  platform: string
  env: Record<string, string>
  runId: string
  buildId: string
} = {
  commit: "a".repeat(40),
  tree: "t".repeat(40),
  lockfile: "l".repeat(64),
  node: "26.9.0",
  platform: "linux-x64",
  env: { NEXT_PUBLIC_APP_URL: "http://localhost:3100", AUTH_SECRET: "server-only", SMTP_HOST: "localhost" },
  runId: "123",
  buildId: "build-1",
}
const manifest = (over: Partial<typeof base> = {}) => buildManifest({ ...base, ...over })

describe("CI shared build manifest", () => {
  it("keeps only the public, inlined variables, sorted", () => {
    const m = manifest({ env: { NEXT_PUBLIC_Z: "z", SMTP_HOST: "x", NEXT_PUBLIC_A: "a" } })
    expect(m.publicEnv).toEqual({ NEXT_PUBLIC_A: "a", NEXT_PUBLIC_Z: "z" })
    expect(Object.keys(m.publicEnv)).toEqual(["NEXT_PUBLIC_A", "NEXT_PUBLIC_Z"])
    expect(m.version).toBe(MANIFEST_VERSION)
  })

  it("accepts the same build in the same run", () => {
    expect(compareManifests(manifest(), manifest())).toEqual({ errors: [], warnings: [] })
  })

  it("ignores server-only variables: they are read when the server starts", () => {
    const local = manifest({ env: { NEXT_PUBLIC_APP_URL: "http://localhost:3100", CRON_SECRET: "x" } })
    expect(compareManifests(manifest(), local).errors).toEqual([])
  })

  it("refuses another commit even with the same tree", () => {
    const { errors } = compareManifests(manifest(), manifest({ commit: "b".repeat(40) }))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/commit/)
  })

  it("refuses a real file change (another tree)", () => {
    const { errors } = compareManifests(manifest(), manifest({ tree: "u".repeat(40) }))
    expect(errors.join()).toMatch(/tree/)
  })

  it("refuses a change of a public build parameter", () => {
    const local = manifest({ env: { NEXT_PUBLIC_APP_URL: "http://localhost:3200" } })
    expect(compareManifests(manifest(), local).errors.join()).toMatch(/NEXT_PUBLIC_APP_URL/)
  })

  it("refuses a public variable present on one side only", () => {
    const local = manifest({ env: { ...base.env, NEXT_PUBLIC_SENTRY_DSN: "https://dsn" } })
    expect(compareManifests(manifest(), local).errors.join()).toMatch(/NEXT_PUBLIC_SENTRY_DSN/)
  })

  it("refuses an artifact from another run (provenance)", () => {
    expect(compareManifests(manifest({ runId: "999" }), manifest()).errors.join()).toMatch(/run 999/)
  })

  it("refuses other dependencies, another platform or another Node major", () => {
    expect(compareManifests(manifest(), manifest({ lockfile: "m".repeat(64) })).errors.join()).toMatch(/package-lock/)
    expect(compareManifests(manifest(), manifest({ platform: "linux-arm64" })).errors.join()).toMatch(/linux-arm64/)
    expect(compareManifests(manifest(), manifest({ node: "27.0.0" })).errors.join()).toMatch(/Node/)
  })

  it("only warns on another Node patch release", () => {
    expect(compareManifests(manifest(), manifest({ node: "26.9.1" }))).toEqual({
      errors: [],
      warnings: ["built with Node 26.9.0, running Node 26.9.1"],
    })
  })

  it("refuses an extracted build that is not the one described", () => {
    expect(compareManifests(manifest(), manifest({ buildId: "build-2" })).errors.join()).toMatch(/BUILD_ID/)
  })

  it("refuses a manifest of an unknown version, or none", () => {
    expect(compareManifests({ ...manifest(), version: 2 }, manifest()).errors).toHaveLength(1)
    expect(compareManifests(null as never, manifest()).errors).toHaveLength(1)
  })
})
