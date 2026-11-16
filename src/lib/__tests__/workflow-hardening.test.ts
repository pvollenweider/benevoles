import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "fs"
import { join } from "path"

// GitHub workflow hardening (#1051): actions pinned by full commit SHA, and no secret expanded
// into the text of a shell script, where the shell would reinterpret it and a log could show it.
const dir = join(process.cwd(), ".github/workflows")
const workflows = readdirSync(dir)
  .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
  .map((f) => ({ file: f, text: readFileSync(join(dir, f), "utf8") }))

/** The script of every `run:` key, single-line or block, with its line number. */
function runScripts(text: string): { line: number; script: string }[] {
  const lines = text.split("\n")
  const out: { line: number; script: string }[] = []
  lines.forEach((l, i) => {
    const m = l.match(/^(\s*)(?:- )?run:\s*(.*)$/)
    if (!m) return
    const indent = m[1].length
    if (!/^[|>]/.test(m[2])) {
      out.push({ line: i + 1, script: m[2] })
      return
    }
    const body: string[] = []
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() !== "" && lines[j].search(/\S/) <= indent) break
      body.push(lines[j])
    }
    out.push({ line: i + 1, script: body.join("\n") })
  })
  return out
}

/** Keys of the mapping nested under `key:` in the given step block. */
function mappingKeys(block: string, key: string): string[] {
  const m = block.match(new RegExp(`^(\\s+)${key}:\\n((?:\\1\\s+.*\\n)+)`, "m"))
  expect(m, key).not.toBeNull()
  return [...m![2].matchAll(/^\s+([A-Z0-9_]+):/gm)].map((k) => k[1])
}

describe("GitHub workflow hardening", () => {
  it("finds the workflows", () => {
    expect(workflows.map((w) => w.file)).toContain("deploy.yml")
  })

  it("pins every action by full commit SHA with its version as a comment", () => {
    for (const { file, text } of workflows) {
      for (const m of text.matchAll(/^\s*(?:- )?uses:\s*(.+)$/gm)) {
        expect(m[1], file).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/)
      }
    }
  })

  it("never expands a secret inside a run script", () => {
    for (const { file, text } of workflows) {
      for (const { line, script } of runScripts(text)) {
        expect(script, `${file}:${line}`).not.toMatch(/\$\{\{[^}]*secrets\./)
      }
    }
  })

  describe("Sync k8s secret", () => {
    const deploy = workflows.find((w) => w.file === "deploy.yml")!.text
    const start = deploy.indexOf("- name: Sync k8s secret")
    const block = deploy.slice(start, deploy.indexOf("- name:", start + 1))

    it("reads every value from the step environment through --from-env-file", () => {
      expect(block).toContain('--from-env-file="$keys"')
      expect(block).not.toContain("--from-literal")
    })

    it("lists exactly the keys the step environment sets, once each", () => {
      const env = mappingKeys(block, "env")
      const list = block.match(/<<'KEYS'\n([\s\S]*?)\n\s*KEYS\n/)
      expect(list).not.toBeNull()
      const keys = list![1].split("\n").map((k) => k.trim())
      expect(new Set(keys).size).toBe(keys.length)
      // A bare key name makes kubectl take the value from its environment: no `=` on a line.
      for (const k of keys) expect(k).toMatch(/^[A-Z0-9_]+$/)
      expect([...keys].sort()).toEqual([...env].sort())
      expect(keys).toEqual(
        expect.arrayContaining(["DATABASE_URL", "POSTGRES_PASSWORD", "AUTH_SECRET", "TOKEN_ENCRYPTION_KEY"]),
      )
    })
  })
})

// Deploy credentials: the build and deploy jobs read their secrets from GitHub
// environments limited to main, the deploy ServiceAccount only has rights in the namespace, and a
// secret missing from the environment stops the deploy before it reaches the cluster.
describe("deploy environments and namespaced credential", () => {
  const deploy = workflows.find((w) => w.file === "deploy.yml")!.text
  /** The text of a top-level job of deploy.yml. */
  const job = (name: string) => {
    const start = deploy.search(new RegExp(`^  ${name}:$`, "m"))
    expect(start, name).toBeGreaterThan(-1)
    const next = deploy.slice(start + 1).search(/^ {2}[\w-]+:$/m)
    return next === -1 ? deploy.slice(start) : deploy.slice(start, start + 1 + next)
  }

  it("build-push reads its secrets from the production-build environment", () => {
    expect(job("build-push")).toMatch(/^ {4}environment: production-build$/m)
  })

  it("deploy reads its secrets from the production environment", () => {
    expect(job("deploy")).toMatch(/^ {4}environment: production$/m)
  })

  it("no other job names an environment, and only build-push and deploy read secrets", () => {
    for (const name of ["check"]) {
      expect(job(name), name).not.toMatch(/^ {4}environment:/m)
      expect(job(name), name).not.toContain("secrets.")
    }
  })

  it("never applies the cluster-scoped namespace or the deploy credential's own RBAC", () => {
    for (const { line, script } of runScripts(deploy)) {
      expect(script, `deploy.yml:${line}`).not.toContain("k8s/namespace.yaml")
      expect(script, `deploy.yml:${line}`).not.toContain("k8s/rbac-ci-deployer.yaml")
      // A directory apply would pick both up.
      expect(script, `deploy.yml:${line}`).not.toMatch(/apply -f k8s\/?(\s|$)/)
    }
  })

  describe("Check required secrets", () => {
    const start = deploy.indexOf("- name: Check required secrets")
    const block = deploy.slice(start, deploy.indexOf("- name:", start + 1))

    it("checks every key of its environment, and runs before the k8s secret is written", () => {
      expect(start).toBeGreaterThan(-1)
      expect(start).toBeLessThan(deploy.indexOf("- name: Sync k8s secret"))
      const env = mappingKeys(block, "env")
      const loop = block.match(/for k in ([\s\S]*?); do/)
      expect(loop).not.toBeNull()
      const checked = loop![1].replace(/\\\n/g, " ").split(/\s+/).filter(Boolean)
      expect([...checked].sort()).toEqual([...env].sort())
      expect(checked).toEqual(
        expect.arrayContaining(["TOKEN_ENCRYPTION_KEY", "AUTH_SECRET", "POSTGRES_PASSWORD", "CRON_SECRET", "OFFSITE_BUCKET"]),
      )
    })

    it("prints only the names of the empty secrets", () => {
      const script = runScripts(block)[0].script
      expect(script).toContain('[ -n "${!k:-}" ] || missing="$missing $k"')
      expect(script).not.toMatch(/echo[^\n]*\$\{!k/)
    })
  })
})
