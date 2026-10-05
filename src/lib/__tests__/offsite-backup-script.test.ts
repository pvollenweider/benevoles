// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

const root = process.cwd()

// The off-site copy (#524) is shell inside a CronJob, so its logic is tested by an offline shell
// script with a fake rclone. Running it here puts it in CI with the rest of the suite.
describe("off-site backup CronJob (#524)", () => {
  it("passes the offline provider, dry-run and restore tests", () => {
    const out = execFileSync("sh", [path.join(root, "scripts/test-offsite-backup.sh")], {
      cwd: root,
      encoding: "utf8",
    })
    expect(out).toContain("All offsite backup tests passed.")
  })

  it("does not report a successful copy to the health page after a dry run", () => {
    const cronjob = readFileSync(path.join(root, "k8s/cronjob-backup-offsite.yaml"), "utf8")
    const guard = cronjob.indexOf('[ "${DRY_RUN:-false}" = "true" ] && exit 0')
    const heartbeat = cronjob.indexOf("/api/cron/heartbeat")
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(heartbeat)
  })
})
