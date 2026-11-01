import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { spawnSync } from "child_process"
import { databaseUrlFromParts } from "../../scripts/database-url.mjs"

// The self-hosting stack (docker-compose.yml): PostgreSQL only on the Compose network, a required
// password with no default, and the app's URL built from the same variables, each part encoded.
const root = process.cwd()
const read = (f: string) => readFileSync(join(root, f), "utf8")
const compose = read("docker-compose.yml")
const entrypoint = read("docker-entrypoint.sh")
const dockerfile = read("Dockerfile")

/** The text of one top-level service of docker-compose.yml. */
function service(name: string): string {
  const m = compose.match(new RegExp(`\\n  ${name}:\\n((?:    .*\\n|\\s*\\n)+)`))
  expect(m, name).not.toBeNull()
  return m![1]
}

/** Only what the child needs: no variable of this shell (a real POSTGRES_PASSWORD) leaks in. */
const cleanEnv = (extra: Record<string, string> = {}) =>
  ({ PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "/tmp", ...extra }) as unknown as NodeJS.ProcessEnv

const RESERVED = "p@ss:w/rd?#%x y!'*()&=+[]"
// A stand-in for the session key the operator generates (openssl rand -base64 32).
const SESSION_KEY = "q8V3nZk1LwYt0bRj5sXe2HfUoP9mCaD4gN7iK6lM+Qw="

describe("database URL built from the POSTGRES_* variables", () => {
  it("encodes every reserved character, so the password reads back unchanged", () => {
    const url = new URL(databaseUrlFromParts({ POSTGRES_PASSWORD: RESERVED }))
    expect(decodeURIComponent(url.password)).toBe(RESERVED)
    expect(decodeURIComponent(url.username)).toBe("benevoles")
    expect(url.hostname).toBe("postgres")
    expect(url.port).toBe("5432")
    expect(url.pathname).toBe("/benevoles")
    expect(url.searchParams.get("schema")).toBe("public")
  })

  it("takes the user, database, host and port given", () => {
    const url = new URL(databaseUrlFromParts({
      POSTGRES_PASSWORD: "x", POSTGRES_USER: "app user", POSTGRES_DB: "db/1", POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "55432",
    }))
    expect(decodeURIComponent(url.username)).toBe("app user")
    expect(decodeURIComponent(url.pathname.slice(1))).toBe("db/1")
    expect(url.host).toBe("127.0.0.1:55432")
  })

  it("refuses an empty or missing password, and a malformed host or port", () => {
    expect(() => databaseUrlFromParts({})).toThrow(/POSTGRES_PASSWORD/)
    expect(() => databaseUrlFromParts({ POSTGRES_PASSWORD: "" })).toThrow(/POSTGRES_PASSWORD/)
    expect(() => databaseUrlFromParts({ POSTGRES_PASSWORD: "x", POSTGRES_PORT: "54x" })).toThrow(/POSTGRES_PORT/)
    expect(() => databaseUrlFromParts({ POSTGRES_PASSWORD: "x", POSTGRES_HOST: "evil@host/x" })).toThrow(/POSTGRES_HOST/)
  })

  it("the command prints the URL only, and names the variable, never a value, when it fails", () => {
    const run = (env: Record<string, string>) => spawnSync(process.execPath, ["scripts/database-url.mjs"], { cwd: root, env: cleanEnv(env), encoding: "utf8" })
    const ok = run({ POSTGRES_PASSWORD: RESERVED })
    expect(ok.status).toBe(0)
    expect(ok.stdout).toBe(databaseUrlFromParts({ POSTGRES_PASSWORD: RESERVED }))
    const bad = run({ POSTGRES_PASSWORD: "secret-value", POSTGRES_PORT: "nope" })
    expect(bad.status).toBe(1)
    expect(bad.stdout).toBe("")
    expect(bad.stderr).toMatch(/POSTGRES_PORT/)
    expect(bad.stderr).not.toContain("secret-value")
  })
})

describe("docker-entrypoint.sh", () => {
  it("builds DATABASE_URL only when none is given, before waiting for the database", () => {
    const build = entrypoint.indexOf("node scripts/database-url.mjs")
    expect(build).toBeGreaterThan(-1)
    expect(entrypoint.indexOf('if [ -z "${DATABASE_URL:-}" ]')).toBeLessThan(build)
    expect(build).toBeLessThan(entrypoint.indexOf("Attente de PostgreSQL"))
    expect(build).toBeLessThan(entrypoint.indexOf("prisma migrate deploy"))
  })

  it("stops at once without DATABASE_URL nor POSTGRES_PASSWORD", () => {
    const run = spawnSync("sh", ["docker-entrypoint.sh", "true"], { cwd: root, env: cleanEnv(), encoding: "utf8", timeout: 10_000 })
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/DATABASE_URL ou POSTGRES_PASSWORD requis/)
  })

  it("the image ships the script", () => {
    expect(dockerfile).toContain("COPY --from=builder --chown=nextjs:nodejs /app/scripts/database-url.mjs ./scripts/database-url.mjs")
  })
})

describe("docker-compose.yml", () => {
  it("never publishes PostgreSQL on the host", () => {
    expect(service("postgres")).not.toMatch(/^\s+ports:/m)
    expect(compose).not.toMatch(/["']?(?:[\d.]+:)?5432:5432/)
  })

  it("requires a password for the database and the app, with no default", () => {
    const required = /POSTGRES_PASSWORD: \$\{POSTGRES_PASSWORD:\?[^}]+\}/
    expect(service("postgres")).toMatch(required)
    expect(service("app")).toMatch(required)
    expect(compose).not.toMatch(/POSTGRES_PASSWORD: benevoles/)
    expect(compose).not.toMatch(/POSTGRES_PASSWORD:-/)
  })

  it("the app gets the database's own variables, not a URL with a password in it", () => {
    const app = service("app")
    expect(app).not.toMatch(/^\s+DATABASE_URL:/m)
    for (const v of ["POSTGRES_HOST: postgres", "POSTGRES_DB: benevoles", "POSTGRES_USER: benevoles"]) expect(app).toContain(v)
    expect(service("postgres")).toContain("POSTGRES_DB: benevoles")
    expect(service("postgres")).toContain("POSTGRES_USER: benevoles")
  })

  it("the local access example binds to 127.0.0.1 only, and its copy is ignored by Git", () => {
    expect(read("docker-compose.override.example.yml")).toMatch(/- "127\.0\.0\.1:5432:5432"/)
    expect(read(".gitignore")).toMatch(/^docker-compose\.override\.yml$/m)
  })

  it("the development and E2E stacks keep their own database", () => {
    for (const f of ["docker-compose.dev.yml", "docker-compose.e2e.yml"]) {
      expect(read(f)).toMatch(/^name: benevoles-(dev|e2e)/m)
    }
  })
})

// Rendered by Compose itself when it is installed (CI runners, a developer machine).
const hasCompose = spawnSync("docker", ["compose", "version"], { encoding: "utf8" }).status === 0

describe.skipIf(!hasCompose)("docker compose config", () => {
  const render = (env: Record<string, string>) => spawnSync(
    "docker", ["compose", "--env-file", "/dev/null", "-f", join(root, "docker-compose.yml"), "config", "--format", "json"],
    { cwd: "/", env: cleanEnv(env), encoding: "utf8" },
  )

  it("renders with a test password: no published database port, same password on both sides", () => {
    const out = render({ POSTGRES_PASSWORD: RESERVED, AUTH_SECRET: SESSION_KEY })
    expect(out.status, out.stderr).toBe(0)
    const config = JSON.parse(out.stdout)
    expect(config.services.postgres.ports ?? []).toEqual([])
    expect(config.services.postgres.environment.POSTGRES_PASSWORD).toBe(RESERVED)
    expect(config.services.app.environment.POSTGRES_PASSWORD).toBe(RESERVED)
    expect(config.services.app.environment.DATABASE_URL).toBeUndefined()
    expect(config.services.app.environment.AUTH_SECRET).toBe(SESSION_KEY)
  })

  it("refuses to render without the password", () => {
    const out = render({ AUTH_SECRET: SESSION_KEY })
    expect(out.status).not.toBe(0)
    expect(out.stderr).toMatch(/POSTGRES_PASSWORD/)
  })

  it("refuses to render without AUTH_SECRET, saying how to generate one", () => {
    const out = render({ POSTGRES_PASSWORD: RESERVED })
    expect(out.status).not.toBe(0)
    expect(out.stderr).toMatch(/AUTH_SECRET/)
    expect(out.stderr).toMatch(/openssl rand/)
  })
})
