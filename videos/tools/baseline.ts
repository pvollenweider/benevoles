// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Manages a baseline folder of reference videos: adds a narrated capture (raw capture, timeline,
 * narration records and audio, music), records where its second copy lives, and verifies every
 * checksum of the inventory.
 *
 *   npm run video:baseline -- add --dir <baseline> --from <output dir> --slugs a,b --music <file> [--replace]
 *   npm run video:baseline -- set-backup --dir <baseline> --location <path>
 *   npm run video:baseline -- verify --dir <baseline>
 *
 * `add` refuses to replace a video whose golden run was accepted unless `--replace` is given, and
 * every command that changes the folder ends with `writeInventory`, so `inventory.json` always
 * describes what is on disk. Nothing from a baseline folder is ever written to Git.
 */
import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import {
  hashTree,
  inventoryIssues,
  readBaseline,
  videoInputFiles,
  writeInventory,
  type BaselineInventory,
} from "../lib/baseline-inventory"
import { loadCatalog, videosRoot, type Timeline } from "../lib/manifest"

const exec = promisify(execFile)

const USAGE = [
  "Usage:",
  "  npm run video:baseline -- add --dir <baseline> --from <output dir> --slugs a,b --music <file> [--replace]",
  "  npm run video:baseline -- set-backup --dir <baseline> --location <path>",
  "  npm run video:baseline -- verify --dir <baseline>",
].join("\n")

const args = process.argv.slice(2)

function option(name: string): string | undefined {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value\n\n${USAGE}`)
  return value
}

function required(name: string): string {
  const value = option(name)
  if (!value) throw new Error(`Missing ${name}\n\n${USAGE}`)
  return value
}

/** First line of a tool's version output; recorded as unavailable rather than failing the copy. */
async function firstLine(command: string, commandArgs: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await exec(command, commandArgs, { maxBuffer: 4 * 1024 * 1024 })
    const line = (stdout || stderr).split("\n")[0]?.trim()
    return line || `${command}: no version output`
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error)
    return `${command}: unavailable (${detail})`
  }
}

async function toolVersions(): Promise<BaselineInventory["tools"]> {
  return {
    node: await firstLine("node", ["--version"]),
    ffmpeg: await firstLine("ffmpeg", ["-version"]),
    ffprobe: await firstLine("ffprobe", ["-version"]),
    platform: `${process.platform} ${process.arch}`,
  }
}

async function engineCommit(): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", "HEAD"])
  return stdout.trim()
}

/** Everything of an inventory except its checksums, for the next `writeInventory`. */
function metadata(inventory: BaselineInventory): Omit<BaselineInventory, "files"> {
  return {
    version: inventory.version,
    createdAt: inventory.createdAt,
    engineCommit: inventory.engineCommit,
    tools: inventory.tools,
    music: inventory.music,
    backup: inventory.backup,
    videos: inventory.videos,
  }
}

async function copyInto(source: string, destination: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true })
  await copyFile(source, destination)
}

type AddPlan = {
  slug: string
  id: string
  productCommit: string
  sourceDir: string
  timeline: Timeline
  audioNames: string[]
}

/** Reads and validates everything first, so a refused `add` has not touched the baseline yet. */
async function planAdd(from: string, slugs: string[], replace: boolean, existing: BaselineInventory | null): Promise<AddPlan[]> {
  const catalog = await loadCatalog()
  const plans: AddPlan[] = []
  for (const slug of slugs) {
    const catalogVideo = catalog.videos.find((video) => video.manifest === slug)
    if (!catalogVideo) throw new Error(`Unknown video slug "${slug}": no catalog entry has that manifest.`)
    if (existing?.videos[slug]?.golden && !replace) {
      throw new Error(`${slug} already has a golden run; pass --replace to replace it.`)
    }
    const sourceDir = path.join(from, slug)
    const timelineFile = path.join(sourceDir, "timeline.json")
    let timeline: Timeline
    try {
      timeline = JSON.parse(await readFile(timelineFile, "utf8")) as Timeline
    } catch (error) {
      throw new Error(`Cannot read ${timelineFile}: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (timeline.capturePurpose !== "narration-timed") throw new Error(`${timelineFile}: capturePurpose must be "narration-timed"`)
    if (!timeline.product?.commit) throw new Error(`${timelineFile}: product.commit is required`)
    if (!timeline.video) throw new Error(`${timelineFile}: video is required`)
    let audioNames: string[]
    try {
      const entries = await readdir(path.join(sourceDir, "audio"), { withFileTypes: true })
      audioNames = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort()
    } catch (error) {
      throw new Error(`Cannot read ${path.join(sourceDir, "audio")}: ${error instanceof Error ? error.message : String(error)}`)
    }
    plans.push({ slug, id: catalogVideo.id, productCommit: timeline.product.commit, sourceDir, timeline, audioNames })
  }
  return plans
}

async function add(): Promise<void> {
  const dir = required("--dir")
  const from = required("--from")
  const musicSource = required("--music")
  const slugs = required("--slugs")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean)
  if (!slugs.length) throw new Error(`--slugs is empty\n\n${USAGE}`)
  if (!existsSync(musicSource)) throw new Error(`Music file not found: ${musicSource}`)
  const replace = args.includes("--replace")
  const existing = existsSync(path.join(dir, "inventory.json")) ? await readBaseline(dir) : null
  const plans = await planAdd(from, slugs, replace, existing)

  const musicName = path.basename(musicSource)
  const music = `music/${musicName}`
  const musicDestination = path.join(dir, "music", musicName)

  for (const plan of plans) {
    const outputPrefix = `videos/output/${plan.slug}/`
    for (const relative of videoInputFiles(plan.slug, plan.timeline, plan.audioNames)) {
      if (!relative.startsWith(outputPrefix)) continue
      const inner = relative.slice(outputPrefix.length)
      await copyInto(path.join(plan.sourceDir, inner), path.join(dir, ...relative.split("/")))
    }
    await copyInto(path.join(videosRoot, "manifests", `${plan.slug}.json`), path.join(dir, "videos", "manifests", `${plan.slug}.json`))
  }
  await copyInto(path.join(videosRoot, "catalog.json"), path.join(dir, "videos", "catalog.json"))
  if (path.resolve(musicSource) !== path.resolve(musicDestination)) await copyInto(musicSource, musicDestination)
  // The golden run described the replaced inputs: it can no longer be trusted, and keeping it would
  // leave files that the new inventory does not list.
  for (const plan of plans) {
    if (replace) await rm(path.join(dir, "golden", plan.slug), { recursive: true, force: true })
  }

  const videos = { ...(existing?.videos ?? {}) }
  for (const plan of plans) videos[plan.slug] = { id: plan.id, productCommit: plan.productCommit }
  const written = await writeInventory(dir, {
    version: 1,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    engineCommit: await engineCommit(),
    tools: await toolVersions(),
    music,
    ...(existing?.backup ? { backup: existing.backup } : {}),
    videos,
  })

  console.log(`${plans.length} vidéo(s) ajoutée(s) à ${dir} ; ${Object.keys(written.files).length} fichier(s) inventorié(s).`)
  for (const plan of plans) console.log(`  + ${plan.slug} (${plan.id}), commit produit ${plan.productCommit}`)
  if (!written.backup) console.log("Aucune deuxième copie déclarée : voir README.md, commande set-backup.")
}

async function setBackup(): Promise<void> {
  const dir = required("--dir")
  const location = required("--location")
  const inventory = await readBaseline(dir)
  const written = await writeInventory(dir, { ...metadata(inventory), backup: location })
  console.log(`${dir} : deuxième copie déclarée dans ${location} ; ${Object.keys(written.files).length} fichier(s) inventorié(s).`)
}

async function verify(): Promise<void> {
  const dir = required("--dir")
  const inventory = await readBaseline(dir)
  const issues = inventoryIssues(inventory, await hashTree(dir))
  if (issues.length) {
    for (const issue of issues) console.error(issue)
    console.error(`${dir} : ${issues.length} problème(s), le dossier ne correspond plus à inventory.json.`)
    process.exit(1)
  }
  console.log(`${dir} : ${Object.keys(inventory.files).length} fichier(s) vérifié(s), tous conformes.`)
}

async function main(): Promise<void> {
  const command = args[0]
  if (command === "add") return add()
  if (command === "set-backup") return setBackup()
  if (command === "verify") return verify()
  throw new Error(USAGE)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
