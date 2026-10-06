// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Independent speech recognition catches a bad paragraph split even when duration checks pass.
// Only generated demonstration narration is sent; never load environment files into the prompt.
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { loadManifest, videoDir, type Timeline } from "../lib/manifest"
import { mismatchedNarrationEdges, unexpectedPauseInstructions, narrationWords } from "../lib/narration-fidelity"

const reference = process.argv[2]
if (!reference) throw new Error("Usage: audit-narration.ts VIDEO_ID [segment-id] [--force]")
const segmentId = process.argv.slice(3).find(arg => !arg.startsWith("--"))
const force = process.argv.includes("--force")
const fromVideo = process.argv.includes("--from-video")
const exec = promisify(execFile)
const model = process.env.VIDEO_AUDIT_MODEL ?? "gemini-3.8-flash"
// ASR may write « e-mail » where the reference uses « email »: same spoken word.
const words = narrationWords
function distance(a: string[], b: string[]) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + Number(a[i - 1] !== b[j - 1]))
    row = next
  }
  return row[b.length]
}
async function main() {
  const key = process.env.GEMINI_API_KEY
  const manifest = await loadManifest(reference)
  const dir = videoDir(manifest.slug)
  let videoSha256: string | undefined
  let timeline: Timeline | undefined
  if (fromVideo) {
    if (!manifest.continuousNarration) throw new Error("Video audio audit requires the generated continuous narration workflow")
    timeline = JSON.parse(await readFile(path.join(dir, "timeline.json"), "utf8")) as Timeline
    if (timeline.capturePurpose === "rehearsal") throw new Error("A rehearsal has no final narration to audit")
    videoSha256 = createHash("sha256").update(await readFile(path.join(dir, `${manifest.slug}.mp4`))).digest("hex")
    await mkdir(path.join(dir, "audio-video"), { recursive: true })
  }
  const report: { id: string; audioSha256: string; recognized: string; expected: string; wordErrorRate: number; needsReview: boolean; unexpectedInstructions?: string[]; edgeIssues?: string[] }[] = []
  const suffix = `${fromVideo ? "-video" : ""}${segmentId ? `-${segmentId}` : ""}`
  const reportFile = path.join(dir, `narration-audit${suffix}.json`)
  let previous: { model: string; promptVersion?: number; auditedAt: string; segments: typeof report } | undefined
  try { previous = JSON.parse(await readFile(reportFile, "utf8")) } catch { /* No prior evidence. */ }
  let newRecognitions = 0
  for (const segment of manifest.segments.filter(s => !segmentId || s.id === segmentId)) {
    const audioFile = path.join(dir, fromVideo ? "audio-video" : "audio", `${segment.id}.wav`)
    if (timeline) {
      const cue = timeline.cues.find(c => c.id === segment.id)
      if (!cue) throw new Error(`No actual video cue for ${segment.id}`)
      await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(cue.startMs / 1000), "-i", path.join(dir, `${manifest.slug}.mp4`), "-t", String((cue.endMs - cue.startMs) / 1000), "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", audioFile])
    }
    const bytes = await readFile(audioFile)
    const audioSha256 = createHash("sha256").update(bytes).digest("hex")
    const cached = previous?.model === model && previous.promptVersion === 2 ? previous.segments.find(s => s.id === segment.id) : undefined
    // A saved independent transcription is valid only for the exact audio bytes and text.
    // Recompute its score under today's normalization; never reuse a failed split.
    if (!force && cached?.audioSha256 === audioSha256 && cached.expected === segment.transcript && cached.recognized && !cached.needsReview) {
      const expectedWords = words(segment.transcript)
      const wordErrorRate = distance(expectedWords, words(cached.recognized)) / Math.max(1, expectedWords.length)
      if (wordErrorRate <= 0.12 && !unexpectedPauseInstructions(segment.transcript, cached.recognized).length && !mismatchedNarrationEdges(segment.transcript, cached.recognized).length) {
        report.push({ ...cached, wordErrorRate, needsReview: false })
        console.log(`${segment.id}: ${(wordErrorRate * 100).toFixed(1)}% word difference — existing independent evidence, identical audio/text`)
        continue
      }
    }
    if (!key) throw new Error(`GEMINI_API_KEY missing: no current independent evidence for ${segment.id}`)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({ contents: [{ parts: [
        { text: "Transcris exactement TOUTES les paroles audibles dans cet extrait, quelle que soit leur langue, une seule fois et dans leur ordre. N'omets surtout pas les mots anglais ou les indications techniques prononcées, par exemple short pause : ils doivent figurer dans la transcription s'ils sont audibles. Écris les dates, années et heures en toutes lettres telles qu’elles sont prononcées, plutôt qu’en chiffres : cela évite de confondre une différence de notation avec un mot omis. Retranscris une répétition uniquement si elle est réellement audible. Ne donne pas deux versions de la transcription. Ne complète pas les phrases coupées. Ne résume pas. Retourne uniquement le texte prononcé, sans introduction ni commentaire." },
        { inlineData: { mimeType: "audio/wav", data: bytes.toString("base64") } },
      ] }] }),
    })
    if (!response.ok) throw new Error(`Narration audit HTTP ${response.status}`)
    const body = await response.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }
    const recognized = body.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text ?? "").join("").trim()
    if (!recognized) throw new Error(`Empty transcription for ${segment.id}`)
    const expectedWords = words(segment.transcript)
    const wordErrorRate = distance(expectedWords, words(recognized)) / Math.max(1, expectedWords.length)
    newRecognitions++
    const unexpectedInstructions = unexpectedPauseInstructions(segment.transcript, recognized)
    const edgeIssues = mismatchedNarrationEdges(segment.transcript, recognized)
    const needsReview = wordErrorRate > 0.12 || unexpectedInstructions.length > 0 || edgeIssues.length > 0
    report.push({ id: segment.id, audioSha256, recognized, expected: segment.transcript, wordErrorRate, needsReview, unexpectedInstructions, edgeIssues })
    console.log(`${segment.id}: ${(wordErrorRate * 100).toFixed(1)}% word difference${needsReview ? " — REVIEW CONTENT/SPLIT" : ""}${unexpectedInstructions.length ? `; unexpected spoken instruction: ${unexpectedInstructions.join(", ")}` : ""}${edgeIssues.length ? `; ${edgeIssues.join(", ")}` : ""}`)
  }
  if (!report.length) throw new Error("No matching segment")
  if (videoSha256 && videoSha256 !== createHash("sha256").update(await readFile(path.join(dir, `${manifest.slug}.mp4`))).digest("hex")) throw new Error("Final MP4 changed during its audio audit")
  await writeFile(reportFile, JSON.stringify({ model, promptVersion: 2, auditedAt: newRecognitions ? new Date().toISOString() : previous!.auditedAt, revalidatedAt: new Date().toISOString(), source: fromVideo ? "actual final MP4 audio" : "generated narration WAV", videoSha256, note: "Independent multilingual ASR evidence, reused only for identical audio/text and audit instructions; not a full audiovisual or voice-quality validation", segments: report }, null, 2))
  if (report.some(s => s.needsReview)) process.exitCode = 1
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Narration audit failed"); process.exitCode = 1 })
