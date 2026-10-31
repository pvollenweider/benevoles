// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Focus actual message panes without deleting unrelated mailbox messages or re-recording. */
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { createHash } from "node:crypto"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { loadManifest, videoDir, type Timeline } from "../lib/manifest"
const exec = promisify(execFile)
export async function focusMailpit(reference: string) {
  const manifest = await loadManifest(reference)
  assert(["VOLUNTEER_EVENT_AVAILABILITY", "ASSIGNMENT_PUBLICATION", "SHIFT_SWAPS", "SECTOR_LEADERS", "PRIVACY_PERSONAL_LINKS", "SHIFT_ROSTER_VISIBILITY", "MEMBERS_INVITATIONS", "MEMBERS_REMINDERS", "PLATFORM_INTERNAL_ADMINISTRATION"].includes(manifest.id))
  const dir = videoDir(manifest.slug), file = path.join(dir, "timeline.json")
  const original = await readFile(file)
  const timeline = JSON.parse(original.toString()) as Timeline
  const { stdout: target } = await exec("git", ["rev-parse", "origin/main"])
  assert(timeline.capturePurpose === "narration-timed" && timeline.product?.commit === target.trim())

  const source = path.join(dir, timeline.video), sourceSha256 = createHash("sha256").update(await readFile(source)).digest("hex")
  // Actual Mailpit toolbar colour at a fixed desktop pixel, sampled every output
  // frame. Public event headers are green; product navigation is white.
  const { stdout } = await exec("ffmpeg", ["-v", "error", "-i", source, "-vf", "fps=25,crop=2:2:100:10,format=rgb24", "-f", "rawvideo", "pipe:1"], { encoding: "buffer", maxBuffer: 2_000_000 })
  const frames: NonNullable<Timeline["mailpitFocusFrames"]> = []
  let start: number | null = null
  for (let index = 0; index <= stdout.length / 12; index++) {
    const [r, g, b] = stdout.subarray(index * 12, index * 12 + 3)
    const isMailpit = r >= 30 && r <= 65 && g >= 45 && g <= 90 && b >= 65 && b <= 110 && b > g + 8
    if (isMailpit && start === null) start = index * 40
    if (!isMailpit && start !== null) { frames.push({ startMs: start, endMs: index * 40 }); start = null }
  }
  assert(frames.length >= (["VOLUNTEER_EVENT_AVAILABILITY", "SHIFT_ROSTER_VISIBILITY", "SHIFT_SWAPS"].includes(manifest.id) ? 1 : 2) && frames.every(frame => frame.endMs - frame.startMs > 200), "Expected stable actual message-pane intervals")
  const holds: NonNullable<Timeline["mailpitHolds"]> = []
  if (manifest.id === "MEMBERS_REMINDERS") {
    const send = timeline.cues.find(cue => cue.id === "send")!
    const mail = frames.find(frame => frame.startMs >= send.startMs && frame.endMs <= send.endMs)
    const next = timeline.anchors?.find(anchor => anchor.segmentId === "send" && anchor.phrase === "Un email remis au serveur")
    assert(mail && next, "Actual delivered-message interval and history sentence anchor required")
    if (mail.endMs - mail.startMs < 1500 && next.cueMs > mail.endMs) {
      assert(next.cueMs - mail.endMs < 6000)
      assert(!timeline.inputEvents?.some(event => event.atMs >= mail.endMs - 40 && event.atMs < next.cueMs), "Never cover a real click or key with a still frame")
      holds.push({ sourceMs: mail.endMs - 40, startMs: mail.endMs - 40, endMs: Math.round(send.startMs + (send.endMs - send.startMs) * 0.38) })
    }
  }
  await mkdir(path.join(dir, "review"), { recursive: true })
  if (!timeline.mailpitFocusFrames?.length) await writeFile(path.join(dir, "review/timeline-before-mailpit-focus.json"), original)
  await writeFile(file, JSON.stringify({ ...timeline, mailpitFocusFrames: frames, mailpitHolds: holds, ...(["VOLUNTEER_EVENT_AVAILABILITY", "ASSIGNMENT_PUBLICATION", "SHIFT_SWAPS", "SECTOR_LEADERS", "PRIVACY_PERSONAL_LINKS", "PLATFORM_INTERNAL_ADMINISTRATION", "SHIFT_ROSTER_VISIBILITY"].includes(manifest.id) ? { mailpitBodyOnly: true } : {}) }, null, 2) + "\n")
  await writeFile(path.join(dir, "review/mailpit-focus-proof.json"), JSON.stringify({ sourceSha256, frames, holds, sampling: "Actual toolbar RGB every frame at 25 fps", crop: ["VOLUNTEER_EVENT_AVAILABILITY", "ASSIGNMENT_PUBLICATION", "SHIFT_SWAPS", "SECTOR_LEADERS", "PRIVACY_PERSONAL_LINKS", "PLATFORM_INTERNAL_ADMINISTRATION", "SHIFT_ROSTER_VISIBILITY"].includes(manifest.id) ? (["VOLUNTEER_EVENT_AVAILABILITY", "ASSIGNMENT_PUBLICATION", "SHIFT_SWAPS", "SECTOR_LEADERS", "PRIVACY_PERSONAL_LINKS", "SHIFT_ROSTER_VISIBILITY"].includes(manifest.id) ? (["VOLUNTEER_EVENT_AVAILABILITY", "ASSIGNMENT_PUBLICATION"].includes(manifest.id) ? { x: 320, y: 312, width: 960, height: 488 } : { x: 320, y: 264, width: 960, height: 536 }) : { x: 320, y: 224, width: 960, height: 576 }) : { x: 320, y: 0, width: 960, height: 800 }, note: ["VOLUNTEER_EVENT_AVAILABILITY", "ASSIGNMENT_PUBLICATION", "SHIFT_SWAPS", "SECTOR_LEADERS", "PRIVACY_PERSONAL_LINKS", "PLATFORM_INTERNAL_ADMINISTRATION", "SHIFT_ROSTER_VISIBILITY"].includes(manifest.id) ? "Actual message body cropped below Mailpit headers: its fixed English date and unrelated inbox excluded. No email text or product state changed; raw capture retained. No still holds." : "Only unrelated inbox sidebar excluded. Real email headers/body and raw capture retained. No mailbox message deleted. A short delivered-email shot may hold its last actual frame until the history point in the same spoken sentence, only when no click/key is covered." }, null, 2))
  console.log(`${manifest.id}: ${frames.length} real Mailpit intervals focused`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) focusMailpit(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1 })
