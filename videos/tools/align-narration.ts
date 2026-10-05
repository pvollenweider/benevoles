// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Locate paragraph transitions in the audible take, then cut only inside a real silence.
// Always follow with audit-narration.ts: timestamps from a model are not proof by themselves.
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { loadManifest, videoDir, type AudioMetadata } from "../lib/manifest"

const exec = promisify(execFile)
const reference = process.argv[2]
if (!reference) throw new Error("Usage: align-narration.ts VIDEO_ID")
async function main() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY missing")
  const manifest = await loadManifest(reference)
  const dir = videoDir(manifest.slug)
  const master = path.join(dir, "audio", "continuous-narration.wav")
  const bytes = await readFile(master)
  if (bytes.length > 13_000_000) throw new Error("Take too large for inline alignment")
  const model = process.env.VIDEO_AUDIT_MODEL ?? "gemini-3.8-flash"
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ contents: [{ parts: [
      { text: `Listen to the actual French audio. Locate the audible beginning of EACH paragraph below. Return ONLY JSON {"segments":[{"id":"...","startSeconds":0.0,"firstWordsHeard":"..."}]}. Timestamps are seconds from the beginning of this file, not MM:SS. Report actual speech onsets, with subsecond precision if possible. Do not estimate from text length. Missing spoken paragraphs must have startSeconds:null. Paragraphs: ${JSON.stringify(manifest.segments.map(s => ({ id: s.id, text: s.transcript })))}` },
      { inlineData: { mimeType: "audio/wav", data: bytes.toString("base64") } },
    ] }], generationConfig: { responseMimeType: "application/json" } }),
  })
  if (!response.ok) throw new Error(`Alignment HTTP ${response.status}`)
  const body = await response.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }
  const text = body.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text ?? "").join("")
  if (!text) throw new Error("No alignment returned")
  const alignment = JSON.parse(text) as { segments: { id: string; startSeconds: number | null; firstWordsHeard: string }[] }
  await writeFile(path.join(dir, "narration-alignment.json"), JSON.stringify({ model, masterSha256: createHash("sha256").update(bytes).digest("hex"), ...alignment }, null, 2))
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", master])
  const duration = Number(stdout.trim())
  if (alignment.segments.some(s => s.startSeconds === null || s.startSeconds < 0 || s.startSeconds >= duration)) {
    throw new Error("Unreliable alignment: a speech onset is outside the actual take. No audio changed.")
  }
  const { stderr } = await exec("ffmpeg", ["-i", master, "-af", "silencedetect=noise=-35dB:d=0.15", "-f", "null", "-"], { maxBuffer: 10 * 1024 * 1024 })
  const pauses: { start: number; end: number }[] = []
  let silenceStart = 0
  for (const line of stderr.split("\n")) {
    const start = line.match(/silence_start: ([0-9.]+)/)
    if (start) silenceStart = Number(start[1])
    const end = line.match(/silence_end: ([0-9.]+)/)
    if (end) pauses.push({ start: silenceStart, end: Number(end[1]) })
  }
  const cuts = [0]
  for (const segment of manifest.segments.slice(1)) {
    const point = alignment.segments.find(s => s.id === segment.id)
    if (!point || point.startSeconds === null || !Number.isFinite(point.startSeconds)) throw new Error(`Missing audible onset: ${segment.id}`)
    const nearby = pauses.filter(p => p.end > cuts.at(-1)! + 1 && Math.abs(p.end - point.startSeconds!) <= 1.5)
      .sort((a, b) => Math.abs(a.end - point.startSeconds!) - Math.abs(b.end - point.startSeconds!))
    if (!nearby.length) throw new Error(`No safe silence near ${segment.id} at ${point.startSeconds}s`)
    const cut = (nearby[0].start + nearby[0].end) / 2
    cuts.push(cut)
    console.log(`${segment.id}: cut at ${cut.toFixed(3)}s (speech ${point.startSeconds}s)`)
  }
  cuts.push(duration)
  const metadataPath = path.join(dir, "audio-metadata.json")
  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as AudioMetadata
  for (const [index, segment] of manifest.segments.entries()) {
    const file = path.join(dir, metadata.segments[segment.id].file)
    await exec("ffmpeg", ["-loglevel", "error", "-y", "-i", master, "-ss", String(cuts[index]), "-to", String(cuts[index + 1]), "-c:a", "pcm_s16le", file])
    metadata.segments[segment.id].durationMs = Math.round((cuts[index + 1] - cuts[index]) * 1000)
  }
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2))
  console.log("Aligned take saved; independent transcription audit still required")
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Alignment failed"); process.exitCode = 1 })
