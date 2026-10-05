// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Independent speech recognition catches a bad paragraph split even when duration checks pass.
// Only generated demonstration narration is sent; never load environment files into the prompt.
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadManifest, videoDir } from "../lib/manifest"

const reference = process.argv[2]
if (!reference) throw new Error("Usage: audit-narration.ts VIDEO_ID [segment-id]")
const model = process.env.VIDEO_AUDIT_MODEL ?? "gemini-3.8-flash"
// ASR may write « e-mail » where the reference uses « email »: same spoken word.
const words = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\be-mail\b/g, "email").match(/[a-z0-9]+/g) ?? []
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
  if (!key) throw new Error("GEMINI_API_KEY missing")
  const manifest = await loadManifest(reference)
  const dir = videoDir(manifest.slug)
  const report: { id: string; audioSha256: string; recognized: string; expected: string; wordErrorRate: number; needsReview: boolean }[] = []
  for (const segment of manifest.segments.filter(s => !process.argv[3] || s.id === process.argv[3])) {
    const bytes = await readFile(path.join(dir, "audio", `${segment.id}.wav`))
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({ contents: [{ parts: [
        { text: "Transcris exactement les paroles françaises audibles dans cet extrait. Ne complète pas les phrases coupées. Ne résume pas. Retourne uniquement le texte prononcé, sans introduction ni commentaire." },
        { inlineData: { mimeType: "audio/wav", data: bytes.toString("base64") } },
      ] }] }),
    })
    if (!response.ok) throw new Error(`Narration audit HTTP ${response.status}`)
    const body = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const recognized = body.candidates?.[0]?.content?.parts?.map(p => p.text ?? "").join("").trim()
    if (!recognized) throw new Error(`Empty transcription for ${segment.id}`)
    const expectedWords = words(segment.transcript)
    const wordErrorRate = distance(expectedWords, words(recognized)) / Math.max(1, expectedWords.length)
    report.push({ id: segment.id, audioSha256: createHash("sha256").update(bytes).digest("hex"), recognized, expected: segment.transcript, wordErrorRate, needsReview: wordErrorRate > 0.12 })
    console.log(`${segment.id}: ${(wordErrorRate * 100).toFixed(1)}% word difference${wordErrorRate > 0.12 ? " — REVIEW SPLIT" : ""}`)
  }
  if (!report.length) throw new Error("No matching segment")
  const suffix = process.argv[3] ? `-${process.argv[3]}` : ""
  await writeFile(path.join(dir, `narration-audit${suffix}.json`), JSON.stringify({ model, auditedAt: new Date().toISOString(), note: "ASR evidence, not a full audiovisual or voice-quality validation", segments: report }, null, 2))
  if (report.some(s => s.needsReview)) process.exitCode = 1
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Narration audit failed"); process.exitCode = 1 })
