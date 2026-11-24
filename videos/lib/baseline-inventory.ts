// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Inventory of a baseline folder: SHA-256 and size of every file it keeps, the versions of the
 * tools that wrote it, the product commit of each reference video and its golden acceptance.
 *
 * The inventory is only written through `writeInventory`, which writes the README first, then the
 * checksums of what is on disk, then `inventory.json`, and refuses to leave an inconsistent folder
 * behind. `hashTree` deliberately walks only the documented roots of a baseline, so the source
 * material kept beside them (`batch43-output/`) is never reported as an unlisted file.
 */
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat, mkdir, open, readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

export type FileFact = { sha256: string; bytes: number }

export type BaselineInventory = {
  version: 1
  createdAt: string
  engineCommit: string
  tools: { node: string; ffmpeg: string; ffprobe: string; platform: string }
  music: string
  backup?: string
  videos: Record<string, { id: string; productCommit: string; golden?: { acceptedAt: string; note: string } }>
  files: Record<string, FileFact>
}

const INVENTORY_FILE = "inventory.json"
/** Roots of a baseline that hold its own material; a directory beside them is source material. */
const HASHED_ROOTS = ["README.md", "music", "videos", "golden"] as const
/** Prefix of the error raised when a command is about to modify a folder that no longer matches its inventory. */
const CHANGED_PREFIX = "Baseline changed since its inventory was written; restore it or investigate before modifying it:"

function posix(relative: string): string {
  return relative.split(path.sep).join("/")
}

function missingBaselineMessage(dir: string): string {
  return `${dir}: no baseline inventory found (inventory.json is missing). See ${path.join(dir, "README.md")} for what this folder holds and how to restore it from its backup copy.`
}

function hashFile(file: string): Promise<FileFact> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256")
    let bytes = 0
    createReadStream(file)
      .on("data", (chunk: Buffer) => {
        bytes += chunk.length
        hash.update(chunk)
      })
      .on("error", reject)
      .on("end", () => resolve({ sha256: hash.digest("hex"), bytes }))
  })
}

/** True when `name` is not a plain file name: empty, absolute, or with a separator or `..`. */
export function unsafeFileName(name: string): boolean {
  return name === "" || path.isAbsolute(name) || name.includes("/") || name.includes("\\") || name.includes("..")
}

/** Files a narrated video needs in the baseline, relative to the baseline folder, POSIX paths. */
export function videoInputFiles(slug: string, timeline: { video: string }, audioFileNames: string[]): string[] {
  const dir = `videos/output/${slug}`
  return [
    `videos/manifests/${slug}.json`,
    `${dir}/timeline.json`,
    `${dir}/audio-metadata.json`,
    `${dir}/narration-audit.json`,
    `${dir}/${timeline.video}`,
    ...audioFileNames.map((name) => `${dir}/audio/${name}`),
  ]
}

/** One line per difference between the inventory and the disk, sorted by file. */
export function inventoryIssues(inventory: BaselineInventory, onDisk: Record<string, FileFact>): string[] {
  const issues: string[] = []
  for (const [file, expected] of Object.entries(inventory.files)) {
    const actual = onDisk[file]
    if (!actual) issues.push(`missing: ${file}`)
    else if (actual.sha256 !== expected.sha256) issues.push(`changed: ${file}`)
  }
  for (const file of Object.keys(onDisk)) {
    if (file === INVENTORY_FILE) continue
    if (!(file in inventory.files)) issues.push(`unlisted: ${file}`)
  }
  return issues.sort()
}

/** The path an `inventoryIssues` line names, after its `missing:`, `changed:` or `unlisted:` prefix. */
function issuePath(issue: string): string {
  return issue.slice(issue.indexOf(": ") + 2)
}

/**
 * Refuses to let a command change a folder that no longer matches its inventory, except for the paths
 * the command is about to replace. `replacing` holds relative POSIX paths: an entry ending in `/` also
 * covers everything below it, a file entry covers that exact file. Throws one line per remaining issue.
 */
export async function assertUnchanged(dir: string, inventory: BaselineInventory, replacing: string[] = []): Promise<void> {
  const issues = inventoryIssues(inventory, await hashTree(dir)).filter((issue) => {
    const file = issuePath(issue)
    return !replacing.some((entry) => file === entry || (entry.endsWith("/") && file.startsWith(entry)))
  })
  if (issues.length) throw new Error(`${CHANGED_PREFIX}\n${issues.join("\n")}`)
}

/** Reads the inventory of a baseline folder, with the Review Focus 1 message when there is none. */
export async function readBaseline(dir: string): Promise<BaselineInventory> {
  try {
    return JSON.parse(await readFile(path.join(dir, INVENTORY_FILE), "utf8")) as BaselineInventory
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT" || code === "ENOTDIR") throw new Error(missingBaselineMessage(dir))
    throw error
  }
}

/** The content of a baseline lock file: who holds the folder and since when. */
export type BaselineLock = { pid: number; command: string; startedAt: string }

/** The lock file of a baseline folder; it lives outside the roots `hashTree` walks. */
const LOCK_FILE = ".lock"

/**
 * What to do with a lock file found before a command. A missing file is free; a stale one (no
 * process, or unreadable content) can be removed and taken; a live holder means the command must
 * wait instead of colliding with it.
 */
export function lockDecision(
  existing: BaselineLock | "unreadable" | null,
  alive: boolean,
): "take" | "take-stale" | "refuse" {
  if (existing === null) return "take"
  if (existing === "unreadable") return "take-stale"
  return alive ? "refuse" : "take-stale"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Reads a lock file; `null` when absent and `"unreadable"` when it does not carry the expected fields. */
async function readLock(file: string): Promise<BaselineLock | "unreadable" | null> {
  let text: string
  try {
    text = await readFile(file, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    return "unreadable"
  }
  try {
    const value: unknown = JSON.parse(text)
    if (
      isRecord(value)
      && typeof value.pid === "number" && Number.isSafeInteger(value.pid) && value.pid > 0
      && typeof value.command === "string"
      && typeof value.startedAt === "string"
    ) {
      return { pid: value.pid, command: value.command, startedAt: value.startedAt }
    }
  } catch {
    // Not JSON: the lock is unreadable and treated as stale below.
  }
  return "unreadable"
}

/** True when a process with this pid exists (`EPERM` means it exists but belongs to someone else). */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

/** Creates the lock file exclusively and writes its one JSON line. */
async function createLockFile(file: string, command: string): Promise<void> {
  const handle = await open(file, "wx")
  try {
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, command, startedAt: new Date().toISOString() })}\n`, "utf8")
  } catch (error) {
    await handle.close().catch(() => {})
    await rm(file, { force: true }).catch(() => {})
    throw error
  }
  await handle.close()
}

/**
 * Takes the lock of a baseline folder, or returns false when the folder does not exist (nothing to
 * protect; the caller's own missing-baseline message follows). A live holder is refused with the
 * folder, its pid, its command and its start time; a stale or unreadable lock is announced, removed
 * and taken over.
 */
async function acquireLock(dir: string, file: string, command: string): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await createLockFile(file, command)
      return true
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "ENOENT") return false
      if (code !== "EEXIST") throw error
      const existing = await readLock(file)
      const alive = existing !== null && existing !== "unreadable" && isProcessAlive(existing.pid)
      const decision = lockDecision(existing, alive)
      if (decision === "refuse") {
        const lock = existing as BaselineLock
        throw new Error(
          `Baseline ${dir} is locked by process ${lock.pid} (${lock.command}, started ${lock.startedAt}); wait for it to finish or check that process before retrying.`,
        )
      }
      // The file vanished between the failed exclusive open and the read: just try again.
      if (decision === "take" || existing === null) continue
      const stale = existing === "unreadable"
        ? "unreadable lock file"
        : `stale lock of process ${existing.pid} (${existing.command}, started ${existing.startedAt})`
      console.log(`${dir} : ${stale} removed, taking the lock.`)
      await rm(file, { force: true })
    }
  }
  throw new Error(`Could not take the baseline lock ${file}: too many concurrent attempts.`)
}

/**
 * Runs `body` as the only command on the baseline folder `dir`, with `<dir>/.lock` held for the
 * whole call and always released, including when `body` throws. The folder must already exist for
 * `add`, which creates it first; a missing folder simply has no lock to take.
 */
export async function withBaselineLock<T>(dir: string, command: string, body: () => Promise<T>): Promise<T> {
  const file = path.join(dir, LOCK_FILE)
  const locked = await acquireLock(dir, file, command)
  if (!locked) return body()
  try {
    return await body()
  } finally {
    await rm(file, { force: true })
  }
}

/**
 * SHA-256 and size of every file under `README.md`, `music/`, `videos/` and `golden/` of `dir`.
 * Missing roots are simply empty; symlinks and special files are not followed or listed.
 */
export async function hashTree(dir: string): Promise<Record<string, FileFact>> {
  const files: Record<string, FileFact> = {}
  const walk = async (relative: string): Promise<void> => {
    const absolute = path.join(dir, relative)
    let stats
    try {
      stats = await lstat(absolute)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw error
    }
    if (stats.isFile()) {
      files[posix(relative)] = await hashFile(absolute)
      return
    }
    if (!stats.isDirectory()) return
    const entries = await readdir(absolute, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (entry.isDirectory()) await walk(path.join(relative, entry.name))
      else if (entry.isFile()) files[posix(path.join(relative, entry.name))] = await hashFile(path.join(absolute, entry.name))
    }
  }
  for (const root of HASHED_ROOTS) await walk(root)
  return files
}

/** The whole README.md of a baseline, a pure function of the inventory. */
export function baselineReadme(inventory: BaselineInventory): string {
  const videos = Object.entries(inventory.videos).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const videoLines = videos.length
    ? videos.map(([slug, video]) => {
        const golden = video.golden ? `, golden accepté le ${video.golden.acceptedAt} — note : ${video.golden.note}` : ""
        return `- \`${slug}\` (\`${video.id}\`), commit produit \`${video.productCommit}\`${golden}`
      })
    : ["- (aucune vidéo pour l'instant)"]
  const backupLines = inventory.backup
    ? [
        `La deuxième copie de ce dossier se trouve dans \`${inventory.backup}\`.`,
        "Pour restaurer, recopier son contenu par-dessus ce dossier (sans rien supprimer), puis vérifier :",
        "",
        "```bash",
        `rsync -a "${inventory.backup}/" "$TUTOCAST_BASELINE/"`,
        "```",
      ]
    : [
        "Aucune deuxième copie n'est déclarée. En choisir une, hors Git et sur un autre disque :",
        "",
        "```bash",
        'npm run video:baseline -- set-backup --dir "$TUTOCAST_BASELINE" --location <chemin-de-la-copie>',
        "```",
      ]
  return [
    "# Baseline des vidéos de référence",
    "",
    "Ce dossier garde la matière première de quelques vidéos de référence : la capture brute, la timeline,",
    "la narration générée et ses enregistrements d'audit, la musique et le résultat accepté de la boucle de",
    "régression. Il permet de réassembler ces vidéos plus tard et de comparer le résultat, sans dépendre du",
    "serveur de médias ni des fichiers rendus, qui ne sont jamais versionnés dans Git.",
    "",
    "Ce dossier vit **hors de Git** : aucun fichier de capture, d'audio, de vidéo ou d'image n'est commité.",
    "Ne pas modifier ses fichiers à la main ; `inventory.json` est réécrit à chaque commande qui change le",
    "dossier, et `README.md` est régénéré à partir de lui.",
    "",
    "## Contenu",
    "",
    "- `inventory.json` : empreinte SHA-256 et taille de chaque fichier, versions des outils, commits ;",
    "- `README.md` : ce fichier, régénéré à chaque écriture de l'inventaire ;",
    "- `music/` : la musique de fond utilisée par l'assemblage ;",
    "- `videos/catalog.json` et `videos/manifests/` : le catalogue et les manifestes des vidéos de référence ;",
    "- `videos/output/<slug>/` : capture, `timeline.json`, `audio-metadata.json`, `narration-audit.json` et `audio/` ;",
    "- `golden/<slug>/` : le résultat accepté de la boucle de régression (écrit plus tard par le runner).",
    "",
    "## Inventaire",
    "",
    `- Créé le : ${inventory.createdAt}`,
    `- Commit du moteur : \`${inventory.engineCommit}\``,
    `- Node : ${inventory.tools.node}`,
    `- ffmpeg : ${inventory.tools.ffmpeg}`,
    `- ffprobe : ${inventory.tools.ffprobe}`,
    `- Plateforme : ${inventory.tools.platform}`,
    `- Musique : \`${inventory.music}\``,
    "",
    "## Vidéos",
    "",
    ...videoLines,
    "",
    "## Deuxième copie et restauration",
    "",
    ...backupLines,
    "",
    "Sans deuxième copie, un disque perdu emporte la seule trace de ces captures : la copie de secours est",
    "la vraie garantie de durabilité de cette baseline.",
    "",
    "## Vérification",
    "",
    "`inventory.json` décrit tous les fichiers du dossier, sauf lui-même. Toute différence est signalée par",
    "`missing:`, `changed:` ou `unlisted:`, et la commande sort en erreur :",
    "",
    "```bash",
    'npm run video:baseline -- verify --dir "$TUTOCAST_BASELINE"',
    "```",
    "",
    "## Ajouter une vidéo",
    "",
    "```bash",
    'npm run video:baseline -- add --dir "$TUTOCAST_BASELINE" --from "$TUTOCAST_BASELINE/batch43-output" --slugs <slug> --music "$VIDEO_MUSIC_PATH"',
    "```",
    "",
    "`add` recopie la capture, la timeline, les enregistrements de narration, l'audio et la musique, puis",
    "réécrit cet inventaire. `--replace` est requis pour remplacer une vidéo dont un golden a été accepté.",
    "",
  ].join("\n")
}

/**
 * Writes `README.md`, then the checksums of the folder, then `inventory.json`, and refuses to return
 * an inventory that does not describe what is on disk. This is the only writer of the inventory.
 * `ignore` names paths that are not part of the baseline material (a previous golden kept aside by an
 * interrupted swap): they are neither inventoried nor reported as unlisted.
 */
export async function writeInventory(
  dir: string,
  inventory: Omit<BaselineInventory, "files">,
  ignore: string[] = [],
): Promise<BaselineInventory> {
  await mkdir(dir, { recursive: true })
  const base: BaselineInventory = { ...inventory, files: {} }
  await writeFile(path.join(dir, "README.md"), baselineReadme(base), "utf8")
  const hash = async (): Promise<Record<string, FileFact>> => {
    const files = await hashTree(dir)
    if (!ignore.length) return files
    return Object.fromEntries(
      Object.entries(files).filter(([file]) => !ignore.some((entry) => file === entry || file.startsWith(entry.endsWith("/") ? entry : `${entry}/`))),
    )
  }
  const written: BaselineInventory = { ...inventory, files: await hash() }
  await writeFile(path.join(dir, INVENTORY_FILE), `${JSON.stringify(written, null, 2)}\n`, "utf8")
  const issues = inventoryIssues(written, await hash())
  if (issues.length) {
    throw new Error(`Inventory written to ${path.join(dir, INVENTORY_FILE)} does not describe the folder:\n${issues.join("\n")}`)
  }
  return written
}
