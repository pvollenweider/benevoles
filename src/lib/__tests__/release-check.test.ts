import { describe, it, expect } from "vitest"
import { parseVersion, compareVersions, isNewerVersion, shouldNotify, shouldShowBanner } from "../release-check"

describe("parseVersion", () => {
  it("parses major.minor.patch", () => {
    expect(parseVersion("2.1.0")).toEqual({ major: 2, minor: 1, patch: 0 })
  })

  it("tolerates a leading v", () => {
    expect(parseVersion("v2.1.0")).toEqual({ major: 2, minor: 1, patch: 0 })
  })

  it("returns null on a malformed tag", () => {
    expect(parseVersion("not-a-version")).toBeNull()
    expect(parseVersion("2.1")).toBeNull()
    expect(parseVersion("")).toBeNull()
  })
})

describe("compareVersions", () => {
  it("orders major, then minor, then patch", () => {
    expect(compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 })).toBe(-1)
    expect(compareVersions({ major: 2, minor: 0, patch: 0 }, { major: 2, minor: 1, patch: 0 })).toBe(-1)
    expect(compareVersions({ major: 2, minor: 1, patch: 0 }, { major: 2, minor: 1, patch: 1 })).toBe(-1)
    expect(compareVersions({ major: 2, minor: 1, patch: 1 }, { major: 2, minor: 1, patch: 1 })).toBe(0)
    expect(compareVersions({ major: 2, minor: 1, patch: 2 }, { major: 2, minor: 1, patch: 1 })).toBe(1)
  })
})

describe("isNewerVersion", () => {
  it("true when strictly newer", () => {
    expect(isNewerVersion("2.1.0", "2.0.2")).toBe(true)
  })

  it("false when equal", () => {
    expect(isNewerVersion("2.0.2", "2.0.2")).toBe(false)
  })

  it("false when older", () => {
    expect(isNewerVersion("1.9.0", "2.0.2")).toBe(false)
  })

  it("false on a malformed candidate", () => {
    expect(isNewerVersion("not-a-version", "2.0.2")).toBe(false)
  })

  it("false when candidate is null", () => {
    expect(isNewerVersion(null, "2.0.2")).toBe(false)
  })
})

describe("shouldNotify", () => {
  const base = { currentVersion: "2.0.2", latestVersion: "2.1.0", lastNotifiedVersion: null }

  it("newer version, never notified: true", () => {
    expect(shouldNotify(base)).toBe(true)
  })

  it("same version: false", () => {
    expect(shouldNotify({ ...base, latestVersion: "2.0.2" })).toBe(false)
  })

  it("older version: false", () => {
    expect(shouldNotify({ ...base, latestVersion: "1.9.0" })).toBe(false)
  })

  it("prerelease: false even if newer", () => {
    expect(shouldNotify({ ...base, prerelease: true })).toBe(false)
  })

  it("malformed tag: false", () => {
    expect(shouldNotify({ ...base, latestVersion: "not-a-version" })).toBe(false)
  })

  it("already notified for this version: false", () => {
    expect(shouldNotify({ ...base, lastNotifiedVersion: "2.1.0" })).toBe(false)
  })

  it("notified for an older version, now a newer one: true", () => {
    expect(shouldNotify({ ...base, lastNotifiedVersion: "2.0.3" })).toBe(true)
  })
})

describe("shouldShowBanner", () => {
  const base = { currentVersion: "2.0.2", latestVersion: "2.1.0", dismissedVersion: null }

  it("newer version, not dismissed: true", () => {
    expect(shouldShowBanner(base)).toBe(true)
  })

  it("same version: false", () => {
    expect(shouldShowBanner({ ...base, latestVersion: "2.0.2" })).toBe(false)
  })

  it("older version: false", () => {
    expect(shouldShowBanner({ ...base, latestVersion: "1.9.0" })).toBe(false)
  })

  it("dismissed for this exact version: false", () => {
    expect(shouldShowBanner({ ...base, dismissedVersion: "2.1.0" })).toBe(false)
  })

  it("dismissed for an older version, now a newer one: true again", () => {
    expect(shouldShowBanner({ ...base, latestVersion: "2.2.0", dismissedVersion: "2.1.0" })).toBe(true)
  })

  it("malformed latest version: false", () => {
    expect(shouldShowBanner({ ...base, latestVersion: "garbage" })).toBe(false)
  })
})
