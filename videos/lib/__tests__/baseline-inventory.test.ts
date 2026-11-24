// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  baselineReadme,
  hashTree,
  inventoryIssues,
  readBaseline,
  videoInputFiles,
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

describe("writeInventory", () => {
  it("writes the README and the inventory, keeps itself consistent, and lists a new golden file", async () => {
    const directory = await temporaryDirectory()
    const first = await writeInventory(directory, inventory())

    expect(inventoryIssues(first, await hashTree(directory))).toEqual([])
    expect(Object.keys(first.files)).toEqual(["README.md"])

    await mkdir(path.join(directory, "golden", "a"), { recursive: true })
    await writeFile(path.join(directory, "golden", "a", "frame.png"), "frame")
    const second = await writeInventory(directory, first)

    expect(inventoryIssues(second, await hashTree(directory))).toEqual([])
    expect(second.files["golden/a/frame.png"]).toEqual({ sha256: sha256("frame"), bytes: 5 })
    expect((await readBaseline(directory)).files).toEqual(second.files)
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

  it("says how to declare a second copy when none is known", () => {
    const readme = baselineReadme(inventory({ videos: { "event-reports": { id: "EVENT_REPORTS", productCommit: "e8ed666a" } } }))
    expect(readme).toContain("set-backup")
    expect(readme).not.toContain("undefined")
  })
})
