// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Use a short audio window: whole-take model timestamps can be unreliable.
import { execFile } from "node:child_process"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { loadManifest, videoDir, type AudioMetadata } from "../lib/manifest"
const exec = promisify(execFile)
async function main() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY missing")
  const manifest = await loadManifest(process.argv[2])
  const id = process.argv[3]
  const index = manifest.segments.findIndex(s => s.id === id)
  if (index < 1) throw new Error("Specify a non-first segment")
  const dir = videoDir(manifest.slug)
  const metadata = JSON.parse(await readFile(path.join(dir, "audio-metadata.json"), "utf8")) as AudioMetadata
  const estimated = manifest.segments.slice(0, index).reduce((sum, s) => sum + metadata.segments[s.id].durationMs / 1000, 0)
  const windowSeconds = process.argv.includes("--wide") ? 60 : 30
  const start = Math.max(0, estimated - windowSeconds / 2)
  const temp = await mkdtemp(path.join(tmpdir(), "benevol-narration-window-"))
  const clip = path.join(temp, "window.wav")
  const master = path.join(dir, "audio", "continuous-narration.wav")
  await exec("ffmpeg", ["-loglevel", "error", "-y", "-ss", String(start), "-i", master, "-t", String(windowSeconds), "-c:a", "pcm_s16le", clip])
  const bytes = await readFile(clip)
  const anchor = manifest.segments[index].transcript.split(" ").slice(0, 11).join(" ")
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.VIDEO_AUDIT_MODEL ?? "gemini-3.8-flash"}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ contents: [{ parts: [
      { text: `Listen to this short French audio clip. Locate the ACTUAL first word of this phrase: ${JSON.stringify(anchor)}. Return ONLY JSON {"found":true,"startSeconds":0.0,"wordsHeard":"..."}. Seconds are relative to THIS CLIP (0 to ${windowSeconds}). If absent, return found:false. Do not estimate from text length.` },
      { inlineData: { mimeType: "audio/wav", data: bytes.toString("base64") } },
    ] }], generationConfig: { responseMimeType: "application/json" } }),
  })
  if (!response.ok) throw new Error(`Boundary location HTTP ${response.status}`)
  const body = await response.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }
  const result = JSON.parse(body.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text ?? "").join("") ?? "null") as { found: boolean; startSeconds: number; wordsHeard: string }
  if (!result?.found || result.startSeconds < 0 || result.startSeconds > windowSeconds) throw new Error("Anchor not reliably located in window")
  const onset = start + result.startSeconds
  const { stderr } = await exec("ffmpeg", ["-i", master, "-af", "silencedetect=noise=-35dB:d=0.15", "-f", "null", "-"], { maxBuffer: 10 * 1024 * 1024 })
  const pauses: { start: number; end: number }[] = []
  let silence = 0
  for (const line of stderr.split("\n")) {
    const a = line.match(/silence_start: ([0-9.]+)/); if (a) silence = Number(a[1])
    const b = line.match(/silence_end: ([0-9.]+)/); if (b) pauses.push({ start: silence, end: Number(b[1]) })
  }
  const closest = pauses.filter(p => Math.abs(p.end - onset) < 1.5).sort((a, b) => Math.abs(a.end - onset) - Math.abs(b.end - onset))[0]
  if (!closest) throw new Error("No real silence near located onset")
  const proposedCut = (closest.start + closest.end) / 2
  await writeFile(path.join(dir, `boundary-${id}.json`), JSON.stringify({ anchor, windowStart: start, result, onset, proposedCut, note: "Proposal only; recut then independently audit before capture" }, null, 2))
  console.log(`${id}=${proposedCut.toFixed(6)} — proposal, independent audit required`)
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Boundary location failed"); process.exitCode = 1 })
