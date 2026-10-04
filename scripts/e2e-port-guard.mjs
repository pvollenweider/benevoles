// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Before `make e2e` (#581): Playwright reuses any server already listening on E2E_PORT outside CI,
 * so a server started from another checkout would silently run this branch's tests against other
 * code and other data. If the port is held by a process whose working directory is not this
 * checkout, wait (a check every 30 s, at most 5 minutes) without touching it, then fail and name
 * the process. A server started from this checkout is fine: Playwright reuses it.
 *
 *   node scripts/e2e-port-guard.mjs 3100
 */

import { execFileSync } from "node:child_process"
import path from "node:path"

/** The pid listening on `port`, or null. */
function listener(port) {
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim()
    return out ? Number(out.split("\n")[0]) : null
  } catch {
    return null // lsof exits 1 when nothing listens
  }
}

/** Working directory of `pid` (macOS and Linux), or null. */
function cwdOf(pid) {
  try {
    const out = execFileSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8" })
    const line = out.split("\n").find((l) => l.startsWith("n"))
    return line ? line.slice(1) : null
  } catch {
    return null
  }
}

/**
 * Whether a server with working directory `cwd` belongs to checkout `root`.
 * @param {string | null} cwd
 * @param {string} root
 */
export function isOurs(cwd, root) {
  if (!cwd) return false
  const rel = path.relative(path.resolve(root), path.resolve(cwd))
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
}

async function main() {
  const port = Number(process.argv[2] ?? process.env.E2E_PORT ?? 3100)
  const root = process.cwd()
  const deadline = Date.now() + 5 * 60_000
  for (;;) {
    const pid = listener(port)
    if (pid === null) return
    const cwd = cwdOf(pid)
    if (isOurs(cwd, root)) return
    if (Date.now() >= deadline) {
      console.error(`Port ${port} is held by pid ${pid} (${cwd ?? "unknown directory"}), not by this checkout. Not stopping it.`)
      console.error(`Use another stack: E2E_SLOT=1 make e2e-up e2e-setup e2e (see CONTRIBUTING.md).`)
      process.exit(1)
    }
    console.error(`Port ${port} is held by pid ${pid} (${cwd ?? "unknown directory"}); checking again in 30 s (at most 5 minutes).`)
    await new Promise((r) => setTimeout(r, 30_000))
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
