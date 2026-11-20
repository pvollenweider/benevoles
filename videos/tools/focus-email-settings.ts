// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Real sender/reply-to rows, then real email body; never Mailpit's English date or toolbar. */
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { loadManifest, videoDir, type Timeline } from "../lib/manifest"
const exec = promisify(execFile)
export async function focusEmailSettings(id = "ORG_EMAIL_SETTINGS") {
  const m = await loadManifest(id), dir = videoDir(m.slug), file = path.join(dir, "timeline.json")
  const raw = await readFile(file), t = JSON.parse(raw.toString()) as Timeline
  assert(t.capturePurpose === "narration-timed" && m.viewport.width === 1280 && m.viewport.height === 800)
  const source = path.join(dir, t.video), sourceSha256 = createHash("sha256").update(await readFile(source)).digest("hex")
  const { stdout } = await exec("ffmpeg", ["-v", "error", "-i", source, "-vf", "fps=25,crop=2:2:100:10,format=rgb24", "-f", "rawvideo", "pipe:1"], { encoding: "buffer", maxBuffer: 2_000_000 })
  const runs: { startMs: number; endMs: number }[] = []; let start: number | null = null
  for (let i = 0; i <= stdout.length / 12; i++) {
    const [r, g, b] = stdout.subarray(i * 12, i * 12 + 3), mail = r >= 30 && r <= 65 && g >= 45 && g <= 90 && b >= 65 && b <= 110 && b > g + 8
    if (mail && start === null) start = i * 40
    if (!mail && start !== null) { runs.push({ startMs: start, endMs: i * 40 }); start = null }
  }
  const chapters = id === "EMAIL_DELIVERY_FAILURES" ? ["retry", "address"] : ["test"]
  assert.equal(runs.length, chapters.length, "Expected one actual delivered email per chapter")
  for (const [index, chapter] of chapters.entries()) {
    const cue = t.cues.find(c => c.id === chapter)!
    const run = runs[index]
    assert(run.startMs >= cue.startMs && run.startMs < cue.endMs && run.endMs - run.startMs >= 1000)
  }
  assert(!t.detailFrames?.some(f => f.startMs < runs[0].endMs && f.endMs > runs[0].startMs), "Email framing cannot cover a detail shot")
  assert(createHash("sha256").update(await readFile(source)).digest("hex") === sourceSha256)
  await mkdir(path.join(dir, "review"), { recursive: true })
  await writeFile(path.join(dir, "review/email-focus-proof.json"), JSON.stringify({ sourceSha256, sampledActualMailpitIntervals: runs, header: { x: 320, y: 60, width: 960, height: 110 }, body: { x: 320, y: 264, width: 960, height: 536 }, note: "Actual sender, recipient, reply-to and subject rows, then actual body pixels. Date, technical tabs and unrelated inbox excluded. No content rewritten; original raw capture retained." }, null, 2))
  if (!t.mailpitFocusFrames?.length) await writeFile(path.join(dir, "review/timeline-before-email-focus.json"), raw)
  await writeFile(file, JSON.stringify({ ...t, mailpitFocusFrames: runs }, null, 2) + "\n")
}
