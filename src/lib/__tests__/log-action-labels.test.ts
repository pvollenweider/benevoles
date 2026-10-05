// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Guard for #704: every action code written to OrgLog or EventLog has a French label, so the
 * organization activity log and the event log explorer never show a raw code such as
 * `member.merged`. Scans the source for the write paths (logOrgEvent / logEvent and direct
 * orgLog / eventLog create calls) and reads the `action:` literals inside each call.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { ACTION_LABEL } from "@/components/admin/ActivityLog"
import { ACTION_VERB, describeEntry } from "../event-log-narrative"

const ROOT = path.resolve(import.meta.dirname, "../../..")
const SCAN_DIRS = ["src", "scripts"]
// The helpers themselves forward a variable `action`; their callers are what gets scanned.
const HELPER_FILES = new Set(["src/lib/org-log.ts", "src/lib/event-log.ts"])

const ORG_CALL = /\blogOrgEvent\(|\.orgLog\.(?:create|createMany|upsert)\(/g
const EVENT_CALL = /\blogEvent\(|\.eventLog\.(?:create|createMany|upsert)\(/g

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "generated" || name.startsWith("__")) continue
      out.push(...sourceFiles(full))
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

/** The text between the call's opening parenthesis and its matching closing one. */
function callArguments(src: string, open: number): string {
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === "\\") i++
      else if (c === quote) quote = null
      continue
    }
    if (c === "/" && src[i + 1] === "/") i = src.indexOf("\n", i)
    else if (c === "/" && src[i + 1] === "*") i = src.indexOf("*/", i) + 1
    else if (c === "\"" || c === "'" || c === "`") quote = c
    else if (c === "(") depth++
    else if (c === ")" && --depth === 0) return src.slice(open + 1, i)
  }
  throw new Error(`unbalanced call at offset ${open}`)
}

type Found = { codes: Set<string>; unreadable: string[] }

/** Action codes written by every call matching `pattern`, plus the calls whose action isn't a literal. */
function loggedActions(pattern: RegExp, files: string[]): Found {
  const found: Found = { codes: new Set(), unreadable: [] }
  for (const file of files) {
    const rel = path.relative(ROOT, file)
    if (HELPER_FILES.has(rel)) continue
    const src = readFileSync(file, "utf8")
    for (const m of src.matchAll(pattern)) {
      if (/function\s+$/.test(src.slice(Math.max(0, m.index - 20), m.index))) continue
      let args: string
      try {
        args = callArguments(src, m.index + m[0].length - 1)
      } catch (err) {
        throw new Error(`${rel}: ${(err as Error).message}`)
      }
      const actions = [...args.matchAll(/\baction\s*(:\s*([^\n]*)|,)/g)]
      const line = src.slice(0, m.index).split("\n").length
      if (actions.length === 0) found.unreadable.push(`${rel}:${line}`)
      for (const a of actions) {
        const literals = [...(a[2] ?? "").matchAll(/"([a-z_]+\.[a-z_]+)"/g)].map((l) => l[1])
        if (literals.length === 0) found.unreadable.push(`${rel}:${line}`)
        literals.forEach((code) => found.codes.add(code))
      }
    }
  }
  return found
}

const files = SCAN_DIRS.flatMap((d) => sourceFiles(path.join(ROOT, d)))
const org = loggedActions(ORG_CALL, files)
const event = loggedActions(EVENT_CALL, files)

describe("log action labels (#704)", () => {
  it("finds the known write paths, so a broken scan cannot pass silently", () => {
    expect([...org.codes]).toEqual(expect.arrayContaining(["member.created", "member.merged", "member.deleted", "volunteer.certificate_generated"]))
    expect([...event.codes]).toEqual(expect.arrayContaining(["shift.created", "registration.cancelled", "message.sent", "event.archived"]))
  })

  it("only finds action codes written as string literals", () => {
    expect([...org.unreadable, ...event.unreadable]).toEqual([])
  })

  it("has an activity log label for every action written to OrgLog", () => {
    expect([...org.codes].filter((code) => !ACTION_LABEL[code]).sort()).toEqual([])
  })

  it("has an event log sentence for every action written to EventLog", () => {
    expect([...event.codes].filter((code) => !ACTION_VERB[code]).sort()).toEqual([])
  })

  it("labels the member erasure logged by #516", () => {
    expect(ACTION_LABEL["member.erased"]).toBe("a effacé les données personnelles d'un membre")
  })

  it("labels the actions that used to show as raw codes", () => {
    expect(ACTION_LABEL["member.merged"]).toBe("a fusionné deux membres")
    expect(ACTION_LABEL["member.duplicate_dismissed"]).toBe("a ignoré un doublon possible")
    expect(describeEntry({ action: "message.sent", actorLabel: "Alice", changes: null })).toBe("Alice a envoyé un message")
    expect(describeEntry({ action: "registration.refused", actorLabel: "Alice", changes: null })).toBe("Alice a refusé la demande d'inscription")
  })

  it("words every label without « · » or em-dash, so screen readers read it plainly", () => {
    const texts = [...Object.values(ACTION_LABEL), ...Object.values(ACTION_VERB).map((verb) => verb("Alice"))]
    expect(texts.filter((t) => /[·—]/.test(t))).toEqual([])
  })
})
