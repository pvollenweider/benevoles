// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Audio-only countercheck of a generated take; never uploads screen captures. */
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { loadManifest, videoDir } from "../lib/manifest"

async function main() {
  const reference = process.argv[2], segmentId = process.argv[3]
  if (!reference || !segmentId) throw new Error("Usage: audit-voice.ts VIDEO_ID segment-id")
  const manifest = await loadManifest(reference)
  if (!manifest.continuousNarration || !manifest.segments.some(segment => segment.id === segmentId)) throw new Error("Known chapter from one continuous generated narration required")
  const directory = videoDir(manifest.slug)
  const metadata = JSON.parse(await readFile(path.join(directory, "audio-metadata.json"), "utf8"))
  if (metadata.model !== "gemini-3.8-flash-tts" || metadata.voice !== manifest.voice || metadata.segments.welcome.generationSha256 !== metadata.segments[segmentId].generationSha256) throw new Error("Narrations do not share the expected generated take and voice")
  const opening = await readFile(path.join(directory, "audio", "welcome.wav"))
  const chapter = await readFile(path.join(directory, "audio", `${segmentId}.wav`))
  const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
  if (!process.env.GEMINI_API_KEY) throw new Error("Gemini key missing")
  const model = process.env.VIDEO_AUDIT_MODEL ?? "gemini-3.8-flash"
  const prompt = "Écoute ces deux extraits de narration française. Le premier sert de référence ; analyse le second intégralement, sans images ni contexte visuel. Compare l'identité et le timbre de la voix, à la fois entre les deux et à l'intérieur du second extrait. Distingue un changement de locuteur d'une variation normale d'intonation, de hauteur, d'énergie ou de fin de phrase. N'invente pas de changement pour satisfaire la question. Indique les secondes et mots concernés dans le second extrait si un changement est réellement audible ; marque l'incertitude si tu ne peux pas trancher. Évalue aussi si la voix reste chaleureuse. Retourne uniquement du JSON : {consistent: boolean|null, warm: boolean|null, observation: string, changes: [{seconds: number, words: string, observation: string}], uncertainty: string}. Ce contrôle est une observation automatisée, pas une identification biométrique."
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { text: "Premier extrait de référence" }, { inlineData: { mimeType: "audio/wav", data: opening.toString("base64") } }, { text: "Second extrait à analyser" }, { inlineData: { mimeType: "audio/wav", data: chapter.toString("base64") } }] }] }),
  })
  if (!response.ok) throw new Error(`Voice audit HTTP ${response.status}`)
  const result = await response.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }
  const text = result.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text ?? "").join("").trim()
  if (!text) throw new Error("No voice observation returned")
  const review = JSON.parse(text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""))
  if (!Array.isArray(review.changes) || typeof review.observation !== "string" || ![true, false, null].includes(review.consistent) || ![true, false, null].includes(review.warm)) throw new Error("Incomplete voice observation")
  for (const change of review.changes) if (!Number.isFinite(change.seconds) || change.seconds < 0 || change.seconds > metadata.segments[segmentId].durationMs / 1000) throw new Error("Invalid voice observation timestamp")
  await mkdir(path.join(directory, "voice-review"), { recursive: true })
  await writeFile(path.join(directory, "voice-review", `${segmentId}.json`), JSON.stringify({ reviewedAt: new Date().toISOString(), model, source: "two generated WAV excerpts, audio only", openingSha256: sha(opening), chapterSha256: sha(chapter), generationSha256: metadata.segments[segmentId].generationSha256, review, note: "Automated listening observation; does not replace the original audiovisual report or prove human listening validation" }, null, 2))
  console.log(`${segmentId}: ${review.consistent === true ? "consistent voice observed" : "voice requires review"}; ${review.observation}`)
  if (review.consistent !== true || review.warm !== true) process.exitCode = 1
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Voice audit failed"); process.exitCode = 1 })
