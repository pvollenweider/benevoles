// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

// Pod hardening of the Kubernetes manifests (#1050): restricted securityContext, no service
// account token, and the app given only the secret keys it reads instead of the whole secret.
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")

// Every manifest with a pod that the deploy workflow applies.
const POD_MANIFESTS = [
  "k8s/deployment.yaml",
  "k8s/job-migrate.yaml",
  "k8s/cronjob-reminders.yaml",
  "k8s/cronjob-outbox.yaml",
  "k8s/cronjob-cleanup.yaml",
  "k8s/cronjob-release-check.yaml",
  "k8s/cronjob-backup.yaml",
  "k8s/cronjob-backup-offsite.yaml",
]

// Keys of benevoles-secret the app never reads: they must not reach its pod.
const NOT_FOR_THE_APP = [
  "POSTGRES_USER", // postgres pod (the app gets DATABASE_URL)
  "POSTGRES_PASSWORD",
  "ADMIN_EMAIL", // prisma/seed.ts only, not in the image
  "ADMIN_PASSWORD",
  "OFFSITE_BUCKET", // k8s/cronjob-backup-offsite.yaml
]

// The app refuses to start without these (src/lib/env.ts, src/lib/production-guards.ts): a missing
// key keeps the new pod from being created, the old one keeps serving.
const REQUIRED_FOR_THE_APP = ["DATABASE_URL", "AUTH_SECRET", "TOKEN_ENCRYPTION_KEY"]

/** Keys written to benevoles-secret by the "Sync k8s secret" step of deploy.yml. */
function syncedSecretKeys(): string[] {
  const workflow = read(".github/workflows/deploy.yml")
  const block = workflow.match(/<<'KEYS'\n([\s\S]*?)\n\s*KEYS\n/)
  expect(block, "key list of the Sync k8s secret step").not.toBeNull()
  return block![1].split("\n").map((l) => l.trim()).filter(Boolean)
}

type SecretEnv = { name: string; key: string; optional: boolean }

/** The env entries of a manifest taken from benevoles-secret with secretKeyRef. */
function secretEnv(manifest: string): SecretEnv[] {
  const re =
    /- name: (\w+)\n\s+valueFrom:\n\s+secretKeyRef:\n\s+name: benevoles-secret\n\s+key: (\w+)\n(\s+optional: true\n)?/g
  return [...manifest.matchAll(re)].map((m) => ({ name: m[1], key: m[2], optional: Boolean(m[3]) }))
}

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length

describe("k8s pod hardening (#1050)", () => {
  it.each(POD_MANIFESTS)("%s: no service account token, RuntimeDefault seccomp, no escalation, no capability", (file) => {
    const m = read(file)
    const containers = count(m, /^\s+image: /gm)
    expect(containers).toBeGreaterThan(0)
    expect(m).toMatch(/^\s+automountServiceAccountToken: false$/m)
    expect(m).toMatch(/seccompProfile:\n\s+type: RuntimeDefault\n/)
    expect(count(m, /allowPrivilegeEscalation: false/g)).toBe(containers)
    expect(count(m, /capabilities:\n\s+drop: \[ALL\]\n/g)).toBe(containers)
    expect(m).not.toMatch(/privileged: true/)
  })

  it.each(POD_MANIFESTS)("%s: runAsNonRoot comes with a numeric user (the images only name theirs)", (file) => {
    const m = read(file)
    if (!m.includes("runAsNonRoot: true")) return
    expect(m).toMatch(/runAsNonRoot: true\n\s+runAsUser: [1-9]\d*\n\s+runAsGroup: \d+\n/)
  })

  it("the app and the migration run as the image's nextjs user (uid 1001)", () => {
    expect(read("Dockerfile")).toMatch(/adduser --system --uid 1001 nextjs\n/)
    expect(read("Dockerfile")).toMatch(/\nUSER nextjs\n/)
    for (const file of ["k8s/deployment.yaml", "k8s/job-migrate.yaml"]) {
      expect(read(file), file).toMatch(/runAsNonRoot: true\n\s+runAsUser: 1001\n/)
    }
  })

  it.each(POD_MANIFESTS)("%s: a read-only root filesystem always has a writable /tmp", (file) => {
    const m = read(file)
    if (!m.includes("readOnlyRootFilesystem: true")) return
    expect(m).toMatch(/- name: tmp\n\s+emptyDir:/)
    expect(m).toMatch(/- name: tmp\n\s+mountPath: \/tmp\n/)
  })

  it("the curl CronJobs, which only write /tmp/body, have a read-only root filesystem", () => {
    for (const job of ["reminders", "outbox", "cleanup", "release-check"]) {
      const m = read(`k8s/cronjob-${job}.yaml`)
      expect(m, job).toContain("readOnlyRootFilesystem: true")
      expect(m, job).toMatch(/runAsUser: 100\n\s+runAsGroup: 101\n/)
    }
  })

  it("no manifest hands a whole secret to a container", () => {
    for (const file of [...POD_MANIFESTS, "k8s/postgres.yaml", "k8s/media.yaml"]) {
      expect(read(file), file).not.toMatch(/envFrom:/)
    }
  })
})

describe("explicit secret keys for the app (#1050)", () => {
  const app = secretEnv(read("k8s/deployment.yaml"))
  const synced = syncedSecretKeys()

  it("each env entry takes the secret key of the same name", () => {
    expect(app.length).toBeGreaterThan(0)
    for (const e of app) expect(e.key).toBe(e.name)
    expect(new Set(app.map((e) => e.name)).size).toBe(app.length)
  })

  it("every key deploy.yml writes is either given to the app or listed as not read by it", () => {
    const given = new Set(app.map((e) => e.key))
    for (const key of synced) {
      expect(given.has(key) || NOT_FOR_THE_APP.includes(key), `${key}: add it to k8s/deployment.yaml, or to NOT_FOR_THE_APP`).toBe(true)
    }
  })

  it("keys the app never reads stay out of its pod", () => {
    const given = new Set(app.map((e) => e.key))
    for (const key of [...NOT_FOR_THE_APP, "BACKUP_PASSPHRASE"]) expect(given.has(key), key).toBe(false)
  })

  it("the app gets no key deploy.yml does not write", () => {
    for (const e of app) expect(synced, e.key).toContain(e.key)
  })

  it("only the keys the app cannot start without are required, the others stay optional as with envFrom", () => {
    expect(app.filter((e) => !e.optional).map((e) => e.key).sort()).toEqual([...REQUIRED_FOR_THE_APP].sort())
  })

  it("the migration Job gets DATABASE_URL only", () => {
    expect(secretEnv(read("k8s/job-migrate.yaml"))).toEqual([{ name: "DATABASE_URL", key: "DATABASE_URL", optional: false }])
  })

  it("the hand-managed backup passphrase still reaches the backup job", () => {
    expect(read("k8s/cronjob-backup.yaml")).toMatch(/- name: BACKUP_PASSPHRASE\n\s+valueFrom:\n\s+secretKeyRef:\n\s+name: benevoles-secret\n\s+key: BACKUP_PASSPHRASE\n/)
  })
})
