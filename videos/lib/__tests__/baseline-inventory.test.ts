// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  assertUnchanged,
  baselineReadme,
  hashTree,
  inventoryIssues,
  lockDecision,
  readBaseline,
  unsafeFileName,
  videoInputFiles,
  withBaselineLock,
  writeInventory,
  type BaselineInventory,
  type FileFact,
} from "../baseline-inventory"

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "baseline-inventory-"))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function fact(sha256: string, bytes = 1): FileFact {
  return { sha256, bytes }
}

function inventory(overrides: Partial<BaselineInventory> = {}): BaselineInventory {
  return {
    version: 1,
    createdAt: "2026-11-24T12:00:00.000Z",
    engineCommit: "e130f3dd",
    tools: {
      node: "v26.9.0",
      ffmpeg: "ffmpeg version 8.1.1",
      ffprobe: "ffprobe version 8.1.1",
      platform: "darwin arm64",
    },
    music: "music/track.mp3",
    videos: {},
    files: {},
    ...overrides,
  }
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}

describe("videoInputFiles", () => {
  it("lists the six files of a narrated capture, relative to the baseline folder", () => {
    expect(videoInputFiles("a", { video: "capture.webm" }, ["x.wav"])).toEqual([
      "videos/manifests/a.json",
      "videos/output/a/timeline.json",
      "videos/output/a/audio-metadata.json",
      "videos/output/a/narration-audit.json",
      "videos/output/a/capture.webm",
      "videos/output/a/audio/x.wav",
    ])
  })
})

describe("unsafeFileName", () => {
  it("rejects an empty, absolute or traversing name", () => {
    for (const name of ["", "/x", "a/b", "a\\b", "..", "../x"]) expect(unsafeFileName(name), name).toBe(true)
  })

  it("accepts a plain file name, dots inside the stem included", () => {
    for (const name of ["capture.webm", "capture.v2.webm"]) expect(unsafeFileName(name), name).toBe(false)
  })
})

describe("inventoryIssues", () => {
  it("finds nothing when the inventory and the disk agree", () => {
    const files = { "README.md": fact("a"), "videos/output/a/timeline.json": fact("b", 10) }
    expect(inventoryIssues(inventory({ files }), { ...files })).toEqual([])
  })

  it("reports a file whose checksum changed", () => {
    expect(inventoryIssues(inventory({ files: { "a.json": fact("a") } }), { "a.json": fact("b") })).toEqual(["changed: a.json"])
  })

  it("reports a listed file that is gone", () => {
    expect(inventoryIssues(inventory({ files: { "a.json": fact("a") } }), {})).toEqual(["missing: a.json"])
  })

  it("reports a file on disk that the inventory does not list", () => {
    expect(inventoryIssues(inventory(), { "a.json": fact("a") })).toEqual(["unlisted: a.json"])
  })

  it("never reports inventory.json itself", () => {
    expect(inventoryIssues(inventory(), { "inventory.json": fact("a") })).toEqual([])
  })
})

describe("readBaseline", () => {
  it("refuses a directory that does not exist, naming it and its README.md", async () => {
    const directory = path.join(await temporaryDirectory(), "moved")
    const error = await readBaseline(directory).then(
      () => null,
      (reason: unknown) => reason as Error,
    )
    expect(error).toBeInstanceOf(Error)
    expect(error!.message).toContain(directory)
    expect(error!.message).toContain("README.md")
  })

  it("refuses a directory without inventory.json, naming it and its README.md", async () => {
    const directory = await temporaryDirectory()
    const error = await readBaseline(directory).then(
      () => null,
      (reason: unknown) => reason as Error,
    )
    expect(error).toBeInstanceOf(Error)
    expect(error!.message).toContain(directory)
    expect(error!.message).toContain("README.md")
  })

  it("refuses an inventory.json that is not JSON, naming the folder and its README.md", async () => {
    const directory = await temporaryDirectory()
    await writeFile(path.join(directory, "inventory.json"), '{ "version": 1,')
    const error = await readBaseline(directory).then(
      () => null,
      (reason: unknown) => reason as Error,
    )
    expect(error).toBeInstanceOf(Error)
    expect(error!.message).toContain(directory)
    expect(error!.message).toContain("README.md")
  })
})

describe("hashTree", () => {
  it("hashes README.md, music/, videos/ and golden/, and nothing else", async () => {
    const directory = await temporaryDirectory()
    await mkdir(path.join(directory, "videos", "output", "a"), { recursive: true })
    await mkdir(path.join(directory, "batch43-output", "a"), { recursive: true })
    await writeFile(path.join(directory, "README.md"), "restore")
    await writeFile(path.join(directory, "videos", "output", "a", "timeline.json"), '{"cues":[]}')
    await writeFile(path.join(directory, "inventory.json"), "{}")
    await writeFile(path.join(directory, "batch43-output", "a", "capture.webm"), "raw")

    expect(await hashTree(directory)).toEqual({
      "README.md": { sha256: sha256("restore"), bytes: 7 },
      "videos/output/a/timeline.json": { sha256: sha256('{"cues":[]}'), bytes: 11 },
    })
  })
})

describe("lockDecision", () => {
  const lock = { pid: 42, command: "video:baseline add", startedAt: "2026-11-24T12:00:00.000Z" }

  it("takes the lock when there is no file", () => {
    expect(lockDecision(null, false)).toBe("take")
    expect(lockDecision(null, true)).toBe("take")
  })

  it("takes an unreadable file as a stale lock", () => {
    expect(lockDecision("unreadable", false)).toBe("take-stale")
    expect(lockDecision("unreadable", true)).toBe("take-stale")
  })

  it("takes the lock of a process that no longer exists as stale", () => {
    expect(lockDecision(lock, false)).toBe("take-stale")
  })

  it("refuses the lock of a live process", () => {
    expect(lockDecision(lock, true)).toBe("refuse")
  })
})

describe("withBaselineLock", () => {
  function lockFile(directory: string): string {
    return path.join(directory, ".lock")
  }

  it("holds the lock while the body runs and releases it afterwards", async () => {
    const directory = await temporaryDirectory()
    let held = false
    await withBaselineLock(directory, "video:baseline add", async () => {
      const lock = JSON.parse(await readFile(lockFile(directory), "utf8")) as { pid: number; command: string; startedAt: string }
      expect(lock.pid).toBe(process.pid)
      expect(lock.command).toBe("video:baseline add")
      expect(Number.isNaN(Date.parse(lock.startedAt))).toBe(false)
      held = true
    })

    expect(held).toBe(true)
    await expect(stat(lockFile(directory))).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("releases the lock when the body throws", async () => {
    const directory = await temporaryDirectory()

    await expect(withBaselineLock(directory, "video:baseline add", async () => {
      throw new Error("body failed")
    })).rejects.toThrow("body failed")

    await expect(stat(lockFile(directory))).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("refuses a second command while the lock is held, naming the pid and the command", async () => {
    const directory = await temporaryDirectory()

    await withBaselineLock(directory, "video:baseline add", async () => {
      const error = await withBaselineLock(directory, "video:baseline set-backup", async () => {})
        .then(() => null, (reason: unknown) => reason as Error)
      expect(error).toBeInstanceOf(Error)
      expect(error!.message).toContain(directory)
      expect(error!.message).toContain(String(process.pid))
      expect(error!.message).toContain("video:baseline add")
      expect(error!.message).toContain(".lock")
    })

    await expect(stat(lockFile(directory))).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("replaces the lock of a process that no longer exists and runs the body", async () => {
    const directory = await temporaryDirectory()
    await writeFile(lockFile(directory), `${JSON.stringify({
      pid: 2_147_483_646,
      command: "video:regress compare",
      startedAt: "2026-11-24T12:00:00.000Z",
    })}\n`, "utf8")

    let ran = false
    await withBaselineLock(directory, "video:baseline add", async () => {
      const lock = JSON.parse(await readFile(lockFile(directory), "utf8")) as { pid: number }
      expect(lock.pid).toBe(process.pid)
      ran = true
    })

    expect(ran).toBe(true)
    await expect(stat(lockFile(directory))).rejects.toMatchObject({ code: "ENOENT" })
  })
})

describe("assertUnchanged", () => {
  const changedPrefix = "Baseline changed since its inventory was written; restore it or investigate before modifying it:"

  async function writtenBaseline(): Promise<{ directory: string; inventory: BaselineInventory }> {
    const directory = await temporaryDirectory()
    await mkdir(path.join(directory, "videos", "output", "a"), { recursive: true })
    await mkdir(path.join(directory, "music"), { recursive: true })
    await writeFile(path.join(directory, "music", "track.mp3"), "music")
    await writeFile(path.join(directory, "videos", "output", "a", "timeline.json"), '{"cues":[]}')
    return { directory, inventory: await writeInventory(directory, inventory()) }
  }

  function rejection(promise: Promise<void>): Promise<Error> {
    return promise.then(
      () => {
        throw new Error("expected the call to reject")
      },
      (reason: unknown) => reason as Error,
    )
  }

  it("resolves on an intact folder", async () => {
    const { directory, inventory: written } = await writtenBaseline()
    await expect(assertUnchanged(directory, written)).resolves.toBeUndefined()
  })

  it("rejects when a listed file changed, naming it and the path to restore", async () => {
    const { directory, inventory: written } = await writtenBaseline()
    await writeFile(path.join(directory, "videos", "output", "a", "timeline.json"), '{"cues":[1]}')

    const error = await rejection(assertUnchanged(directory, written))

    expect(error.message.startsWith(changedPrefix)).toBe(true)
    expect(error.message).toContain("changed: videos/output/a/timeline.json")
  })

  it("resolves when the changed file lies under a replaced directory", async () => {
    const { directory, inventory: written } = await writtenBaseline()
    await writeFile(path.join(directory, "videos", "output", "a", "timeline.json"), '{"cues":[1]}')

    await expect(assertUnchanged(directory, written, ["videos/output/a/"])).resolves.toBeUndefined()
  })

  it("resolves when the changed file equals a replaced file", async () => {
    const { directory, inventory: written } = await writtenBaseline()
    await writeFile(path.join(directory, "README.md"), "edited")

    await expect(assertUnchanged(directory, written, ["README.md"])).resolves.toBeUndefined()
  })

  it("rejects when a file outside the replaced paths is missing", async () => {
    const { directory, inventory: written } = await writtenBaseline()
    await rm(path.join(directory, "music", "track.mp3"))

    const error = await rejection(assertUnchanged(directory, written, ["videos/output/a/", "README.md"]))

    expect(error.message).toContain("missing: music/track.mp3")
  })
})

describe("writeInventory", () => {
  it("writes the README and the inventory, keeps itself consistent, and lists a new golden file", async () => {
    const directory = await temporaryDirectory()
    const first = await writeInventory(directory, inventory())

    expect(inventoryIssues(first, await hashTree(directory))).toEqual([])
    expect(Object.keys(first.files)).toEqual(["README.md"])
    await expect(stat(path.join(directory, "inventory.json.tmp"))).rejects.toMatchObject({ code: "ENOENT" })

    await mkdir(path.join(directory, "golden", "a"), { recursive: true })
    await writeFile(path.join(directory, "golden", "a", "frame.png"), "frame")
    const second = await writeInventory(directory, first)

    expect(inventoryIssues(second, await hashTree(directory))).toEqual([])
    expect(second.files["golden/a/frame.png"]).toEqual({ sha256: sha256("frame"), bytes: 5 })
    expect((await readBaseline(directory)).files).toEqual(second.files)
  })

  it("removes inventory.json.tmp when the rename fails", async () => {
    const directory = await temporaryDirectory()
    await mkdir(path.join(directory, "inventory.json"))

    await expect(writeInventory(directory, inventory())).rejects.toThrow()
    await expect(stat(path.join(directory, "inventory.json.tmp"))).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("leaves an ignored recovery directory out of the inventory", async () => {
    const directory = await temporaryDirectory()
    const first = await writeInventory(directory, inventory())
    await mkdir(path.join(directory, "golden", ".a.old"), { recursive: true })
    await writeFile(path.join(directory, "golden", ".a.old", "frame.png"), "old")

    const second = await writeInventory(directory, first, ["golden/.a.old"])

    expect(second.files).not.toHaveProperty("golden/.a.old/frame.png")
    await rm(path.join(directory, "golden", ".a.old"), { recursive: true })
    expect(inventoryIssues(second, await hashTree(directory))).toEqual([])
  })
})

describe("baselineReadme", () => {
  it("gives the backup location, the verify command and one line per video", () => {
    const readme = baselineReadme(
      inventory({
        backup: "/Volumes/backup/tutocast-baseline",
        videos: {
          "event-reports": { id: "EVENT_REPORTS", productCommit: "e8ed666a" },
          "event-questions": {
            id: "EVENT_QUESTIONS",
            productCommit: "89a884c8",
            golden: { acceptedAt: "2026-11-25T08:00:00.000Z", note: "first golden" },
          },
        },
      }),
    )

    expect(readme).toContain("/Volumes/backup/tutocast-baseline")
    expect(readme).toContain("npm run video:baseline -- verify")
    const videoLines = readme.split("\n").filter((line) => line.includes("`event-reports`") || line.includes("`event-questions`"))
    expect(videoLines).toHaveLength(2)
    expect(videoLines.filter((line) => line.includes("`event-reports`"))).toHaveLength(1)
    expect(videoLines.filter((line) => line.includes("`event-questions`"))).toHaveLength(1)
    expect(readme).toContain("first golden")
  })

  it("documents the restore, the copy back and the repair", () => {
    const readme = baselineReadme(inventory({ backup: "/Volumes/backup/tutocast-baseline" }))

    expect(readme).toContain("rsync -a --delete")
    expect(readme).toContain("<baseline>")
    expect(readme).toContain("/Volumes/backup/tutocast-baseline")
    expect(readme).toContain("README.md")
    expect(readme).toContain("inventory.json")
    expect(readme).toContain("music/")
    expect(readme).toContain("videos/")
    expect(readme).toContain("golden/")
    expect(readme).toContain("après chaque `add` et chaque `--accept`")
    expect(readme).toContain("## Réparer")
    expect(readme).toContain(".lock")

    const restoreAt = readme.indexOf("rsync -a --delete")
    const verifyAt = readme.indexOf('npm run video:baseline -- verify --dir "<baseline>"')
    expect(verifyAt).toBeGreaterThan(restoreAt)
  })

  it("says how to declare a second copy when none is known", () => {
    const readme = baselineReadme(inventory({ videos: { "event-reports": { id: "EVENT_REPORTS", productCommit: "e8ed666a" } } }))
    expect(readme).toContain("set-backup")
    expect(readme).toContain('--location "<second copy>"')
    expect(readme).not.toMatch(/--location <second copy>/)
    expect(readme).not.toContain("undefined")
  })

  it("prints the exact restore and copy-back commands, without a trailing slash on a source", () => {
    const backup = "/Volumes/backup/tutocast-baseline"
    const readme = baselineReadme(inventory({ backup }))
    const commands = readme.split("\n").filter((line) => line.startsWith("rsync -a --delete"))

    expect(commands).toEqual([
      `rsync -a --delete "${backup}/README.md" "${backup}/inventory.json" "${backup}/music" "${backup}/videos" "${backup}/golden" "<baseline>/"`,
      `rsync -a --delete "<baseline>/README.md" "<baseline>/inventory.json" "<baseline>/music" "<baseline>/videos" "<baseline>/golden" "${backup}/"`,
    ])

    for (const command of commands) {
      const arguments_ = (command.match(/"[^"]*"|\S+/g) ?? []).map((argument) => argument.slice(1, -1))
      const sources = arguments_.slice(3, 8)
      const destination = arguments_[8]
      expect(sources).toHaveLength(5)
      for (const source of sources) expect(source.endsWith("/"), source).toBe(false)
      expect(destination.endsWith("/"), destination).toBe(true)
    }
  })

  it("opens each transfer block with its direction comment", () => {
    const readme = baselineReadme(inventory({ backup: "/Volumes/backup/tutocast-baseline" }))

    const block = (heading: string, nextHeading: string): string[] => {
      const section = readme.slice(readme.indexOf(heading), readme.indexOf(nextHeading))
      const lines = section.split("\n")
      const start = lines.indexOf("```bash")
      return lines.slice(start + 1, lines.indexOf("```", start + 1))
    }

    const restore = block("### Restaurer", "### Garder la deuxième copie à jour")
    expect(restore[0]).toBe("# deuxième copie -> baseline (restauration)")
    expect(restore[1]).toMatch(/^rsync -a --delete /)

    const copyBack = block("### Garder la deuxième copie à jour", "### Réparer")
    expect(copyBack[0]).toBe("# baseline -> deuxième copie (après chaque add et chaque --accept)")
    expect(copyBack[1]).toMatch(/^rsync -a --delete /)
  })
})
