import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { RETENTION, RETENTION_DAYS, retentionGuideTable, retentionMatrixTable, TABLE_END, TABLE_START } from "../retention"

// A stated retention period must match what actually deletes the data (#486).
const root = path.join(__dirname, "..", "..", "..")
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf-8")
const section = (md: string) => md.slice(md.indexOf(TABLE_START) + TABLE_START.length, md.indexOf(TABLE_END)).trim()

describe("retention policy", () => {
  it("is the table of the organisers' guide and of docs/retention.md (npm run retention:docs)", () => {
    expect(section(read("GUIDE_ADMIN.md"))).toBe(retentionGuideTable())
    expect(section(read("docs/retention.md"))).toBe(retentionMatrixTable())
  })

  it("drives the cleanup cron: no hard-coded duration left there", () => {
    const cron = read("src/app/api/cron/cleanup/route.ts")
    for (const key of ["deactivatedOrganization", "deactivatedAdmin", "failedNotification", "targetedMessage"]) expect(cron).toContain(`RETENTION_DAYS.${key}`)
    expect(cron).not.toMatch(/\d+\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/)
  })

  it("matches the backup rotation of the CronJobs", () => {
    expect(read("k8s/cronjob-backup.yaml")).toContain(`-mtime +${RETENTION_DAYS.localBackup}`)
    expect(read("k8s/cronjob-backup-offsite.yaml")).toContain(`--min-age ${RETENTION_DAYS.offsiteBackup}d`)
  })

  it("feeds the privacy page, with no stated duration outside the policy", () => {
    const page = read("src/app/legal/privacy/page.tsx")
    expect(page).toContain("RETENTION.filter((e) => e.public)")
    // Durations in the page come from RETENTION_DAYS, not literals.
    expect(page).not.toMatch(/\b(30|90|365) jours\b/)
  })

  it("names a mechanism for every entry, and says so when it's manual", () => {
    for (const e of RETENTION) {
      expect(e.mechanism.length, e.data).toBeGreaterThan(0)
      expect(e.duration.length, e.data).toBeGreaterThan(0)
    }
    expect(RETENTION.find((e) => e.data.startsWith("Journaux techniques"))?.mechanism).toMatch(/procédure manuelle/)
  })
})
