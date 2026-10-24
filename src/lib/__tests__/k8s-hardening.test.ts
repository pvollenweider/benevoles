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

  // Root entrypoints kept as such (postgres drops to uid 70 with su-exec, nginx runs its workers as
  // nginx, video-publish writes with tar as root): only the capabilities they use, nothing else.
  it.each([
    ["k8s/postgres.yaml", "[CHOWN, DAC_OVERRIDE, FOWNER, SETGID, SETUID]"],
    ["k8s/media.yaml", "[CHOWN, DAC_OVERRIDE, FOWNER, FSETID, SETGID, SETUID]"],
  ])("%s: no service account token, RuntimeDefault seccomp, no escalation, only the capabilities it needs", (file, caps) => {
    const m = read(file)
    expect(count(m, /^\s+image: /gm)).toBe(1)
    expect(m).toMatch(/^\s+automountServiceAccountToken: false$/m)
    expect(m).toMatch(/seccompProfile:\n\s+type: RuntimeDefault\n/)
    expect(m).toContain("allowPrivilegeEscalation: false")
    expect(m).toContain(`capabilities:\n              drop: [ALL]\n              add: ${caps}\n`)
    expect(m).not.toMatch(/^\s+(runAsUser|fsGroup):/m) // the data volumes keep their current owners
  })

  it("postgres is replaced, never run twice on the same data directory", () => {
    expect(read("k8s/postgres.yaml")).toMatch(/strategy:\n\s+type: Recreate\n/)
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

describe("NetworkPolicy of the namespace (#1050)", () => {
  const policy = read("k8s/networkpolicy.yaml")
  const workflow = read(".github/workflows/deploy.yml")
  const docs = policy.split(/^---$/m).filter((d) => d.includes("kind: NetworkPolicy"))
  const byName = (name: string) => {
    const doc = docs.find((d) => d.includes(`name: ${name}\n`))
    expect(doc, name).toBeDefined()
    return doc!
  }

  it("denies ingress by default and never restricts egress", () => {
    expect(byName("default-deny-ingress")).toMatch(/podSelector: \{\}\n\s+policyTypes: \[Ingress\]\n/)
    for (const d of docs) expect(d).not.toMatch(/policyTypes:.*Egress|^\s+egress:/m)
  })

  it("lets Traefik reach the app, the media server and the ACME solver on their container ports", () => {
    const traefik = /namespaceSelector:\n\s+matchLabels:\n\s+kubernetes\.io\/metadata\.name: kube-system\n\s+podSelector:\n\s+matchLabels:\n\s+app\.kubernetes\.io\/name: traefik\n/
    const cases: [string, string, string][] = [
      ["app-from-traefik", "app: benevoles-app", read("k8s/deployment.yaml").match(/containerPort: (\d+)/)![1]],
      ["media-from-traefik", "app: benevoles-media", read("k8s/media.yaml").match(/containerPort: (\d+)/)![1]],
      // cert-manager's HTTP-01 solver pods (label and port of cert-manager's acmesolver).
      ["acme-solver-from-traefik", 'acme.cert-manager.io/http01-solver: "true"', "8089"],
    ]
    for (const [name, selector, port] of cases) {
      const d = byName(name)
      expect(d, name).toContain(selector)
      expect(d, name).toMatch(traefik)
      expect(d, name).toContain(`port: ${port}\n`)
    }
  })

  it("lets every pod that talks to postgres through, by the labels its manifest sets", () => {
    const d = byName("postgres-from-clients")
    expect(d).toContain("port: 5432\n")
    const allowed = d.match(/values: \[([^\]]+)\]/)![1].split(",").map((v) => v.trim())
    const labelOf = (file: string) => read(file).match(/template:\n\s+metadata:\n\s+labels:\n\s+app: ([\w-]+)\n/)![1]
    expect(labelOf("k8s/deployment.yaml")).toBe("benevoles-app")
    expect(labelOf("k8s/job-migrate.yaml")).toBe("benevoles-migrate")
    expect(read("k8s/cronjob-backup.yaml")).toMatch(/template:\n\s+metadata:\n(?:\s+#.*\n)*\s+labels:\n\s+app: postgres-backup\n/)
    expect(allowed.sort()).toEqual(["benevoles-app", "benevoles-migrate", "postgres-backup"])
  })

  it("lists the default deny last, so a partial apply never denies without the allow rules", () => {
    expect(docs[docs.length - 1]).toContain("name: default-deny-ingress\n")
  })

  it("every policy carries the label the deploy workflow removes them by", () => {
    for (const d of docs) expect(d).toContain("app.kubernetes.io/part-of: benevoles-netpol")
  })

  it("is applied before the migration and removed again if the deploy fails afterwards", () => {
    const apply = workflow.indexOf("kubectl apply -f k8s/networkpolicy.yaml")
    expect(apply).toBeGreaterThan(-1)
    expect(apply).toBeLessThan(workflow.indexOf("envsubst < k8s/job-migrate.yaml"))
    // Also after a partial apply or a cancelled run, not only after a successful apply.
    expect(workflow).toMatch(/if: \(failure\(\) \|\| cancelled\(\)\) && steps\.netpol\.outcome != 'skipped'\n\s+run: \|\n\s+kubectl -n benevoles delete networkpolicy -l app\.kubernetes\.io\/part-of=benevoles-netpol/)
    // The backup CronJob gets its label before the policy is in place.
    expect(workflow.indexOf("kubectl apply -f k8s/cronjob-backup.yaml")).toBeLessThan(apply)
    expect(workflow.indexOf("Check the site through the NetworkPolicy")).toBeGreaterThan(workflow.indexOf("rollout status deployment/benevoles-app"))
  })
})
