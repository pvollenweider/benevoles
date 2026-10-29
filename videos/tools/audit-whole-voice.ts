// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Audio-only observation of the complete continuous master, including its ending. */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadManifest, videoDir, type AudioMetadata } from "../lib/manifest"

async function main() {
  const manifest = await loadManifest(process.argv[2])
  assert(manifest.continuousNarration && manifest.continuousPauseTags === false)
  const directory = videoDir(manifest.slug)
  const metadata: AudioMetadata = JSON.parse(await readFile(path.join(directory, "audio-metadata.json"), "utf8"))
  assert(metadata.voice === manifest.voice && metadata.model === "gemini-3.8-flash-tts")
  const generations = new Set(manifest.segments.map(s => metadata.segments[s.id].generationSha256))
  assert(generations.size === 1 && [...generations][0], "One continuous generation required")
  assert(process.env.GEMINI_API_KEY, "Gemini key missing")
  const master = await readFile(path.join(directory, "audio/continuous-narration.wav"))
  const model = process.env.VIDEO_AUDIT_MODEL ?? "gemini-3.8-flash"
  const prompt = "Écoute uniquement cet enregistrement vocal entier sans musique ni images. Combien de personnes parlent réellement ? L'identité vocale reste-t-elle constante du début à la fin, y compris la conclusion ? Distingue les changements de locutrice des variations naturelles d'intonation, de sourire ou de rythme. Rends seulement JSON {speakers:number,consistentVoice:boolean,changes:[{seconds:number,observation:string}],evidence:string}. Les secondes partent du début du fichier. Aucun texte attendu n'est fourni."
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "audio/wav", data: master.toString("base64") } }] }], generationConfig: { responseMimeType: "application/json" } }),
  })
  assert(response.ok, `Whole voice review HTTP ${response.status}`)
  const body = await response.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }
  const result = JSON.parse(body.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text ?? "").join("") ?? "null")
  assert(result && Number.isInteger(result.speakers) && typeof result.consistentVoice === "boolean" && Array.isArray(result.changes) && typeof result.evidence === "string", "Incomplete voice review")
  await writeFile(path.join(directory, "whole-voice-review.json"), JSON.stringify({ model, reviewedAt: new Date().toISOString(), masterSha256: createHash("sha256").update(master).digest("hex"), prompt, result, note: "Automated whole-master audio observation; not film validation" }, null, 2))
  assert(result.speakers === 1 && result.consistentVoice && result.changes.length === 0, "Whole-master voice requires review")
  console.log(`${manifest.id}: one consistent voice observed throughout the complete master`)
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Whole voice review failed"); process.exitCode = 1 })
