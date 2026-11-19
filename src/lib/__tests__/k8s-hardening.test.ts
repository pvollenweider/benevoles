// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "fs"
import { join, relative } from "path"
import { IMAGE_DISK_CACHE_MAX_BYTES } from "../image-disk-cache"

// Pod hardening of the Kubernetes manifests (#1050): restricted securityContext, no service
// account token, and the app given only the secret keys it reads instead of the whole secret.
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")

// Every manifest with a pod that the deploy workflow applies.
const POD_MANIFESTS = [
  "k8s/deployment.yaml",
  "k8s/job-migrate.yaml",
  "k8s/cronjob-reminders.yaml",
  "k8s/cronjob-outbox.yaml",
  "k8s/cronjob-bounces.yaml",
  "k8s/cronjob-cleanup.yaml",
  "k8s/cronjob-release-check.yaml",
  "k8s/cronjob-backup.yaml",
  "k8s/cronjob-backup-offsite.yaml",
]

// Keys of benevoles-secret the app never reads: they must not reach its pod.
const NOT_FOR_THE_APP = [
  "POSTGRES_USER", // postgres pod (the app gets DATABASE_URL)
  "POSTGRES_PASSWORD",
  "ADMIN_EMAIL", // startup bootstrap (self-hosted image) and prisma/seed.ts; deliberately not passed in k8s
  "ADMIN_PASSWORD",
  "OFFSITE_BUCKET", // k8s/cronjob-backup-offsite.yaml
  "MIGRATE_DATABASE_URL", // k8s/job-migrate.yaml: the schema owner, allowed to change the schema
]

// Keys that only the migration Job (MIGRATE_DATABASE_URL), or the postgres pod and the backup
// (POSTGRES_PASSWORD), may receive: never the app Deployment nor a CronJob that calls it.
const DATABASE_ADMIN_KEYS = ["MIGRATE_DATABASE_URL", "POSTGRES_PASSWORD"]

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

  // The app container (pentest INF-06): the image's application files belong to root
  // (docker-app-ownership.test.ts) and the root filesystem is read-only. The volumes are the paths
  // the server writes, measured with `docker diff`: the readiness file in /tmp, the optimised
  // images in .next/cache and Next.js's copies of the built static routes in .next/server/route-cache.
  describe("read-only root filesystem of the app container", () => {
    const app = read("k8s/deployment.yaml")
    const APP_VOLUMES: Record<string, string> = {
      tmp: "/tmp",
      "next-cache": "/app/.next/cache",
      "next-route-cache": "/app/.next/server/route-cache",
    }
    const MIB = 1024 * 1024
    const mounts = Object.fromEntries([...app.matchAll(/- name: ([\w-]+)\n\s+mountPath: (\S+)\n/g)].map((m) => [m[1], m[2]]))
    const volumes = Object.fromEntries(
      [...app.matchAll(/- name: ([\w-]+)\n\s+emptyDir:\n\s+sizeLimit: (\d+)Mi\n/g)].map((m) => [m[1], Number(m[2]) * MIB]),
    )

    it("is read-only, with the other restrictions kept", () => {
      expect(app).toMatch(/securityContext:\n\s+allowPrivilegeEscalation: false\n\s+readOnlyRootFilesystem: true\n\s+capabilities:\n\s+drop: \[ALL\]\n/)
      expect(app).not.toMatch(/readOnlyRootFilesystem: false/)
    })

    it("mounts exactly the paths the server writes", () => {
      expect(mounts).toEqual(APP_VOLUMES)
    })

    it("each mount is an emptyDir on disk with a size limit, nothing from the node or a claim", () => {
      expect(Object.keys(volumes).sort()).toEqual(Object.keys(APP_VOLUMES).sort())
      expect(count(app, /^\s+emptyDir:/gm)).toBe(Object.keys(APP_VOLUMES).length)
      expect(app).not.toMatch(/hostPath:|persistentVolumeClaim:|medium: Memory/)
    })

    it("never mounts over a folder the image fills: the Dockerfile creates the two cache folders empty", () => {
      const created = read("Dockerfile").match(/RUN mkdir -p ([^\\\n]+) \\\n && chown nextjs:nodejs ([^\\\n]+)\n/)
      expect(created, "RUN mkdir -p … && chown nextjs:nodejs … of the Dockerfile").not.toBeNull()
      const underApp = Object.values(APP_VOLUMES).filter((p) => p.startsWith("/app/")).map((p) => p.slice("/app/".length))
      expect(created![1].split(" ").sort()).toEqual(underApp.sort())
      expect(created![2]).toBe(created![1])
      // The pages and routes built into the image stay where Next.js reads them.
      for (const p of Object.values(APP_VOLUMES)) expect(["/app", "/app/.next", "/app/.next/server", "/app/.next/server/app"]).not.toContain(p)
    })

    it("the image cache volume holds at least twice what Next.js may keep there", () => {
      expect(read("next.config.ts")).toMatch(/maximumDiskCacheSize: IMAGE_DISK_CACHE_MAX_BYTES,\n/)
      expect(IMAGE_DISK_CACHE_MAX_BYTES).toBeGreaterThanOrEqual(50 * MIB)
      expect(volumes["next-cache"]).toBeGreaterThanOrEqual(2 * IMAGE_DISK_CACHE_MAX_BYTES)
    })

    it("the readiness file of the warm-up goes to the /tmp volume", () => {
      expect(read("docker-entrypoint.sh")).toContain('READY_FILE="${WARMUP_READY_FILE:-/tmp/benevoles-ready}"')
      expect(app).not.toMatch(/WARMUP_READY_FILE/)
    })
  })

  it.each(POD_MANIFESTS)("%s: a read-only root filesystem always has a writable /tmp", (file) => {
    const m = read(file)
    if (!m.includes("readOnlyRootFilesystem: true")) return
    expect(m).toMatch(/- name: tmp\n\s+emptyDir:/)
    expect(m).toMatch(/- name: tmp\n\s+mountPath: \/tmp\n/)
  })

  it("the curl CronJobs, which only write /tmp/body, have a read-only root filesystem", () => {
    for (const job of ["reminders", "outbox", "bounces", "cleanup", "release-check"]) {
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

  it("the migration Job gets the schema owner's URL only, under the name DATABASE_URL", () => {
    expect(secretEnv(read("k8s/job-migrate.yaml"))).toEqual([{ name: "DATABASE_URL", key: "MIGRATE_DATABASE_URL", optional: false }])
  })

  it("the app connects as benevoles_app and the migration Job as benevoles_owner, never as POSTGRES_USER", () => {
    const workflow = read(".github/workflows/deploy.yml")
    const url = (key: string) => workflow.match(new RegExp(`^\\s+${key}: "(postgresql://[^"]+)"$`, "m"))?.[1]
    expect(url("DATABASE_URL")).toBe("postgresql://benevoles_app:${{ secrets.APP_DB_PASSWORD }}@postgres:5432/benevoles")
    expect(url("MIGRATE_DATABASE_URL")).toBe("postgresql://benevoles_owner:${{ secrets.MIGRATE_DB_PASSWORD }}@postgres:5432/benevoles")
    expect(workflow).not.toMatch(/postgresql:\/\/\$\{\{ secrets\.POSTGRES_USER/)
  })

  it.each(POD_MANIFESTS.filter((f) => f !== "k8s/job-migrate.yaml" && f !== "k8s/cronjob-backup.yaml"))(
    "%s never receives the schema owner's URL nor the superuser password",
    (file) => {
      const m = read(file)
      for (const key of DATABASE_ADMIN_KEYS) expect(m, `${file}: ${key}`).not.toMatch(new RegExp(`key: ${key}\\b`))
    },
  )

  it("only the backup reads the superuser password, as PGPASSWORD", () => {
    const readers = POD_MANIFESTS.filter((f) => /key: POSTGRES_PASSWORD\b/.test(read(f)))
    expect(readers).toEqual(["k8s/cronjob-backup.yaml"])
    expect(read("k8s/cronjob-backup.yaml")).toMatch(/- name: PGPASSWORD\n\s+valueFrom:\n\s+secretKeyRef:\n\s+name: benevoles-secret\n\s+key: POSTGRES_PASSWORD\n/)
    expect(read("k8s/cronjob-backup.yaml")).not.toMatch(/key: MIGRATE_DATABASE_URL\b/)
  })

  it("the hand-managed backup passphrase still reaches the backup job", () => {
    expect(read("k8s/cronjob-backup.yaml")).toMatch(/- name: BACKUP_PASSPHRASE\n\s+valueFrom:\n\s+secretKeyRef:\n\s+name: benevoles-secret\n\s+key: BACKUP_PASSPHRASE\n/)
  })
})

// The nightly dump: nothing installed at run time, authenticated encryption, the passphrase never
// an argument of a process. scripts/test-offsite-backup.sh runs the script itself.
describe("nightly backup: image, encryption and passphrase handling", () => {
  const manifest = read("k8s/cronjob-backup.yaml")
  const cut = manifest.indexOf("\n          containers:\n")
  const dump = manifest.slice(manifest.indexOf("\n          initContainers:\n"), cut)
  const heartbeat = manifest.slice(cut)
  const script = manifest.slice(manifest.indexOf("# >>> BACKUP_SCRIPT_START"), manifest.indexOf("# <<< BACKUP_SCRIPT_END"))
  // The same without its comment lines, for what the commands must not contain.
  const code = script.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n")

  /** Every file under a directory of the repository, as repo-relative paths. */
  const filesUnder = (dir: string) =>
    readdirSync(join(process.cwd(), dir), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => relative(process.cwd(), join(e.parentPath, e.name)))

  it("splits the job in a dump init container and a heartbeat container", () => {
    expect(cut).toBeGreaterThan(-1)
    expect(dump).toMatch(/- name: backup\n\s+image: postgres:16\n/)
    expect(heartbeat).toMatch(/- name: heartbeat\n\s+image: curlimages\/curl:[\d.]+\n/)
    expect(script.length).toBeGreaterThan(500)
    expect(script).toMatch(/^# >>> BACKUP_SCRIPT_START.*\n\s+set -e\n/)
  })

  it("installs no package at run time, in either backup job", () => {
    for (const file of ["k8s/cronjob-backup.yaml", "k8s/cronjob-backup-offsite.yaml"]) {
      expect(read(file), file).not.toMatch(/\b(apk\s+add|apt-get|apt\s+install|dnf\s+install|yum\s+install|pip3?\s+install|npm\s+i(nstall)?\b)/)
    }
    // The Alpine image ships neither gpg nor openssl: the tools come with the Debian one.
    expect(dump).not.toMatch(/image: postgres:[\w.-]*alpine/)
  })

  it("encrypts new backups with gpg, AES256, in the format every gpg 2.2+ reads", () => {
    expect(script).toContain('FILENAME="benevoles_$(date -u +%Y-%m-%d_%H-%M).sql.gz.gpg"')
    expect(script).toMatch(/gpg_backup --symmetric --cipher-algo AES256 /)
    expect(script).toMatch(/--output "\/backups\/\$\{FILENAME\}" \/tmp\/dump\.sql\.gz/)
    expect(code).not.toMatch(/openssl/)
    expect(code).not.toMatch(/--force-(ocb|aead)|--aead-algo|--disable-mdc|--ignore-mdc-error/)
  })

  it("gives gpg the passphrase on standard input, never as an argument", () => {
    expect(script).toMatch(/printf '%s\\n' "\$\{BACKUP_PASSPHRASE\}" \| gpg --batch --yes --no-tty \\\n\s+--pinentry-mode loopback --passphrase-fd 0 /)
    // BACKUP_PASSPHRASE appears only in the empty check and in that printf.
    expect(count(code, /BACKUP_PASSPHRASE/g)).toBe(count(code, /-z "\$\{BACKUP_PASSPHRASE\}"|printf '%s\\n' "\$\{BACKUP_PASSPHRASE\}" \||BACKUP_PASSPHRASE est vide/g))
    // Every gpg call goes through gpg_backup.
    expect(count(code, /(^|[\s|;(])gpg /g)).toBe(1)
  })

  it("no file of k8s/ or scripts/ passes a passphrase on a command line", () => {
    const files = [...filesUnder("k8s"), ...filesUnder("scripts")]
    expect(files.length).toBeGreaterThan(50)
    for (const file of files) {
      const text = read(file)
      expect(text, `${file}: openssl pass: argument`).not.toMatch(/-pass(in|out)?\s+["']?pass:/)
      expect(text, `${file}: gpg --passphrase argument`).not.toMatch(/--passphrase[\s=]/)
    }
  })

  it("keeps the dump in a file, the size check and the verification after writing", () => {
    expect(script).toContain("pg_dump --no-password > /tmp/dump.sql\n")
    expect(script).toMatch(/if \[ "\$DUMP_SIZE" -lt 1024 \]; then\n(.*\n){1,2}\s+exit 1\n/)
    expect(script).toMatch(/if ! gpg_backup --decrypt --output \/tmp\/verify\.sql\.gz "\/backups\/\$\{FILENAME\}" \\\n\s+\|\| ! gunzip -c \/tmp\/verify\.sql\.gz > \/tmp\/verify\.sql; then\n(.*\n)?\s+rm -f "\/backups\/\$\{FILENAME\}"\n\s+exit 1\n/)
    expect(script).toMatch(/if \[ "\$VERIFY_SIZE" != "\$DUMP_SIZE" \]; then\n(.*\n)?\s+rm -f "\/backups\/\$\{FILENAME\}"\n\s+exit 1\n/)
    // No pipeline hides pg_dump's exit code.
    expect(code).not.toMatch(/pg_dump[^\n]*\|/)
  })

  it("rotates both formats after 30 days", () => {
    expect(script).toMatch(/find \/backups \\\( -name "benevoles_\*\.sql\.gz\.gpg" -o -name "benevoles_\*\.sql\.gz\.enc" \\\) \\\n\s+-mtime \+30 -print -delete/)
  })

  it("sends the heartbeat from the second container, which gets no database or backup secret", () => {
    expect(secretEnv(dump).map((e) => e.name).sort()).toEqual(["BACKUP_PASSPHRASE", "PGPASSWORD", "PGUSER"])
    expect(secretEnv(heartbeat).map((e) => `${e.name}=${e.key}`).sort()).toEqual(["APP_URL=NEXT_PUBLIC_APP_URL", "CRON_SECRET=CRON_SECRET"])
    expect(dump).not.toMatch(/heartbeat|CRON_SECRET/)
    expect(heartbeat).toContain('-d \'{"job":"backup","ok":true}\'')
    expect(heartbeat).toContain('"${APP_URL}/api/cron/heartbeat"')
    expect(heartbeat).toMatch(/runAsNonRoot: true\n\s+runAsUser: 100\n\s+runAsGroup: 101\n/)
    expect(heartbeat).toContain("readOnlyRootFilesystem: true")
    // A heartbeat that cannot be sent must not fail a backup that succeeded.
    expect(heartbeat).not.toMatch(/set -e|exit 1/)
  })

  it("the off-site job copies the whole volume, whatever the format", () => {
    expect(read("k8s/cronjob-backup-offsite.yaml")).toMatch(/rclone copy \/backups "\$REMOTE" /)
  })

  it("the restore script reads both formats, without the passphrase on a command line", () => {
    const restore = read("scripts/restore-test-offsite.sh")
    expect(restore).toContain('"$DUMP_DIR"/benevoles_*.sql.gz.gpg "$DUMP_DIR"/benevoles_*.sql.gz.enc')
    expect(restore).toContain("grep -E '^benevoles_.*\\.sql\\.gz\\.(gpg|enc)$'")
    expect(restore).toMatch(/printf '%s\\n' "\$BACKUP_PASSPHRASE" \| gpg [^\n]*\\\n\s+--pinentry-mode loopback --passphrase-fd 0 [^\n]*\\\n\s+--decrypt /)
    expect(restore).toMatch(/openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \\\n\s+-pass env:BACKUP_PASSPHRASE /)
  })

  it("the restore documentation gives the command for both formats, without the passphrase in it", () => {
    for (const text of [read("docs/deploiement.md"), manifest.slice(0, manifest.indexOf("\n---\n"))]) {
      expect(text).toMatch(/gpg --pinentry-mode loopback --output dump\.sql\.gz --decrypt benevoles_<date>\.sql\.gz\.gpg/)
      expect(text).toMatch(/openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \\\n[# ]+-in benevoles_<date>\.sql\.gz\.enc -out dump\.sql\.gz/)
      expect(text).not.toMatch(/-pass\s+["']?pass:|--passphrase[\s=]/)
    }
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

  it("denies ingress by default", () => {
    expect(byName("default-deny-ingress")).toMatch(/podSelector: \{\}\n\s+policyTypes: \[Ingress\]\n/)
  })

  describe("egress", () => {
    const egress = docs.filter((d) => /policyTypes: \[Egress\]/.test(d))
    const selectorOf = (d: string) => d.match(/podSelector:\n\s+matchLabels:\n\s+app: ([\w-]+)\n\s+policyTypes/)![1]
    const dns = /namespaceSelector:\n\s+matchLabels:\n\s+kubernetes\.io\/metadata\.name: kube-system\n\s+podSelector:\n\s+matchLabels:\n\s+k8s-app: kube-dns\n\s+ports:\n\s+- protocol: UDP\n\s+port: 53\n\s+- protocol: TCP\n\s+port: 53\n/

    it("restricts every pod of the namespace, each by its own label", () => {
      expect(egress.map(selectorOf).sort()).toEqual(["backup-offsite", "benevoles-app", "benevoles-cron", "benevoles-media", "benevoles-migrate", "postgres", "postgres-backup"])
      // One pod label per policy, never the whole namespace: an unlabelled pod (a Job started from
      // an older template) keeps free egress instead of being cut off.
      for (const d of egress) expect(d).not.toMatch(/podSelector: \{\}/)
      // No policy mixes directions: an egress rule never changes what may come in.
      for (const d of egress) expect(d).not.toMatch(/Ingress|^\s+ingress:/m)
    })

    const INTERNAL = ["10.42.0.0/16", "10.43.0.0/16", "169.254.0.0/16", "188.165.255.107/32", "188.165.255.51/32"]
    const exceptOf = (d: string) =>
      d.match(/ipBlock:\n\s+cidr: 0\.0\.0\.0\/0\n\s+except:\n((?:\s+- \S+\n)+)/)![1].trim().split("\n").map((l) => l.trim().replace(/^- /, "")).sort()

    it("lets the app reach the cluster DNS, postgres, Traefik and the internet, never the rest of the cluster", () => {
      const d = byName("app-egress")
      expect(d).toMatch(dns)
      expect(d).toMatch(/- to:\n\s+- podSelector:\n\s+matchLabels:\n\s+app: postgres\n\s+ports:\n\s+- protocol: TCP\n\s+port: 5432\n/)
      expect(d.match(/^\s+- to:/gm)).toHaveLength(4)
      // Web push services choose their own host and port, and the SMTP port is a setting: the
      // internet rule carries no port. What it must never include is the inside of the cluster.
      expect(exceptOf(d)).toEqual(INTERNAL)
      expect(d).not.toMatch(/ipBlock:[\s\S]*ports:/)
      // Regression: the standalone build sends the proxy's 404 rewrite (/_404/page/introuvable)
      // out as an HTTP request to the public host, which the node hands to Traefik. Without this
      // rule every unknown URL answered 500. Only Traefik's port, nothing else in kube-system.
      expect(d).toMatch(/namespaceSelector:\n\s+matchLabels:\n\s+kubernetes\.io\/metadata\.name: kube-system\n\s+podSelector:\n\s+matchLabels:\n\s+app\.kubernetes\.io\/name: traefik\n\s+ports:\n\s+- protocol: TCP\n\s+port: 8443\n/)
    })

    it("every rule to the internet leaves out the same internal ranges", () => {
      const withBlock = egress.filter((d) => d.includes("ipBlock"))
      expect(withBlock.map(selectorOf).sort()).toEqual(["backup-offsite", "benevoles-app"])
      for (const d of withBlock) expect(exceptOf(d), selectorOf(d)).toEqual(INTERNAL)
    })

    const traefikOut = /app\.kubernetes\.io\/name: traefik\n\s+ports:\n\s+- protocol: TCP\n\s+port: 8443\n/

    it("lets the database backup reach the cluster DNS, postgres and Traefik only", () => {
      const d = byName("backup-egress")
      expect(d).toMatch(dns)
      expect(d).toMatch(/- to:\n\s+- podSelector:\n\s+matchLabels:\n\s+app: postgres\n\s+ports:\n\s+- protocol: TCP\n\s+port: 5432\n/)
      // The heartbeat container calls the public address, which lands on the Traefik pod.
      expect(d).toMatch(traefikOut)
      expect(d.match(/^\s+- to:/gm)).toHaveLength(3)
      expect(d).not.toContain("ipBlock")
    })

    it("lets the off-site copy reach the cluster DNS, Traefik and the internet on 443, never the cluster", () => {
      const d = byName("backup-offsite-egress")
      expect(d).toMatch(dns)
      expect(d).toMatch(traefikOut)
      expect(d.match(/^\s+- to:/gm)).toHaveLength(3)
      // Pod and service ranges, link-local, and both addresses of the node: the cluster API is
      // published on the node, so a rule that left the node in would leave the API reachable
      // (measured on the cluster with the service address 10.43.0.1).
      const block = d.match(/ipBlock:\n\s+cidr: 0\.0\.0\.0\/0\n\s+except:\n((?:\s+- \S+\n)+)\s+ports:\n\s+- protocol: TCP\n\s+port: 443\n/)
      expect(block).not.toBeNull()
      const except = block![1].trim().split("\n").map((l) => l.trim().replace(/^- /, ""))
      expect(except.sort()).toEqual(["10.42.0.0/16", "10.43.0.0/16", "169.254.0.0/16", "188.165.255.107/32", "188.165.255.51/32"])
      expect(read("k8s/cronjob-backup-offsite.yaml")).toMatch(/template:\n\s+metadata:\n(?:\s+#.*\n)*\s+labels:\n\s+app: backup-offsite\n/)
      // The job needs nothing from postgres, and postgres lets no such pod in.
      expect(d).not.toContain("5432")
      expect(byName("postgres-from-clients")).not.toContain("backup-offsite")
    })

    it("gives postgres and the media server no outgoing connection at all", () => {
      for (const name of ["postgres-no-egress", "media-no-egress"]) expect(byName(name), name).not.toMatch(/^\s+egress:/m)
      expect(read("k8s/postgres.yaml")).toMatch(/template:\n\s+metadata:\n(?:\s+#.*\n)*\s+labels:\n\s+app: postgres\n/)
      expect(read("k8s/media.yaml")).toMatch(/template:\n\s+metadata:\n(?:\s+#.*\n)*\s+labels:\n\s+app: benevoles-media\n/)
    })

    it("lets the migration Job reach the cluster DNS and postgres only", () => {
      const d = byName("migrate-egress")
      expect(d).toMatch(dns)
      expect(d).toMatch(/- to:\n\s+- podSelector:\n\s+matchLabels:\n\s+app: postgres\n\s+ports:\n\s+- protocol: TCP\n\s+port: 5432\n/)
      expect(d.match(/^\s+- to:/gm)).toHaveLength(2)
      expect(d).not.toContain("ipBlock")
      // Prisma would otherwise try an update check the policy refuses.
      expect(read("k8s/job-migrate.yaml")).toMatch(/- name: CHECKPOINT_DISABLE\n\s+value: "1"\n/)
    })

    it("lets the CronJobs that call the app reach the cluster DNS and Traefik only", () => {
      const d = byName("cron-egress")
      expect(d).toMatch(dns)
      // The public address resolves to the node, which hands the connection to the Traefik pod on
      // its websecure port: measured on the cluster, an ipBlock for the internet does not cover it.
      expect(d).toMatch(/app\.kubernetes\.io\/name: traefik\n\s+ports:\n\s+- protocol: TCP\n\s+port: 8443\n/)
      expect(d.match(/^\s+- to:/gm)).toHaveLength(2)
      expect(d).not.toContain("ipBlock")
      for (const job of ["reminders", "outbox", "bounces", "cleanup", "release-check"]) {
        const manifest = read(`k8s/cronjob-${job}.yaml`)
        expect(manifest, job).toMatch(/template:\n\s+metadata:\n(?:\s+#.*\n)*\s+labels:\n\s+app: benevoles-cron\n/)
        // The label is only right for a job that calls the public address and nothing else.
        expect(manifest, job).toContain("${APP_URL}/api/cron/")
        expect(manifest, job).not.toMatch(/PGHOST|DATABASE_URL/)
      }
    })
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

// Deploy credential limited to the namespace: k8s/rbac-ci-deployer.yaml, applied by hand.
describe("namespace and deploy credential", () => {
  const rbac = read("k8s/rbac-ci-deployer.yaml")
  const workflow = read(".github/workflows/deploy.yml")
  const docs = rbac.split(/^---$/m)
  const kinds = docs.map((d) => d.match(/^kind: (\w+)$/m)?.[1])

  type Rule = { apiGroups: string[]; resources: string[]; resourceNames?: string[]; verbs: string[] }
  const list = (s: string) => s.split(",").map((v) => v.trim().replace(/^"|"$/g, ""))
  const role = docs.find((d) => /^kind: Role$/m.test(d))!
  const rules: Rule[] = [...role.matchAll(/- apiGroups: \[([^\]]*)\]\n\s+resources: \[([^\]]*)\]\n(?:\s+resourceNames: \[([^\]]*)\]\n)?\s+verbs: \[([^\]]*)\]/g)].map(
    (m) => ({ apiGroups: list(m[1]), resources: list(m[2]), resourceNames: m[3] === undefined ? undefined : list(m[3]), verbs: list(m[4]) }),
  )

  it("the namespace enforces the Pod Security baseline level", () => {
    const ns = read("k8s/namespace.yaml")
    expect(ns).toMatch(/labels:\n\s+pod-security\.kubernetes\.io\/enforce: baseline\n\s+pod-security\.kubernetes\.io\/enforce-version: latest\n/)
  })

  it("is namespaced only: a ServiceAccount, its token, a Role and a RoleBinding in benevoles", () => {
    expect(kinds).toEqual(["ServiceAccount", "Secret", "Role", "RoleBinding"])
    for (const d of docs) expect(d).toMatch(/^ {2}namespace: benevoles$/m)
    expect(rbac).not.toMatch(/Cluster(Role|RoleBinding)/)
    expect(rbac).toMatch(/kind: ServiceAccount\nmetadata:\n\s+name: ci-deployer\n\s+namespace: benevoles\nautomountServiceAccountToken: false\n/)
    expect(rbac).toMatch(/roleRef:\n\s+apiGroup: rbac\.authorization\.k8s\.io\n\s+kind: Role\n\s+name: ci-deployer\n/)
  })

  it("parses every rule of the Role", () => {
    expect(rules.length).toBe(count(role, /- apiGroups:/g))
    expect(rules.length).toBeGreaterThan(0)
  })

  it("grants no wildcard, no RBAC, no escalation verb", () => {
    for (const r of rules) {
      for (const v of [...r.apiGroups, ...r.resources, ...r.verbs]) expect(v).not.toBe("*")
      expect(r.apiGroups).not.toContain("rbac.authorization.k8s.io")
      for (const v of ["escalate", "bind", "impersonate"]) expect(r.verbs).not.toContain(v)
      for (const res of ["serviceaccounts", "serviceaccounts/token", "pods/exec", "pods/attach", "configmaps"]) {
        expect(r.resources).not.toContain(res)
      }
    }
  })

  it("reaches secrets only by name: the two the workflow syncs, read and patch, never create or list", () => {
    const onSecrets = rules.filter((r) => r.apiGroups.includes("") && r.resources.includes("secrets"))
    expect(onSecrets).toEqual([
      { apiGroups: [""], resources: ["secrets"], resourceNames: ["benevoles-secret", "ghcr-secret"], verbs: ["get", "patch"] },
    ])
    expect(workflow).toContain("kubectl create secret docker-registry ghcr-secret")
    expect(workflow).toMatch(/kubectl create secret generic benevoles-secret/)
  })

  it("covers, with get, create and patch, every kind the workflow applies", () => {
    const resourceOf: Record<string, [string, string]> = {
      Deployment: ["apps", "deployments"],
      Service: ["", "services"],
      PersistentVolumeClaim: ["", "persistentvolumeclaims"],
      Job: ["batch", "jobs"],
      CronJob: ["batch", "cronjobs"],
      NetworkPolicy: ["networking.k8s.io", "networkpolicies"],
      Ingress: ["networking.k8s.io", "ingresses"],
      Middleware: ["traefik.io", "middlewares"],
      IngressRoute: ["traefik.io", "ingressroutes"],
    }
    const files = [...new Set([...workflow.matchAll(/(?:kubectl apply -f|envsubst <) (k8s\/[\w.-]+\.yaml)/g)].map((m) => m[1]))]
    expect(files.length).toBeGreaterThan(10)
    for (const file of files) {
      for (const [, kind] of read(file).matchAll(/^kind: (\w+)$/gm)) {
        const target = resourceOf[kind]
        expect(target, `${file}: ${kind} is not covered by k8s/rbac-ci-deployer.yaml`).toBeDefined()
        const [group, resource] = target
        const verbs = rules
          .filter((r) => r.apiGroups.includes(group) && r.resources.includes(resource) && !r.resourceNames)
          .flatMap((r) => r.verbs)
        for (const v of ["get", "create", "patch"]) expect(verbs, `${file}: ${v} ${resource}`).toContain(v)
      }
    }
  })
})
