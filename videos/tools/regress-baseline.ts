// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Regression loop on a baseline folder of reference videos: re-assemble each reference video with
 * the current `assemble.ts` and `validate.ts`, compare the run with its accepted golden run, and
 * accept a new golden when the change is intended.
 *
 *   npm run video:regress -- --dir <baseline> [--slug <slug>] [--accept --note "<why>"] [--keep]
 *
 * The baseline is never the working directory: every run gets a temporary copy whose `origin/main`
 * is pinned to the product commit of the capture, so `assemble.ts` keeps its provenance guard and
 * nothing is written into the baseline except an accepted golden.
 */
import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import {
  hashTree,
  inventoryIssues,
  readBaseline,
  unsafeFileName,
  videoInputFiles,
  writeInventory,
  type BaselineInventory,
} from "../lib/baseline-inventory"
import type { Timeline } from "../lib/manifest"
import { frameSampleTimes, parseBlackdetect, parseFreezedetect, parseSsimAll } from "../lib/picture-checks"
import { compareRuns, failing, type Finding, type RunFacts } from "../lib/regression-compare"
import {
  buildRunFacts,
  inventoryMetadata,
  parseProbeOutput,
  validationIssuesFromRun,
  valueSummary,
  type AudioLevelsFacts,
  type AudioMixFacts,
} from "../lib/regression-run"

const exec = promisify(execFile)

const USAGE = [
  "Usage :",
  '  npm run video:regress -- --dir <baseline> [--slug <slug>] [--accept --note "<raison>"] [--keep]',
].join("\n")

const args = process.argv.slice(2)

function option(name: string): string | undefined {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith("--")) throw new Error(`${name} exige une valeur\n\n${USAGE}`)
  return value
}

function required(name: string): string {
  const value = option(name)
  if (!value) throw new Error(`${name} est requis\n\n${USAGE}`)
  return value
}

type ChildResult = { code: number; stdout: string; stderr: string }

type RunOptions = { cwd?: string; env?: NodeJS.ProcessEnv; maxBuffer?: number }

/** Runs a child without throwing on a non-zero exit: its code and streams are the result. */
async function run(command: string, commandArgs: string[], options: RunOptions = {}): Promise<ChildResult> {
  try {
    const { stdout, stderr } = await exec(command, commandArgs, { maxBuffer: 32 * 1024 * 1024, ...options })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const failure = error as { code?: unknown; stdout?: string; stderr?: string; message?: string }
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message ?? "",
    }
  }
}

/** Last lines of a failed child, so the cause is visible without printing a whole FFmpeg log. */
function printTail(label: string, result: ChildResult): void {
  for (const stream of [result.stdout, result.stderr]) {
    const lines = stream.trim().split(/\r?\n/).filter(Boolean).slice(-20)
    if (!lines.length) continue
    console.error(`${label} :`)
    for (const line of lines) console.error(`  ${line}`)
  }
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T
}

async function firstLine(command: string, commandArgs: string[]): Promise<string> {
  const result = await run(command, commandArgs, { maxBuffer: 4 * 1024 * 1024 })
  if (result.code !== 0) {
    printTail(`${command} ${commandArgs.join(" ")}`, result)
    throw new Error(`${command} ${commandArgs.join(" ")} a échoué.`)
  }
  return result.stdout.split(/\r?\n/)[0]?.trim() ?? ""
}

async function repositoryRoot(): Promise<string> {
  const result = await run("git", ["rev-parse", "--show-toplevel"], { maxBuffer: 1024 * 1024 })
  if (result.code !== 0) {
    printTail("git rev-parse --show-toplevel", result)
    throw new Error("Impossible de trouver la racine du dépôt Git courant.")
  }
  return result.stdout.trim()
}

/** Copies the catalog, the manifest and the files of one video into the work directory. */
async function prepareWork(dir: string, slug: string, work: string): Promise<void> {
  const outputDir = path.join(dir, "videos", "output", slug)
  const timeline = await readJson<Timeline>(path.join(outputDir, "timeline.json"))
  if (unsafeFileName(timeline.video)) {
    throw new Error(`${slug} : timeline.video doit être un simple nom de fichier, reçu "${timeline.video}".`)
  }
  const entries = await readdir(path.join(outputDir, "audio"), { withFileTypes: true })
  const audioNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort()
  if (audioNames.some((name) => unsafeFileName(name))) throw new Error(`${slug} : nom de fichier audio invalide.`)

  const relatives = [...new Set(["videos/catalog.json", ...videoInputFiles(slug, timeline, audioNames)])]
  for (const relative of relatives) {
    const destination = path.join(work, ...relative.split("/"))
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(path.join(dir, ...relative.split("/")), destination)
  }
}

/** Pins `origin/main` of the work repository to the product commit of the capture. */
async function pinOrigin(work: string, root: string, productCommit: string, slug: string): Promise<void> {
  const initialized = await run("git", ["init", "-q"], { cwd: work })
  if (initialized.code !== 0) {
    printTail("git init", initialized)
    throw new Error(`Initialisation du dépôt de travail impossible pour ${slug}.`)
  }
  const fetched = await run("git", ["fetch", "-q", root, productCommit], { cwd: work })
  if (fetched.code !== 0) {
    throw new Error(`Commit ${productCommit} of ${slug} is not in this clone; run: git fetch origin ${productCommit}`)
  }
  const updated = await run("git", ["update-ref", "refs/remotes/origin/main", productCommit], { cwd: work })
  if (updated.code !== 0) {
    printTail("git update-ref", updated)
    throw new Error(`Impossible de placer origin/main sur le commit ${productCommit} pour ${slug}.`)
  }
}

function runVideoTool(root: string, tool: "assemble.ts" | "validate.ts", id: string, cwd: string, env: NodeJS.ProcessEnv): Promise<ChildResult> {
  const loader = path.join(root, "node_modules", "tsx", "dist", "loader.mjs")
  return run("node", ["--import", loader, path.join(root, "videos", "tools", tool), id], { cwd, env, maxBuffer: 16 * 1024 * 1024 })
}

type CollectedRun = { facts: RunFacts; framesDir: string; vttPath: string; txtPath: string }

type CollectOptions = {
  dir: string
  slug: string
  work: string
  validationIssues: string[]
  accept: boolean
}

async function measureSsim(actual: string, golden: string): Promise<number> {
  const measured = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", actual, "-i", golden, "-lavfi", "ssim", "-f", "null", "-"], {
    maxBuffer: 4 * 1024 * 1024,
  })
  if (measured.code !== 0) {
    printTail(`ssim ${actual}`, measured)
    throw new Error(`Mesure SSIM impossible entre ${actual} et ${golden}.`)
  }
  return parseSsimAll(measured.stderr)
}

/** Collects everything a run states: files, FFprobe, black/frozen stretches and sampled frames. */
async function collectRun(options: CollectOptions): Promise<CollectedRun> {
  const { dir, slug, work, validationIssues, accept } = options
  const videoDir = path.join(work, "videos", "output", slug)
  const mp4 = path.join(videoDir, `${slug}.mp4`)
  const vttPath = path.join(videoDir, `${slug}.vtt`)
  const txtPath = path.join(videoDir, `${slug}.txt`)

  const [vtt, txt, audioMix, audioLevels, timelineAfter, videoBytes, ffmpeg] = await Promise.all([
    readFile(vttPath, "utf8"),
    readFile(txtPath, "utf8"),
    readJson<AudioMixFacts>(path.join(videoDir, "audio-mix.json")),
    readJson<AudioLevelsFacts>(path.join(videoDir, "audio-levels.json")),
    readJson<Timeline>(path.join(videoDir, "timeline.json")),
    stat(mp4).then((stats) => stats.size),
    firstLine("ffmpeg", ["-version"]),
  ])

  const probed = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate",
    "-show_entries", "format=duration",
    "-of", "json",
    mp4,
  ], { maxBuffer: 4 * 1024 * 1024 })
  if (probed.code !== 0) {
    printTail(`ffprobe ${mp4}`, probed)
    throw new Error(`ffprobe a échoué sur ${mp4}.`)
  }
  const probe = parseProbeOutput(probed.stdout)

  const detectedBlack = await run("ffmpeg", [
    "-hide_banner", "-nostats", "-i", mp4,
    "-vf", "blackdetect=d=0.5:pix_th=0.10", "-an", "-f", "null", "-",
  ], { maxBuffer: 64 * 1024 * 1024 })
  if (detectedBlack.code !== 0) {
    printTail(`blackdetect ${mp4}`, detectedBlack)
    throw new Error(`blackdetect a échoué sur ${mp4}.`)
  }
  const detectedFrozen = await run("ffmpeg", [
    "-hide_banner", "-nostats", "-i", mp4,
    "-vf", "freezedetect=n=-60dB:d=2", "-an", "-f", "null", "-",
  ], { maxBuffer: 64 * 1024 * 1024 })
  if (detectedFrozen.code !== 0) {
    printTail(`freezedetect ${mp4}`, detectedFrozen)
    throw new Error(`freezedetect a échoué sur ${mp4}.`)
  }

  const framesDir = path.join(work, "regression-frames")
  await mkdir(framesDir, { recursive: true })
  const frames: { atMs: number; ssim: number }[] = []
  for (const atMs of frameSampleTimes(timelineAfter)) {
    const png = path.join(framesDir, `${atMs}.png`)
    const seconds = (atMs / 1_000).toFixed(3)
    const extracted = await run("ffmpeg", [
      "-hide_banner", "-nostats", "-loglevel", "error", "-y",
      "-ss", seconds, "-i", mp4, "-frames:v", "1", png,
    ], { maxBuffer: 4 * 1024 * 1024 })
    if (extracted.code !== 0) {
      printTail(`extraction à ${atMs} ms`, extracted)
      throw new Error(`Extraction de l'image à ${atMs} ms impossible pour ${slug}.`)
    }
    let ssim = 1
    if (!accept) {
      const goldenPng = path.join(dir, "golden", slug, "frames", `${atMs}.png`)
      if (existsSync(goldenPng)) ssim = await measureSsim(png, goldenPng)
    }
    frames.push({ atMs, ssim })
  }

  const facts = buildRunFacts({
    tools: { node: process.version, ffmpeg },
    vtt,
    txt,
    validationIssues,
    audioMix,
    audioLevels,
    timeline: timelineAfter,
    probe,
    videoBytes,
    black: parseBlackdetect(detectedBlack.stderr),
    frozen: parseFreezedetect(detectedFrozen.stderr, probe.durationMs),
    frames,
  })
  return { facts, framesDir, vttPath, txtPath }
}

/** Replaces `golden/<slug>/` with this valid run and rewrites the inventory. */
async function acceptGolden(
  dir: string,
  slug: string,
  run: CollectedRun,
  note: string,
  inventory: BaselineInventory,
): Promise<BaselineInventory> {
  const goldenDir = path.join(dir, "golden", slug)
  await rm(goldenDir, { recursive: true, force: true })
  await mkdir(path.join(goldenDir, "frames"), { recursive: true })
  await copyFile(run.vttPath, path.join(goldenDir, `${slug}.vtt`))
  await copyFile(run.txtPath, path.join(goldenDir, `${slug}.txt`))
  for (const frame of run.facts.frames) {
    await copyFile(path.join(run.framesDir, `${frame.atMs}.png`), path.join(goldenDir, "frames", `${frame.atMs}.png`))
  }
  const facts: RunFacts = { ...run.facts, frames: run.facts.frames.map(({ atMs }) => ({ atMs, ssim: 1 })) }
  await writeFile(path.join(goldenDir, "facts.json"), `${JSON.stringify(facts, null, 2)}\n`, "utf8")

  inventory.videos[slug] = { ...inventory.videos[slug], golden: { acceptedAt: new Date().toISOString(), note } }
  return writeInventory(dir, inventoryMetadata(inventory))
}

function printFindings(findings: Finding[]): void {
  for (const finding of findings) {
    console.log(`    ${finding.field}`)
    console.log(`      golden : ${valueSummary(finding.golden, finding.actual)}`)
    console.log(`      actual : ${valueSummary(finding.actual, finding.golden)}`)
  }
}

/** Prints the block of one compared video; returns false when a failing finding exists. */
function printComparison(slug: string, golden: RunFacts, actual: RunFacts): boolean {
  const findings = compareRuns(golden, actual)
  const informative = findings.filter((finding) => finding.class === "informative")
  const failures = failing(findings)

  if (informative.length) {
    console.log("  Informations (non bloquantes) :")
    printFindings(informative)
  }
  for (const findingClass of ["strict", "tolerance"] as const) {
    const group = failures.filter((finding) => finding.class === findingClass)
    if (!group.length) continue
    console.log(`  Écarts ${findingClass === "strict" ? "stricts" : "de tolérance"} :`)
    printFindings(group)
  }
  if (failures.length) {
    console.log(`FAILED ${slug}: ${failures.length} finding(s)`)
    return false
  }
  console.log(`OK ${slug}`)
  return true
}

type VideoOptions = { dir: string; slug: string; accept: boolean; note: string; keep: boolean }

type VideoResult = { ok: boolean; inventory?: BaselineInventory }

async function processVideo(options: VideoOptions, inventory: BaselineInventory, root: string): Promise<VideoResult> {
  const { dir, slug, accept, note, keep } = options
  const video = inventory.videos[slug]
  const work = await mkdtemp(path.join(os.tmpdir(), "tutocast-regress-"))
  try {
    await prepareWork(dir, slug, work)
    await pinOrigin(work, root, video.productCommit, slug)

    const env = { ...process.env, VIDEO_MUSIC_PATH: path.join(dir, ...inventory.music.split("/")) }
    const assembled = await runVideoTool(root, "assemble.ts", video.id, work, env)
    if (assembled.code !== 0) {
      printTail(`assemble.ts (${slug})`, assembled)
      throw new Error(`assemble.ts a échoué pour ${slug} (code ${assembled.code}).`)
    }

    const videoDir = path.join(work, "videos", "output", slug)
    const validationFile = path.join(videoDir, "validation.json")
    await rm(validationFile, { force: true })
    const validated = await runVideoTool(root, "validate.ts", video.id, work, env)

    let report: unknown
    try {
      report = JSON.parse(await readFile(validationFile, "utf8")) as unknown
    } catch {
      printTail(`validate.ts (${slug})`, validated)
      throw new Error(`Résultat de validation introuvable pour ${slug} : ${validationFile} n'existe pas ou ne se lit pas après validate.ts.`)
    }
    let validationIssues: string[]
    try {
      validationIssues = validationIssuesFromRun(validated.code, report, video.id)
    } catch (error) {
      printTail(`validate.ts (${slug})`, validated)
      throw error
    }

    const collected = await collectRun({ dir, slug, work, validationIssues, accept })

    if (accept) {
      if (validationIssues.length) {
        throw new Error(`${slug} : validation a relevé ${validationIssues.length} problème(s) ; un golden doit être un run valide, rien n'a été écrit :\n- ${validationIssues.join("\n- ")}`)
      }
      const written = await acceptGolden(dir, slug, collected, note, inventory)
      console.log(`Golden accepté pour ${slug} (note : ${note}).`)
      console.log(`OK ${slug}`)
      return { ok: true, inventory: written }
    }

    const goldenFile = path.join(dir, "golden", slug, "facts.json")
    if (!existsSync(goldenFile)) {
      throw new Error(`${slug} n'a pas encore de golden ; lancer avec --accept --note "<raison>" pour l'accepter.`)
    }
    const golden = await readJson<RunFacts>(goldenFile)
    return { ok: printComparison(slug, golden, collected.facts) }
  } finally {
    if (keep) console.log(`Dossier de travail conservé : ${work}`)
    else await rm(work, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  const dir = path.resolve(required("--dir"))
  const accept = args.includes("--accept")
  const keep = args.includes("--keep")
  const note = option("--note")
  if (accept && !note?.trim()) {
    throw new Error(`--accept exige --note "<raison>" : un golden n'est accepté que pour un changement voulu.\n\n${USAGE}`)
  }
  const requestedSlug = option("--slug")

  const inventory = await readBaseline(dir)
  const issues = inventoryIssues(inventory, await hashTree(dir))
  if (issues.length) {
    for (const issue of issues) console.error(issue)
    throw new Error(`${dir} : ${issues.length} problème(s), le dossier ne correspond plus à inventory.json ; rien n'a été assemblé.`)
  }

  const available = Object.keys(inventory.videos).sort()
  if (requestedSlug && !inventory.videos[requestedSlug]) {
    throw new Error(`${requestedSlug} n'est pas une vidéo de la baseline ${dir}.`)
  }
  const slugs = requestedSlug ? [requestedSlug] : available
  if (!slugs.length) {
    throw new Error(`La baseline ${dir} ne contient aucune vidéo ; ajouter d'abord avec npm run video:baseline -- add.`)
  }

  const root = await repositoryRoot()
  let current = inventory
  let failed = false
  for (const slug of slugs) {
    console.log(`\n${slug}`)
    const result = await processVideo({ dir, slug, accept, note: note?.trim() ?? "", keep }, current, root)
    if (result.inventory) current = result.inventory
    if (!result.ok) failed = true
  }
  if (failed) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
