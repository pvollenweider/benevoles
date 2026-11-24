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
 * refuses a source set whose narration audio does not match its audit and generation records,
 * before copying anything. Every command that changes the folder ends with `writeInventory`, so
 * `inventory.json` always describes what is on disk. Nothing from a baseline folder is ever
 * written to Git.
 */
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { copyFile, lstat, mkdir, readFile, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { setConsistencyIssues, type SetUnderCheck } from "../lib/baseline-consistency"
import {
  assertUnchanged,
  hashTree,
  inventoryIssues,
  readBaseline,
  unsafeFileName,
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

async function readSourceJson<T>(file: string, slug: string): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T
  } catch (error) {
    throw new Error(`${slug}: cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

type ResolvedCopy = { source: string; destination: string }

type AddPlan = {
  slug: string
  id: string
  productCommit: string
  copies: ResolvedCopy[]
}

type AddPlanResult = {
  plans: AddPlan[]
  catalog: ResolvedCopy
  music: ResolvedCopy & { replacing: boolean; relative: string }
}

/** Refuses a source before any mutation when it is missing or is not a regular file. */
async function requireSourceFile(source: string, label: string): Promise<void> {
  let stats
  try {
    stats = await lstat(source)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`${label}: missing source file ${source}`)
    throw new Error(`${label}: cannot read source file ${source}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!stats.isFile()) throw new Error(`${label}: source is not a regular file ${source}`)
}

/**
 * Reads and validates everything first, so a refused `add` has not touched the baseline. The result
 * carries every resolved source and destination, so the copy loop never rebuilds a path and a
 * failure cannot leave a slug's previous files removed.
 */
async function planAdd(
  dir: string,
  from: string,
  slugs: string[],
  musicSource: string,
  replace: boolean,
  existing: BaselineInventory | null,
): Promise<AddPlanResult> {
  const catalog = await loadCatalog()
  const plans: AddPlan[] = []
  const consistency: string[] = []
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
    if (unsafeFileName(timeline.video)) {
      throw new Error(`${slug}: timeline.video must be a plain file name, got "${timeline.video}".`)
    }
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
    const outputPrefix = `videos/output/${slug}/`
    const manifest = `videos/manifests/${slug}.json`
    const copies: ResolvedCopy[] = []
    for (const relative of videoInputFiles(slug, timeline, audioNames)) {
      if (relative !== manifest && !relative.startsWith(outputPrefix)) {
        throw new Error(`${slug}: unexpected input path ${relative}`)
      }
      const source =
        relative === manifest ? path.join(videosRoot, "manifests", `${slug}.json`) : path.join(sourceDir, relative.slice(outputPrefix.length))
      await requireSourceFile(source, slug)
      copies.push({ source, destination: path.join(dir, ...relative.split("/")) })
    }

    // Every source exists now: prove that this set can be assembled before the baseline is touched.
    const sourceManifest = await readSourceJson<SetUnderCheck["manifest"]>(path.join(videosRoot, "manifests", `${slug}.json`), slug)
    const audio = await readSourceJson<SetUnderCheck["audio"]>(path.join(sourceDir, "audio-metadata.json"), slug)
    const audit = await readSourceJson<SetUnderCheck["audit"]>(path.join(sourceDir, "narration-audit.json"), slug)
    const audioSha256: Record<string, string> = {}
    for (const segment of Object.values(audio.segments)) {
      if (typeof segment?.file !== "string" || !segment.file.startsWith("audio/")) continue
      const name = segment.file.slice("audio/".length)
      if (unsafeFileName(name)) continue
      try {
        audioSha256[segment.file] = sha256(await readFile(path.join(sourceDir, "audio", name)))
      } catch {
        // Absent from disk: `setConsistencyIssues` reports the missing checksum.
      }
    }
    for (const issue of setConsistencyIssues({ manifest: sourceManifest, timeline, audio, audit, audioSha256 })) {
      consistency.push(`${slug}: ${issue}`)
    }

    plans.push({ slug, id: catalogVideo.id, productCommit: timeline.product.commit, copies })
  }

  if (consistency.length) {
    throw new Error(`Source set not coherent; nothing was copied. Every problem found:\n${consistency.join("\n")}`)
  }

  const catalogCopy = { source: path.join(videosRoot, "catalog.json"), destination: path.join(dir, "videos", "catalog.json") }
  await requireSourceFile(catalogCopy.source, "catalog")
  const music: ResolvedCopy & { replacing: boolean; relative: string } = {
    source: musicSource,
    destination: path.join(dir, "music", path.basename(musicSource)),
    replacing: path.resolve(musicSource) !== path.resolve(dir, "music", path.basename(musicSource)),
    relative: `music/${path.basename(musicSource)}`,
  }
  await requireSourceFile(music.source, "music")
  return { plans, catalog: catalogCopy, music }
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
  const replace = args.includes("--replace")
  const existing = existsSync(path.join(dir, "inventory.json")) ? await readBaseline(dir) : null
  const { plans, catalog, music } = await planAdd(dir, from, slugs, musicSource, replace, existing)

  if (existing) {
    // Everything this run is about to rewrite, so a changed file elsewhere still refuses the command.
    const replacing = [
      ...plans.flatMap((plan) => [
        `videos/output/${plan.slug}/`,
        `videos/manifests/${plan.slug}.json`,
        `golden/${plan.slug}/`,
      ]),
      "videos/catalog.json",
      "README.md",
      // Only a track this run overwrites may hide a changed music file from the check.
      ...(music.replacing ? [existing.music] : []),
    ]
    await assertUnchanged(dir, existing, replacing)
  }

  // Every source is known to exist now, so remove what this run replaces before copying anything:
  // stale files from an earlier add (an old audio name, a renamed capture) must not survive and be
  // hashed as legitimate by the new inventory.
  for (const plan of plans) {
    await rm(path.join(dir, "videos", "output", plan.slug), { recursive: true, force: true })
    if (replace) await rm(path.join(dir, "golden", plan.slug), { recursive: true, force: true })
  }
  if (existing?.music && existing.music !== music.relative) {
    await rm(path.join(dir, ...existing.music.split("/")), { force: true })
  }

  for (const plan of plans) {
    for (const copy of plan.copies) await copyInto(copy.source, copy.destination)
  }
  await copyInto(catalog.source, catalog.destination)
  if (music.replacing) await copyInto(music.source, music.destination)

  const videos = { ...(existing?.videos ?? {}) }
  for (const plan of plans) videos[plan.slug] = { id: plan.id, productCommit: plan.productCommit }
  const written = await writeInventory(dir, {
    version: 1,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    engineCommit: await engineCommit(),
    tools: await toolVersions(),
    music: music.relative,
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
  await assertUnchanged(dir, inventory)
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
