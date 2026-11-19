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
  assert(["TARGETED_MESSAGES", "VOLUNTEER_ORG_REGISTRATIONS", "VOLUNTEER_CONFIRMATION_ERRORS", "REMINDERS_CHANGES", "LAST_MINUTE_CHANGES", "FRONT_DESK_ACCESS", "VOLUNTEER_EVENT_AVAILABILITY", "ASSIGNMENT_PUBLICATION", "SHIFT_SWAPS", "SECTOR_LEADERS", "PRIVACY_PERSONAL_LINKS", "SHIFT_ROSTER_VISIBILITY", "MEMBERS_INVITATIONS", "MEMBERS_REMINDERS", "PLATFORM_INTERNAL_ADMINISTRATION"].includes(manifest.id))
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
  assert(frames.length >= (["TARGETED_MESSAGES", "FRONT_DESK_ACCESS", "VOLUNTEER_EVENT_AVAILABILITY", "SHIFT_ROSTER_VISIBILITY", "SHIFT_SWAPS"].includes(manifest.id) ? 1 : 2) && frames.every(frame => frame.endMs - frame.startMs > 200), "Expected stable actual message-pane intervals")
  const holds: NonNullable<Timeline["mailpitHolds"]> = []
  if (manifest.id === "MEMBERS_REMINDERS") {
    const send = timeline.cues.find(cue => cue.id === "send")!
    const mail = frames.find(frame => frame.startMs >= send.startMs && frame.endMs <= send.endMs)
    assert(mail && mail.endMs - mail.startMs >= 5000, "Keep the real targeted reminder visible for at least five seconds")
  }
  await mkdir(path.join(dir, "review"), { recursive: true })
  if (!timeline.mailpitFocusFrames?.length) await writeFile(path.join(dir, "review/timeline-before-mailpit-focus.json"), original)
  const belowHeaders = [
    "TARGETED_MESSAGES", "VOLUNTEER_ORG_REGISTRATIONS", "VOLUNTEER_CONFIRMATION_ERRORS",
    "REMINDERS_CHANGES", "LAST_MINUTE_CHANGES", "SHIFT_SWAPS", "SECTOR_LEADERS",
    "PRIVACY_PERSONAL_LINKS", "MEMBERS_REMINDERS", "SHIFT_ROSTER_VISIBILITY",
  ]
  const tallHeaders = ["FRONT_DESK_ACCESS", "VOLUNTEER_EVENT_AVAILABILITY", "ASSIGNMENT_PUBLICATION"]
  let top = 0
  if (belowHeaders.includes(manifest.id)) top = 264
  if (tallHeaders.includes(manifest.id)) top = 312
  if (manifest.id === "PLATFORM_INTERNAL_ADMINISTRATION") top = 224
  await writeFile(file, JSON.stringify({
    ...timeline,
    mailpitFocusFrames: frames,
    mailpitHolds: holds,
    ...(top ? { mailpitBodyOnly: true } : {}),
  }, null, 2) + "\n")
  await writeFile(path.join(dir, "review/mailpit-focus-proof.json"), JSON.stringify({
    sourceSha256,
    frames,
    holds,
    sampling: "Actual toolbar RGB every frame at 25 fps",
    crop: { x: 320, y: top, width: 960, height: 800 - top },
    note: top
      ? "Actual message body cropped below Mailpit headers: its fixed English date and unrelated inbox excluded. No email text or product state changed; raw capture retained. No still holds."
      : "Only unrelated inbox sidebar excluded. Real email headers/body and raw capture retained. No mailbox message deleted.",
  }, null, 2))
  console.log(`${manifest.id}: ${frames.length} real Mailpit intervals focused`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) focusMailpit(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1 })
