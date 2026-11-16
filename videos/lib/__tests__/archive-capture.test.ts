import { describe, expect, it } from "vitest"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { archiveCapture } from "../archive-capture"
describe("archiveCapture protects previous production evidence", () => {
  it("moves the old raw/timeline without changing audio or fixture preparation", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "video-archive-test-"))
    try {
      for (const [name, text] of [["capture.webm", "first raw"], ["timeline.json", "first timeline"], ["audio-metadata.json", "voice"], ["dayof-preparation.json", "fresh fixture"]]) await writeFile(path.join(dir, name), text)
      const first = (await archiveCapture(dir))!
      expect(await readFile(path.join(first, "capture.webm"), "utf8")).toBe("first raw")
      expect(await readFile(path.join(first, "timeline.json"), "utf8")).toBe("first timeline")
      expect(await readFile(path.join(dir, "audio-metadata.json"), "utf8")).toBe("voice")
      expect(await readFile(path.join(dir, "dayof-preparation.json"), "utf8")).toBe("fresh fixture")
      await writeFile(path.join(dir, "capture.webm"), "second raw")
      const second = (await archiveCapture(dir))!
      expect(first).not.toBe(second)
      expect(await readFile(path.join(first, "capture.webm"), "utf8")).toBe("first raw")
      expect(await readFile(path.join(second, "capture.webm"), "utf8")).toBe("second raw")
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
  it("leaves an untouched directory alone when there is no previous raw capture", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "video-archive-test-"))
    try { expect(await archiveCapture(dir)).toBeNull(); expect(await readdir(dir)).toEqual([]) }
    finally { await rm(dir, { recursive: true, force: true }) }
  })
})
