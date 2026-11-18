// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

const root = process.cwd()

// The nightly dump and its off-site copy (#524) are shell inside CronJobs, so their logic is tested
// by an offline shell script with a fake rclone and a fake pg_dump, and the real gpg and openssl.
// Running it here puts it in CI with the rest of the suite.
describe("off-site backup CronJob (#524)", () => {
  // Some twenty real key derivations (gpg, openssl): a few seconds, more on a loaded machine.
  it("passes the offline backup, rotation, provider, dry-run and restore tests", { timeout: 120_000 }, () => {
    const out = execFileSync("sh", [path.join(root, "scripts/test-offsite-backup.sh")], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    expect(out).toContain("ok - backup script: GnuPG file written and verified, 30-day rotation of both formats")
    expect(out).toContain("ok - restore-test-offsite.sh refuses a GnuPG file modified after encryption")
    expect(out).toContain("All offsite backup tests passed.")
  })

  it("does not report a successful copy to the health page after a dry run", () => {
    const cronjob = readFileSync(path.join(root, "k8s/cronjob-backup-offsite.yaml"), "utf8")
    const guard = cronjob.indexOf('[ "${DRY_RUN:-false}" = "true" ] && exit 0')
    const heartbeat = cronjob.indexOf("/api/cron/heartbeat")
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(heartbeat)
  })

  // #697: Swiss Backup is the only provider; the former Dropbox remote and the provider switch
  // are gone, so no script can send copies there again by mistake.
  it("only targets the Swiss Backup remote", () => {
    for (const file of ["k8s/cronjob-backup-offsite.yaml", "scripts/restore-test-offsite.sh", "Makefile"]) {
      const text = readFileSync(path.join(root, file), "utf8")
      expect(text, file).not.toMatch(/dropbox/i)
      expect(text, file).not.toContain("OFFSITE_PROVIDER")
    }
    const cronjob = readFileSync(path.join(root, "k8s/cronjob-backup-offsite.yaml"), "utf8")
    expect(cronjob).toContain('REMOTE="swissbackup:${OFFSITE_BUCKET}/benevol-backups"')
  })

  // The passphrase must stay out of process lists and out of `make` output.
  it("never passes the backup passphrase on a command line", () => {
    const restoreScript = readFileSync(
      path.join(root, "scripts/restore-test-offsite.sh"),
      "utf8",
    )
    // The former openssl format reads it from the environment, gpg from its standard input.
    expect(restoreScript).toContain("-pass env:BACKUP_PASSPHRASE")
    expect(restoreScript).toContain("--passphrase-fd 0")
    expect(restoreScript).not.toContain('-pass "pass:')
    expect(restoreScript).not.toContain("pass:${BACKUP_PASSPHRASE}")
    expect(restoreScript).not.toMatch(/--passphrase[\s=]/)

    const makefile = readFileSync(path.join(root, "Makefile"), "utf8")
    expect(makefile).not.toMatch(/BACKUP_PASSPHRASE="\$\(BACKUP_PASSPHRASE\)"/)
  })
})
