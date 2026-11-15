// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { spawnSync } from "child_process"

// #761: a Docker Compose install runs its scheduled tasks itself (the `cron` service and
// scripts/compose-cron.sh) and reports the app's health. Without the tasks no queued email and no
// reminder leaves, so the schedule is held to the Kubernetes CronJobs', the reference install.
const root = process.cwd()
const read = (f: string) => readFileSync(join(root, f), "utf8")
const compose = read("docker-compose.yml")
const SCRIPT = join(root, "scripts/compose-cron.sh")

/** The text of one top-level service of docker-compose.yml. */
function service(name: string): string {
  const m = compose.match(new RegExp(`\\n  ${name}:\\n((?:    .*\\n|\\s*\\n)+)`))
  expect(m, name).not.toBeNull()
  return m![1]
}

/** Only what the script needs: nothing of this shell leaks in. */
const cleanEnv = (extra: Record<string, string> = {}) =>
  ({ PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "/tmp", ...extra }) as unknown as NodeJS.ProcessEnv

const pad = (n: number) => String(n).padStart(2, "0")

/** The tasks the script calls at that UTC time. */
function due(hour: number, minute: number): string[] {
  const run = spawnSync("sh", [SCRIPT, "--due", pad(hour), pad(minute)], { env: cleanEnv(), encoding: "utf8" })
  expect(run.status).toBe(0)
  return run.stdout.split("\n").filter(Boolean)
}

/** Whether a five-field cron expression of the kinds used in k8s/ fires at that time (any day). */
function cronFires(expression: string, hour: number, minute: number): boolean {
  const [m, h, ...rest] = expression.trim().split(/\s+/)
  expect(rest).toEqual(["*", "*", "*"])
  const field = (spec: string, value: number) => {
    if (spec === "*") return true
    const step = spec.match(/^\*\/(\d+)$/)
    if (step) return value % Number(step[1]) === 0
    expect(spec).toMatch(/^\d+$/)
    return Number(spec) === value
  }
  return field(m, minute) && field(h, hour)
}

const K8S_TASKS = { outbox: "cronjob-outbox.yaml", reminders: "cronjob-reminders.yaml", cleanup: "cronjob-cleanup.yaml", "release-check": "cronjob-release-check.yaml" }

describe("scheduled tasks of the Docker Compose install (scripts/compose-cron.sh)", () => {
  it("calls the daily tasks at their hour, on top of the hourly and five-minute ones", () => {
    expect(due(2, 0)).toEqual(["outbox", "reminders", "cleanup"])
    expect(due(3, 0)).toEqual(["outbox", "reminders", "release-check"])
    expect(due(14, 0)).toEqual(["outbox", "reminders"])
    expect(due(14, 5)).toEqual(["outbox"])
    expect(due(2, 5)).toEqual(["outbox"])
    expect(due(14, 7)).toEqual([])
  })

  // Minute by minute over a day: exactly what the Kubernetes CronJobs fire, no more, no less.
  it("follows the schedules of the Kubernetes CronJobs over a whole day", () => {
    const schedules = Object.entries(K8S_TASKS).map(([task, file]) => {
      const schedule = read(`k8s/${file}`).match(/^\s*schedule:\s*"([^"]+)"/m)?.[1]
      expect(schedule, file).toBeDefined()
      expect(read(`k8s/${file}`)).toContain(`/api/cron/${task}`)
      return [task, schedule!] as const
    })
    const script = read("scripts/compose-cron.sh")
    // The script's rules, read once here instead of 1 440 shell runs: the cases above tie this
    // reading to the script's real output.
    expect(script).toContain('case "$2" in *0 | *5) echo outbox ;; esac')
    expect(script).toContain('[ "$2" = "00" ] && echo reminders')
    expect(script).toContain('[ "$1$2" = "0200" ] && echo cleanup')
    expect(script).toContain('[ "$1$2" = "0300" ] && echo release-check')
    const scriptDue = (h: number, m: number) => [
      ...(m % 5 === 0 ? ["outbox"] : []),
      ...(m === 0 ? ["reminders"] : []),
      ...(h === 2 && m === 0 ? ["cleanup"] : []),
      ...(h === 3 && m === 0 ? ["release-check"] : []),
    ]
    for (const [h, m] of [[2, 0], [3, 0], [14, 0], [14, 5], [14, 7], [0, 0], [23, 55]]) expect(scriptDue(h, m), `${h}:${m}`).toEqual(due(h, m))
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m++) {
        const expected = schedules.filter(([, schedule]) => cronFires(schedule, h, m)).map(([task]) => task).sort()
        expect([...scriptDue(h, m)].sort(), `${pad(h)}:${pad(m)}`).toEqual(expected)
      }
    }
  })

  // The loop sleeps to the start of the next minute from one clock reading; « 08 » and « 09 » would
  // be invalid octal numbers in shell arithmetic.
  it("sleeps to the start of the next minute, leading zeros included", () => {
    const wait = (second: string) => spawnSync("sh", [SCRIPT, "--until-next-minute", second], { env: cleanEnv(), encoding: "utf8" }).stdout.trim()
    expect(wait("00")).toBe("60")
    expect(wait("05")).toBe("55")
    expect(wait("08")).toBe("52")
    expect(wait("09")).toBe("51")
    expect(wait("59")).toBe("1")
  })

  // A restart in the middle of a due minute must not call its tasks again (the reminders are not
  // safe to run twice at once), a minute is handled once, and a task never overlaps itself.
  it("waits for a minute boundary before its first call, handles a minute once, and cuts a call before its period", () => {
    const script = read("scripts/compose-cron.sh")
    const loop = script.slice(script.indexOf('echo "Tâches planifiées'))
    expect(loop.indexOf('sleep "$(until_next_minute "$(date -u +%S)")"')).toBeGreaterThan(0)
    expect(loop.indexOf('sleep "$(until_next_minute "$(date -u +%S)")"')).toBeLessThan(loop.indexOf("while true"))
    expect(loop).toContain('if [ "$1$2" != "$last" ]; then')
    expect(loop).toContain("set -- $(date -u '+%H %M %S')")
    expect(script).toContain("--max-time 280")
    for (const file of Object.values(K8S_TASKS)) expect(read(`k8s/${file}`), file).toContain("concurrencyPolicy: Forbid")
  })

  it("stops with a message when the shared secret or the app's address is missing", () => {
    const noSecret = spawnSync("sh", [SCRIPT], { env: cleanEnv({ APP_URL: "http://app:3000" }), encoding: "utf8" })
    expect(noSecret.status).toBe(1)
    expect(noSecret.stderr).toContain("CRON_SECRET manquant")
    const noUrl = spawnSync("sh", [SCRIPT], { env: cleanEnv({ CRON_SECRET: "x" }), encoding: "utf8" })
    expect(noUrl.status).toBe(1)
    expect(noUrl.stderr).toContain("APP_URL manquant")
  })

  it("sends the secret as a bearer token, by POST, to the app's cron endpoints", () => {
    const script = read("scripts/compose-cron.sh")
    expect(script).toContain('-H "Authorization: Bearer ${CRON_SECRET}"')
    expect(script).toContain("-X POST")
    expect(script).toContain('"${APP_URL}/api/cron/$1"')
  })
})

describe("docker-compose.yml: health check and cron service", () => {
  it("reports the app healthy from /api/health", () => {
    const app = service("app")
    expect(app).toContain("healthcheck:")
    expect(app).toContain("http://localhost:3000/api/health'")
  })

  it("starts the cron service once the app is healthy, on the Compose network, with no port", () => {
    const cron = service("cron")
    expect(cron).toMatch(/depends_on:\n\s+app:\n\s+condition: service_healthy/)
    expect(cron).toContain("APP_URL: http://app:3000")
    expect(cron).toContain("./scripts/compose-cron.sh:/compose-cron.sh:ro")
    expect(cron).not.toMatch(/^\s*ports:/m)
    expect(cron).toContain("read_only: true")
    expect(cron).toMatch(/cap_drop:\n\s+- ALL/)
  })

  // One secret for both: a missing value stops `docker compose up` with a message, instead of an
  // install that looks fine and never sends a queued email.
  it("requires the shared secret in both services, with no default", () => {
    for (const name of ["app", "cron"]) {
      expect(service(name), name).toMatch(/CRON_SECRET: \$\{CRON_SECRET:\?[^}]+\}/)
    }
    expect(compose).not.toMatch(/CRON_SECRET: \$\{CRON_SECRET:-/)
  })

  // AUTH_TRUST_HOST would make sign-in trust the request's Host header: never on by default.
  it("fixes the sign-in address with AUTH_URL and passes AUTH_TRUST_HOST only when set", () => {
    const app = service("app")
    expect(app).toMatch(/AUTH_URL: \$\{AUTH_URL:-\$\{NEXT_PUBLIC_APP_URL:-http:\/\/localhost:3000\}\}/)
    expect(app).toMatch(/^\s+AUTH_TRUST_HOST:\s*$/m)
  })

  it("passes only documented variables through to the app", () => {
    const doc = read("docs/configuration.md")
    const passed = [...service("app").matchAll(/^ {6}([A-Z][A-Z0-9_]+):\s*$/gm)].map((m) => m[1])
    expect(passed.length).toBeGreaterThan(10)
    for (const name of passed) expect(doc, name).toContain(`\`${name}\``)
  })
})
