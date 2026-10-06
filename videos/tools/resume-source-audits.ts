// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Source WAV audit only. Never generates narration, captures UI or certifies an MP4. */
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { catalogEntry } from "../lib/manifest"

const childTimeoutMs = 600_000
type Stage = "source-audit" | "window-alignment" | "source-reaudit"
type Attempt = { id: string; stage: Stage; startedAt: string; finishedAt: string; exitCode: number; timedOut: boolean; signal: string | null; error?: string }
type Report = { scope: string; ids: string[]; updatedAt: string; active: { id: string; stage: Stage; startedAt: string; pid?: number } | null; attempts: Attempt[]; results: { id: string; status: "source-audited" | "needs-review"; failedStage?: Stage }[] }

async function main() {
  const args = process.argv.slice(2)
  let batch: string | undefined
  if (args[0] === "--batch") {
    batch = args[1]
    args.splice(0, 2)
    if (!batch || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(batch)) throw new Error("Batch must be a safe lowercase name, at most 64 characters")
  }
  if (!args.length || args.some(id => !/^[A-Z][A-Z0-9_]+$/.test(id)) || new Set(args).size !== args.length) throw new Error("Usage: resume-source-audits.ts [--batch NAME] EXPLICIT_CATALOGUE_ID [...]; duplicate IDs and flags are rejected")
  for (const id of args) {
    const entry = await catalogEntry(id)
    if (entry.id !== id) throw new Error("Only exact catalogue IDs are accepted")
  }
  batch ??= createHash("sha256").update(args.join("\n")).digest("hex").slice(0, 16)
  const directory = path.resolve("videos/output")
  const reportFile = path.join(directory, `source-audits-${batch}.json`)
  const lockFile = `${reportFile}.lock`
  await mkdir(directory, { recursive: true })
  const lock = await open(lockFile, "wx")
  let report: Report = { scope: "Generated source WAV auditing and optional chapter recutting only. No new TTS, UI capture, database, product proof, final MP4 or completion certification.", ids: args, updatedAt: new Date().toISOString(), active: null, attempts: [], results: [] }
  let pendingWrite = Promise.resolve()
  let interrupted = false
  const persist = () => {
    report.updatedAt = new Date().toISOString()
    const snapshot = JSON.stringify(report, null, 2)
    pendingWrite = pendingWrite.then(async () => {
      const temporary = `${reportFile}.${process.pid}.tmp`
      await writeFile(temporary, snapshot)
      await rename(temporary, reportFile)
    })
    return pendingWrite
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), ids: args }))
    try {
      const previous = JSON.parse(await readFile(reportFile, "utf8")) as Report
      if (JSON.stringify(previous.ids) !== JSON.stringify(args) || !Array.isArray(previous.attempts) || !Array.isArray(previous.results)) throw new Error("Existing batch report belongs to different IDs or has an invalid format; choose another batch")
      report = { ...previous, active: null }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    await persist()

    const run = async (id: string, stage: Stage, script: string, scriptArgs: string[]) => {
      const startedAt = new Date().toISOString()
      report.active = { id, stage, startedAt }
      await persist()
      console.log(`${id}: ${stage}; maximum child runtime ${childTimeoutMs / 60_000} minutes`)
      const outcome = await new Promise<Omit<Attempt, "id" | "stage" | "startedAt" | "finishedAt">>(resolve => {
        const detached = process.platform !== "win32"
        const child = spawn(process.execPath, ["--import", "tsx", script, ...scriptArgs], { env: process.env, stdio: "inherit", detached })
        let timedOut = false
        let spawnError: string | undefined
        let forceKill: ReturnType<typeof setTimeout> | undefined
        const stop = (signal: NodeJS.Signals) => {
          try { if (detached && child.pid) process.kill(-child.pid, signal); else child.kill(signal) }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") spawnError = "Failed to terminate child process group" }
        }
        const interrupt = () => {
          interrupted = true
          spawnError = "Batch interrupted; child process group stopped"
          stop("SIGTERM")
          forceKill ??= setTimeout(() => stop("SIGKILL"), 500)
        }
        process.once("SIGINT", interrupt)
        process.once("SIGTERM", interrupt)
        child.once("spawn", () => {
          report.active = { id, stage, startedAt, pid: child.pid }
          void persist().catch(() => { spawnError = "Could not persist active child"; stop("SIGTERM") })
        })
        const timer = setTimeout(() => {
          timedOut = true
          stop("SIGTERM")
          forceKill = setTimeout(() => stop("SIGKILL"), 500)
        }, childTimeoutMs - 500)
        child.once("error", () => { spawnError = "Child failed to start" })
        child.once("close", (code, signal) => {
          process.removeListener("SIGINT", interrupt)
          process.removeListener("SIGTERM", interrupt)
          clearTimeout(timer)
          if (timedOut || interrupted) stop("SIGKILL") // Also stop alignment grandchildren after their parent exits.
          if (forceKill) clearTimeout(forceKill)
          resolve({ exitCode: timedOut || spawnError ? 1 : code ?? 1, timedOut, signal, ...(spawnError ? { error: spawnError } : {}) })
        })
      })
      report.attempts.push({ id, stage, startedAt, finishedAt: new Date().toISOString(), ...outcome })
      report.active = null
      await persist()
      return outcome.exitCode === 0
    }

    for (const id of args) {
      let failedStage: Stage | undefined
      if (!await run(id, "source-audit", "videos/tools/audit-narration.ts", [id])) {
        if (interrupted) failedStage = "source-audit"
        else if (!await run(id, "window-alignment", "videos/tools/align-narration-windows.ts", [id, "--apply", "--wide"])) failedStage = "window-alignment"
        else if (!await run(id, "source-reaudit", "videos/tools/audit-narration.ts", [id])) failedStage = "source-reaudit"
      }
      report.results = report.results.filter(item => item.id !== id)
      report.results.push({ id, status: failedStage ? "needs-review" : "source-audited", ...(failedStage ? { failedStage } : {}) })
      await persist()
      console.log(`${id}: ${failedStage ? `needs review (${failedStage}); all failures retained` : "source audited, not final video validated"}`)
      if (interrupted) break
    }
    if (report.results.some(item => item.status !== "source-audited")) process.exitCode = 1
    console.log(`Source-only batch report: ${reportFile}`)
  } finally {
    await lock.close()
    await unlink(lockFile)
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Source-only audit batch failed"); process.exitCode = 1 })
