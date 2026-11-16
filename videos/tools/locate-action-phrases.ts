// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Diagnostic before a narrated take: actual phrase onsets, never automatic timing edits. */
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadManifest, videoDir, type AudioMetadata, type Timeline } from "../lib/manifest"
import { sentenceTimingsFromAudio } from "../lib/sentence-audio"
import { normalizeText, sentenceFor } from "../lib/sentence-timing"

type Located = { phrase: string; found: boolean; startSeconds: number; wordsHeard: string }
async function main() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY missing")
  const manifest = await loadManifest(process.argv[2])
  const dir = videoDir(manifest.slug)
  const timeline = JSON.parse(await readFile(path.join(dir, "timeline.json"), "utf8")) as Timeline
  if (timeline.capturePurpose !== "rehearsal") throw new Error("Use the preserved quick rehearsal before any narrated take")
  const audio = JSON.parse(await readFile(path.join(dir, "audio-metadata.json"), "utf8")) as AudioMetadata
  const audit = JSON.parse(await readFile(path.join(dir, "narration-audit.json"), "utf8")) as { segments: { id: string; audioSha256: string; needsReview: boolean; expected: string }[] }
  const results: unknown[] = []
  const segments = manifest.segments.filter(segment => timeline.anchors?.some(a => a.segmentId === segment.id))
  for (let offset = 0; offset < segments.length; offset += 3) {
    const batch = await Promise.all(segments.slice(offset, offset + 3).map(async segment => {
      const generated = audio.segments[segment.id]
      const file = path.join(dir, generated.file), bytes = await readFile(file)
      const audioSha256 = createHash("sha256").update(bytes).digest("hex")
      const checked = audit.segments.find(item => item.id === segment.id)
      if (!checked || checked.needsReview || checked.audioSha256 !== audioSha256 || checked.expected !== segment.transcript) throw new Error(`${segment.id}: current source ASR required`)
      const phrases = [...new Set(timeline.anchors!.filter(a => a.segmentId === segment.id).map(a => a.phrase))]
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.VIDEO_AUDIT_MODEL ?? "gemini-3.8-flash"}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({ contents: [{ parts: [
          { text: `Listen to this single French narration chapter. Locate the ACTUAL first spoken word of EACH requested phrase. Do not use text-length estimates or the start of its larger sentence. Seconds start at the beginning of THIS AUDIO, duration ${generated.durationMs / 1000} s. If a phrase is absent set found:false. Return ONLY JSON {"phrases":[{"phrase":"exact requested phrase","found":true,"startSeconds":0.0,"wordsHeard":"actual words"}]}. Requested phrases: ${JSON.stringify(phrases)}` },
          { inlineData: { mimeType: "audio/wav", data: bytes.toString("base64") } },
        ] }], generationConfig: { responseMimeType: "application/json" } }),
      })
      if (!response.ok) throw new Error(`${segment.id}: phrase location HTTP ${response.status}`)
      const body = await response.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }
      const parsed = JSON.parse(body.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text ?? "").join("") ?? "null") as { phrases: Located[] }
      if (!parsed || !Array.isArray(parsed.phrases) || parsed.phrases.length !== phrases.length) throw new Error(`${segment.id}: incomplete phrase result`)
      const sentences = await sentenceTimingsFromAudio(file, segment.transcript, generated.durationMs)
      const located = phrases.map(phrase => {
        const matches = parsed.phrases.filter(item => item.phrase === phrase)
        if (matches.length !== 1) throw new Error(`${segment.id}: ambiguous phrase result`)
        const item = matches[0]
        if (typeof item.found !== "boolean" || typeof item.wordsHeard !== "string" || item.found && (!Number.isFinite(item.startSeconds) || item.startSeconds < 0 || item.startSeconds * 1000 >= generated.durationMs || !normalizeText(item.wordsHeard))) throw new Error(`${segment.id}: invalid phrase timestamp`)
        const estimatedSentenceStartMs = sentenceFor(sentences, phrase).startMs
        const deltaMs = item.found ? Math.round(item.startSeconds * 1000) - estimatedSentenceStartMs : null
        return { ...item, estimatedSentenceStartMs, deltaMs, review: !item.found || Math.abs(deltaMs!) > 1250 }
      })
      console.log(`${segment.id}: ${located.filter(item => item.review).length}/${located.length} onsets need source timing review`)
      return { segmentId: segment.id, audioSha256, durationMs: generated.durationMs, phrases: located }
    }))
    results.push(...batch)
  }
  await writeFile(path.join(dir, "action-phrase-onsets.json"), JSON.stringify({ checkedAt: new Date().toISOString(), model: process.env.VIDEO_AUDIT_MODEL ?? "gemini-3.8-flash", scope: "Independent diagnostic of source audio only; no timing applied, no additional narrated take, no final audiovisual readiness claim. Repeated clause anchors may intentionally share a sentence start; review actual planned actions before changing source.", results }, null, 2) + "\n")
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Phrase location failed"); process.exitCode = 1 })
