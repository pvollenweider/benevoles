import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import zlib from "node:zlib"
import { RETENTION, RETENTION_DAYS } from "../retention"

// Traefik access logs kept one year, full client address 90 days (owner decision 2026-10-22):
// k8s/traefik-config.yaml writes the JSON file, the node rotates it (k8s/node/traefik-access.logrotate)
// and truncates old addresses (k8s/node/traefik-log-anonymise). The node script is Python 3
// (standard library only, what the Ubuntu node has); these cases run it as the cron does.
const root = path.join(__dirname, "..", "..", "..")
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf-8")
const SCRIPT = path.join(root, "k8s/node/traefik-log-anonymise")
const STATS = path.join(root, "k8s/node/traefik-log-stats")

function filter(input: string): string {
  return execFileSync("python3", ["-I", SCRIPT, "--filter"], { input, encoding: "utf-8" })
}

const line = (fields: Record<string, unknown>) => `${JSON.stringify(fields)}\n`
const parse = (out: string) => out.trim().split("\n").map((l) => JSON.parse(l))

describe("traefik-log-anonymise --filter", () => {
  it("truncates IPv4 to /24, drops the client port and the User-Agent", () => {
    const [r] = parse(filter(line({ ClientAddr: "203.0.113.57:51234", ClientHost: "203.0.113.57", ClientPort: "51234", RequestHost: "www.benevol.app", RequestPath: "/doc/admin", DownstreamStatus: 200, "request_User-Agent": "Mozilla/5.0" })))
    expect(r).toEqual({ ClientAddr: "203.0.113.0", ClientHost: "203.0.113.0", RequestHost: "www.benevol.app", RequestPath: "/doc/admin", DownstreamStatus: 200 })
  })

  it("truncates IPv6 to /48, with or without brackets and port, and IPv4-mapped addresses to /24", () => {
    const out = parse(filter(line({ ClientAddr: "[2001:db8:1234:5678::1]:443", ClientHost: "2001:db8:1234:5678::1" }) + line({ ClientHost: "::ffff:198.51.100.9", ClientAddr: "[::ffff:198.51.100.9]:80" })))
    expect(out[0]).toEqual({ ClientAddr: "2001:db8:1234::", ClientHost: "2001:db8:1234::" })
    expect(out[1]).toEqual({ ClientHost: "198.51.100.0", ClientAddr: "198.51.100.0" })
  })

  it("leaves the other fields and the non-address values alone", () => {
    const [r] = parse(filter(line({ ClientHost: "-", ClientUsername: "-", ServiceAddr: "10.42.0.17:3000", RequestPath: "/a?b=1.2.3.4" })))
    expect(r).toEqual({ ClientHost: "-", ClientUsername: "-", ServiceAddr: "10.42.0.17:3000", RequestPath: "/a?b=1.2.3.4" })
  })

  it("truncates forwarded-for headers too, should headers ever be kept", () => {
    const [r] = parse(filter(line({ "request_X-Forwarded-For": "203.0.113.57, 2001:db8:1234:5678::1" })))
    expect(r["request_X-Forwarded-For"]).toBe("203.0.113.0, 2001:db8:1234::")
  })

  it("truncates address-looking words of a line that is not JSON", () => {
    expect(filter("oops 192.0.2.77 [2001:db8:aaaa:bbbb::2]:80 at 12:30:45 v1.2.3\n")).toBe("oops 192.0.2.0 [2001:db8:aaaa::]:80 at 12:30:45 v1.2.3\n")
  })

  it("is idempotent", () => {
    const input = line({ ClientAddr: "203.0.113.57:1", ClientHost: "2001:db8:1234:5678::1", ClientPort: "1" }) + "free text 192.0.2.77\n"
    const once = filter(input)
    expect(filter(once)).toBe(once)
  })
})

describe("traefik-log-anonymise on a log directory", () => {
  let dir: string
  let live: string
  const TODAY = "2026-10-22"
  // Without timestamps, a rotated file holds the day before its date: its oldest line is 89 days
  // old on 2026-10-22 for access.log-20260726 (due: reduced before any line passes 90 days),
  // 88 days for access.log-20260727.
  const DUE = "access.log-20260726.gz"
  const RECENT = "access.log-20260727.gz"
  const RAW = line({ ClientAddr: "203.0.113.57:51234", ClientHost: "203.0.113.57", ClientPort: "51234", RequestPath: "/" })
  const gz = (name: string, text: string) => fs.writeFileSync(path.join(dir, name), zlib.gzipSync(text))
  const gunzip = (name: string) => zlib.gunzipSync(fs.readFileSync(path.join(dir, name))).toString("utf-8")
  const run = (...args: string[]) => spawnSync("python3", ["-I", SCRIPT, "--dir", dir, "--live", live, "--state", path.join(dir, "..", `${path.basename(dir)}-state`, "done"), "--today", TODAY, ...args], { encoding: "utf-8" })
  const state = () => path.join(dir, "..", `${path.basename(dir)}-state`, "done")

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "traefik-logs-"))
    live = `${dir}-access.log`
    gz(DUE, RAW)
    gz(RECENT, RAW)
    fs.writeFileSync(live, line({ StartUTC: "2026-10-22T00:00:01Z", ClientHost: "203.0.113.57" }))
    fs.writeFileSync(path.join(dir, "access.log-20260721"), RAW) // not compressed yet, but due
    const old = new Date("2026-07-26T00:05:00Z")
    fs.utimesSync(path.join(dir, DUE), old, old)
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(live, { force: true })
    fs.rmSync(path.dirname(state()), { recursive: true, force: true })
  })

  it("rewrites the files due, keeps their modification time, leaves the recent ones and the live file", () => {
    const before = fs.statSync(path.join(dir, DUE)).mtimeMs
    const liveBefore = fs.readFileSync(live, "utf-8")
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    expect(parse(gunzip(DUE))[0]).toEqual({ ClientAddr: "203.0.113.0", ClientHost: "203.0.113.0", RequestPath: "/" })
    expect(fs.readFileSync(path.join(dir, "access.log-20260721"), "utf-8")).toContain("203.0.113.0")
    expect(fs.statSync(path.join(dir, DUE)).mtimeMs).toBe(before)
    expect(gunzip(RECENT)).toBe(RAW)
    expect(fs.readFileSync(live, "utf-8")).toBe(liveBefore)
    expect(fs.readdirSync(dir).filter((n) => n.startsWith(".anonymise-"))).toEqual([])
  })

  it("dates a file by its oldest line when it has one: a late rotation is caught", () => {
    gz("access.log-20260901.gz", line({ StartUTC: "2026-07-20T12:00:00Z", ClientHost: "203.0.113.57" }) + line({ StartUTC: "2026-09-01T00:00:00Z", ClientHost: "203.0.113.58" }))
    expect(run().status).toBe(0)
    expect(gunzip("access.log-20260901.gz")).not.toContain("203.0.113.5")
  })

  it("deletes the files past one year, which logrotate's maxage may never reach", () => {
    gz("access.log-20251022.gz", RAW) // oldest line 2025-10-21: 366 days
    gz("access.log-20251023.gz", RAW) // 365 days: kept one more day
    gz("access.log-20251101.gz", line({ StartUTC: "2025-10-20T08:00:00Z", ClientHost: "203.0.113.0" })) // late rotation
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    expect(fs.existsSync(path.join(dir, "access.log-20251022.gz"))).toBe(false)
    expect(fs.existsSync(path.join(dir, "access.log-20251023.gz"))).toBe(true)
    expect(fs.existsSync(path.join(dir, "access.log-20251101.gz"))).toBe(false)
  })

  it("fails when the live file is already due: the rotation has stopped", () => {
    fs.writeFileSync(live, line({ StartUTC: "2026-07-01T00:00:00Z", ClientHost: "203.0.113.57" }))
    const r = run()
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/is logrotate still running/)
    expect(fs.readFileSync(live, "utf-8")).toContain("203.0.113.57")
  })

  it("remembers the files done and does not read them again", () => {
    run()
    expect(fs.readFileSync(state(), "utf-8")).toBe(`access.log-20260721\n${DUE}\n`)
    const again = run()
    expect(again.status).toBe(0)
    expect(again.stderr).not.toMatch(/anonymised/)
  })

  it("changes nothing in a dry run", () => {
    const r = run("--dry-run")
    expect(r.stderr).toContain(`would anonymise ${path.join(dir, DUE)}`)
    expect(gunzip(DUE)).toBe(RAW)
    expect(fs.existsSync(state())).toBe(false)
  })

  it("never follows a symbolic link planted in the directory", () => {
    const outside = path.join(dir, "..", `${path.basename(dir)}-outside.gz`)
    fs.writeFileSync(outside, zlib.gzipSync(RAW))
    fs.symlinkSync(outside, path.join(dir, "access.log-20260101.gz"))
    try {
      const r = run()
      expect(r.status).toBe(1)
      expect(r.stderr).toMatch(/access\.log-20260101\.gz: .*(not a regular file|symbolic link|Too many levels)/)
      expect(zlib.gunzipSync(fs.readFileSync(outside)).toString("utf-8")).toBe(RAW)
      expect(parse(gunzip(DUE))[0].ClientHost).toBe("203.0.113.0")
    } finally {
      fs.rmSync(outside, { force: true })
    }
  })
})

describe("access-log retention matches the node configuration", () => {
  const config = read("k8s/traefik-config.yaml")
  const logrotate = read("k8s/node/traefik-access.logrotate")
  const script = read("k8s/node/traefik-log-anonymise")
  const cron = read("k8s/node/traefik-log-anonymise.cron")

  it("writes JSON to the rotated file, from a directory that must already exist, every header dropped but User-Agent", () => {
    expect(config).toMatch(/format: json/)
    expect(config).toMatch(/filePath: \/var\/log\/traefik\/access\.log/)
    expect(config).toMatch(/path: \/var\/log\/traefik\n\s+type: Directory/)
    expect(config).toMatch(/mountPath: \/var\/log\/traefik/)
    const headers = config.slice(config.indexOf("headers:"), config.indexOf("deployment:"))
    expect(headers).toMatch(/defaultmode: drop/)
    expect([...headers.matchAll(/^\s+([\w-]+): (keep|redact)$/gm)].map((m) => m[1])).toEqual(["User-Agent"])
    expect(config).not.toMatch(/Referer: keep/)
    expect(logrotate).toMatch(/^\/var\/log\/traefik\/access\.log \{/m)
    expect(logrotate).toMatch(/^\s+olddir \/var\/log\/traefik-archive$/m)
    for (const s of [script, read("k8s/node/traefik-log-stats")]) {
      expect(s).toContain('LIVE_FILE = "/var/log/traefik/access.log"')
      expect(s).toContain('ARCHIVE_DIR = "/var/log/traefik-archive"')
    }
  })

  it("keeps one year of files and the full address 90 days", () => {
    expect(logrotate).toMatch(new RegExp(`^\\s+rotate ${RETENTION_DAYS.accessLogs}$`, "m"))
    expect(logrotate).toMatch(new RegExp(`^\\s+maxage ${RETENTION_DAYS.accessLogs}$`, "m"))
    for (const directive of ["daily", "dateext", "compress", "delaycompress", "copytruncate", "missingok", "notifempty"]) expect(logrotate).toMatch(new RegExp(`^\\s+${directive}\\b`, "m"))
    expect(logrotate).toMatch(/^\s+dateformat -%Y%m%d$/m) // the names the script reads
    expect(script).toContain(`FULL_IP_DAYS = ${RETENTION_DAYS.accessLogFullIp}`)
    expect(script).toMatch(/IPV4_PREFIX = 24\n/)
    expect(script).toMatch(/IPV6_PREFIX = 48\n/)
    expect(script).toContain(`MAX_DAYS = ${RETENTION_DAYS.accessLogs}`)
    expect(cron).toMatch(/^\d+ \d+ \* \* \* root out=\$\(traefik-log-anonymise 2>&1\); rc=\$\?;.*logger -p user\.err/m)
  })

  it("is stated in the policy, as a manual procedure, apart from the container logs", () => {
    const entry = RETENTION.find((e) => e.data.startsWith("Journaux d'accès du proxy"))
    expect(entry?.duration).toContain(`${RETENTION_DAYS.accessLogs} jours`)
    expect(entry?.duration).toContain(`${RETENTION_DAYS.accessLogFullIp} jours`)
    expect(entry?.mechanism).toMatch(/procédure manuelle/)
    expect(entry?.data).toMatch(/autres sites/)
    expect(RETENTION.find((e) => e.data.startsWith("Journaux techniques des conteneurs"))?.data).toMatch(/sans les journaux d'accès/)
  })
})

describe("traefik-log-stats: anonymous daily totals", () => {
  const DAY = "2026-10-21"
  const UA = "Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0"
  const req = (host: string, p: string, extra: Record<string, unknown> = {}) => ({ StartUTC: `${DAY}T10:00:00.1Z`, RequestHost: host, RequestPath: p, DownstreamStatus: 200, Duration: 10_000_000, ClientHost: "203.0.113.57", "request_User-Agent": UA, ...extra })
  const times = (n: number, r: Record<string, unknown>) => Array.from({ length: n }, () => r)
  type Row = { host: string; path: string; requests: number; bots: number; others: number; status: Record<string, number>; p50Ms: number; p95Ms: number }
  type Stats = { date: string; totals: Row; paths: Row[]; notFound: { host: string; path: string; requests: number }[] }
  const stats = (records: Record<string, unknown>[], day = DAY): Stats =>
    JSON.parse(execFileSync("python3", ["-I", STATS, "--stdin", "--date", day], { input: records.map((r) => JSON.stringify(r)).join("\n"), encoding: "utf-8" }))
  const row = (s: Stats, host: string, p: string) => s.paths.find((r) => r.host === host && r.path === p)
  const FAKE = "fake-value-for-tests-0000"

  it("counts benevol.app only, and never the administration, the API, personal links or token queries", () => {
    const s = stats([
      ...times(5, req("www.benevol.app", "/doc/admin")),
      req("gallerypack.app", "/"),
      req("www.benevol.app", "/admin/events"),
      req("www.benevol.app", "/super-admin/organizations"),
      req("fete.benevol.app", "/api/public/events"),
      req("fete.benevol.app", `/my/${FAKE}`),
      req("fete.benevol.app", `/leader/${FAKE}`),
      req("fete.benevol.app", `/waitlist/${FAKE}/confirm`),
      req("fete.benevol.app", `/fete-du-village?token=${FAKE}`),
      req("fete.benevol.app", `/fete-du-village?t=${FAKE}`),
      req("www.benevol.app", "/product-updates/unsubscribe"),
      req("www.benevol.app", "/monitoring"),
    ])
    expect(s.totals.requests).toBe(5)
    expect(s.paths.map((r) => `${r.host} ${r.path}`)).toEqual(["site /doc/admin"])
  })

  it("normalises event slugs, page slugs, identifiers and long values", () => {
    const s = stats([
      ...times(3, req("fete.benevol.app", "/fete-du-village?embed=1")),
      ...times(2, req("club.benevol.app", "/tournoi")),
      ...times(5, req("fete.benevol.app", "/fete-du-village/infos-pratiques")),
      ...times(5, req("fete.benevol.app", "/fete-du-village/success")),
      ...times(5, req("www.benevol.app", "/videos/ckv9z0a1b2c3d4e5f6g7h8i9")),
      ...times(5, req("www.benevol.app", "/x/jean.dupont@example.org/123/a/b/c")),
      ...times(5, req("fete.benevol.app", "/doc/admin")),
    ])
    expect(row(s, "org", "/:event")?.requests).toBe(5)
    expect(row(s, "org", "/:event/:page")?.requests).toBe(5)
    expect(row(s, "org", "/:event/success")?.requests).toBe(5)
    expect(row(s, "org", "/doc/admin")?.requests).toBe(5)
    expect(row(s, "site", "/videos/:id")?.requests).toBe(5)
    expect(row(s, "site", "/:page/:x/:n/:page/*")?.requests).toBe(5)
    expect(JSON.stringify(s)).not.toMatch(/fete|tournoi|club|dupont|infos-pratiques/)
  })

  it("keeps a content page name only when the page exists, and probe names in the 404 list", () => {
    const s = stats([
      ...times(5, req("www.benevol.app", "/blog/rentree-2026")),
      ...times(5, req("www.benevol.app", "/blog/alice-martin", { DownstreamStatus: 404 })),
      ...times(5, req("www.benevol.app", "/alice-martin", { DownstreamStatus: 404 })),
      ...times(5, req("www.benevol.app", "/wp-login.php", { DownstreamStatus: 404 })),
      ...times(5, req("www.benevol.app", "/doc/admin/en-trop", { DownstreamStatus: 404 })),
    ])
    expect(row(s, "site", "/blog/rentree-2026")?.requests).toBe(5)
    expect(row(s, "site", "/blog/:page")?.requests).toBe(5)
    expect(row(s, "site", "/:page")?.requests).toBe(5)
    expect(row(s, "site", "/wp-login.php")?.requests).toBe(5)
    expect(row(s, "site", "/doc/:page/:page")?.requests).toBe(5)
    expect(JSON.stringify(s)).not.toMatch(/alice|martin|en-trop/)
  })

  it("decodes the path and the query before leaving requests out", () => {
    const s = stats([
      req("www.benevol.app", "/%61dmin/events"),
      req("fete.benevol.app", `/fete-du-village?%74oken=${FAKE}`),
      req("fete.benevol.app", `/fete-du-village?TOKEN=${FAKE}`),
      req("fete.benevol.app", "/%6Dy/abc"),
    ])
    expect(s.totals.requests).toBe(0)
  })

  it("merges every path under 5 requests into « autres », in the paths and the 404 list", () => {
    const s = stats([
      ...times(5, req("www.benevol.app", "/tarifs")),
      ...times(4, req("www.benevol.app", "/blog/rare", { DownstreamStatus: 404 })),
      req("www.benevol.app", "/wp-login.php", { DownstreamStatus: 404 }),
      ...times(6, req("www.benevol.app", "/.env", { DownstreamStatus: 404 })),
    ])
    expect(s.paths.map((r) => r.path)).toEqual(["/.env", "/tarifs", "autres"])
    expect(row(s, "autres", "autres")).toMatchObject({ requests: 5, status: { "4xx": 5 } })
    expect(s.notFound).toEqual([{ host: "site", path: "/.env", requests: 6 }, { host: "autres", path: "autres", requests: 5 }])
  })

  it("splits bots from people, counts status classes and gives p50 and p95 in milliseconds", () => {
    const s = stats([
      ...Array.from({ length: 18 }, (_, i) => req("www.benevol.app", "/", { Duration: (i + 1) * 1_000_000 })),
      req("www.benevol.app", "/", { "request_User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)", Duration: 19_000_000, DownstreamStatus: 301 }),
      req("www.benevol.app", "/", { "request_User-Agent": undefined, Duration: 20_000_000, DownstreamStatus: 500 }),
    ])
    expect(row(s, "site", "/")).toEqual({ host: "site", path: "/", requests: 20, bots: 2, others: 18, status: { "2xx": 18, "3xx": 1, "5xx": 1 }, p50Ms: 10, p95Ms: 19 })
  })

  it("keeps one UTC day, and writes no address, User-Agent or time of day", () => {
    const s = stats([...times(5, req("www.benevol.app", "/tarifs")), ...times(5, req("www.benevol.app", "/tarifs", { StartUTC: "2026-10-22T00:00:01Z" }))])
    expect(s.date).toBe(DAY)
    expect(s.totals.requests).toBe(5)
    const text = JSON.stringify(s)
    for (const leak of ["203.0.113", "Mozilla", "Firefox", "T10:00"]) expect(text).not.toContain(leak)
  })

  describe("on the node files", () => {
    let dir: string, logs: string, out: string, live: string
    const lines = (n: number, day = DAY) => times(n, req("www.benevol.app", "/tarifs", { StartUTC: `${day}T10:00:00Z` })).map((r) => JSON.stringify(r)).join("\n") + "\n"
    const runStats = (...args: string[]) => spawnSync("python3", ["-I", STATS, "--dir", logs, "--live", live, "--out", out, "--today", "2026-10-22", ...args], { encoding: "utf-8" })
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "traefik-stats-"))
      logs = path.join(dir, "archive")
      out = path.join(dir, "out")
      live = path.join(dir, "access.log")
      fs.mkdirSync(logs)
      fs.mkdirSync(out)
    })
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

    it("reads the live and archived files of the day, writes YYYY-MM-DD.json and deletes totals older than two years", () => {
      fs.writeFileSync(path.join(logs, "access.log-20261022"), lines(3))
      fs.writeFileSync(live, lines(2))
      fs.writeFileSync(path.join(logs, "access.log-20261020.gz"), zlib.gzipSync(lines(5))) // dated before the day: not read
      fs.writeFileSync(path.join(out, "2024-10-21.json"), "{}")
      fs.writeFileSync(path.join(out, "2024-10-23.json"), "{}")
      const r = runStats("--date", DAY)
      expect(r.status, r.stderr).toBe(0)
      const written: Stats = JSON.parse(fs.readFileSync(path.join(out, `${DAY}.json`), "utf-8"))
      expect(written.totals.requests).toBe(5)
      expect(fs.readdirSync(out).sort()).toEqual(["2024-10-23.json", `${DAY}.json`])
    })

    it("fills a missing day of the last week, and skips the days before any log", () => {
      fs.writeFileSync(path.join(logs, "access.log-20261019"), lines(5, "2026-10-18"))
      fs.writeFileSync(path.join(logs, "access.log-20261022"), lines(5))
      const r = runStats()
      expect(r.status, r.stderr).toBe(0)
      expect(fs.readdirSync(out).sort()).toEqual(["2026-10-18.json", `${DAY}.json`])
    })

    it("fails without writing on a read error, and fails on a day with no benevol.app request at all", () => {
      fs.writeFileSync(path.join(logs, "access.log-20261022.gz"), "not gzip")
      const broken = runStats("--date", DAY)
      expect(broken.status).toBe(1)
      expect(fs.existsSync(path.join(out, `${DAY}.json`))).toBe(false)
      fs.rmSync(path.join(logs, "access.log-20261022.gz"))
      const empty = runStats("--date", DAY)
      expect(empty.status).toBe(1)
      expect(empty.stderr).toMatch(/no benevol\.app request/)
    })

    it("never reads through a symbolic link", () => {
      fs.writeFileSync(path.join(dir, "elsewhere"), lines(5))
      fs.symlinkSync(path.join(dir, "elsewhere"), path.join(logs, "access.log-20261022"))
      const r = runStats("--date", DAY)
      expect(r.status).toBe(1)
      expect(fs.existsSync(path.join(out, `${DAY}.json`))).toBe(false)
    })
  })

  it("knows every fixed first segment of the app, so an event slug is never taken for a page", () => {
    const script = read("k8s/node/traefik-log-stats")
    const set = (name: string) => {
      const start = script.indexOf(`${name} = {`)
      return new Set([...script.slice(start, script.indexOf("}", start)).matchAll(/"([^"]+)"/g)].map((m) => m[1]))
    }
    const known = set("KNOWN_ROOTS")
    const excluded = set("EXCLUDED_ROOTS")
    const roots = [...fs.readdirSync(path.join(root, "src/app"), { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("[")).map((e) => e.name), ...fs.readdirSync(path.join(root, "public"))]
    for (const r of roots) expect(known.has(r) || excluded.has(r), r).toBe(true)
    for (const family of ["my", "waitlist", "leader", "api", "admin", "super-admin"]) expect(excluded.has(family), family).toBe(true)
    expect(script).toContain(`KEEP_DAYS = ${RETENTION_DAYS.accessLogStats}`)
    expect(script).toContain("MIN_BUCKET = 5")
    expect(read("k8s/node/traefik-log-stats.cron")).toMatch(/^\d+ \d+ \* \* \* root out=\$\(traefik-log-stats 2>&1\); rc=\$\?;.*logger -p user\.err/m)
  })
})
