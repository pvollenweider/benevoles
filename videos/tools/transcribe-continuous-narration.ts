// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Diagnostic evidence only: never changes audio, cuts or validation status.
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { loadManifest, videoDir } from "../lib/manifest"

async function main() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY missing")
  const manifest = await loadManifest(process.argv[2])
  if (!manifest.continuousNarration) throw new Error("Continuous narration required")
  const dir = videoDir(manifest.slug)
  const chapter = process.argv[3]
  const finalClip = process.argv[4] === "--final-clip"
  if (process.argv.length > 5 || (process.argv[4] && !finalClip) || (chapter && !manifest.segments.some(segment => segment.id === chapter))) throw new Error("Only an exact known chapter and optional --final-clip are accepted")
  const file = chapter ? path.join(dir, finalClip ? "audiovisual-review" : "audio", `${chapter}.${finalClip ? "mp4" : "wav"}`) : path.join(dir, "audio", "continuous-narration.wav")
  const original = await readFile(file)
  const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex")
  let parentVideoSha256: string | undefined
  if (finalClip) {
    const review = JSON.parse(await readFile(path.join(dir, "audiovisual-review", `${chapter}.json`), "utf8"))
    parentVideoSha256 = digest(await readFile(path.join(dir, `${manifest.slug}.mp4`)))
    if (review.clipSha256 !== digest(original) || review.videoSha256 !== parentVideoSha256) throw new Error("Final chapter clip must match its actual current MP4 evidence")
  }
  const bytes = finalClip ? (await promisify(execFile)("ffmpeg", ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", "24000", "-f", "wav", "pipe:1"], { encoding: "buffer", maxBuffer: 40 * 1024 * 1024 })).stdout : original
  const model = process.env.VIDEO_AUDIT_MODEL ?? "gemini-3.8-flash"
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", signal: AbortSignal.timeout(180_000),
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ generationConfig: {
      temperature: 0, responseMimeType: "application/json",
      responseSchema: { type: "OBJECT", properties: { transcription: { type: "STRING" } }, required: ["transcription"] },
    }, contents: [{ parts: [
      { text: "Transcris exactement toutes les paroles audibles, une seule fois, dans leur ordre. Ne résume pas, ne complète pas et ne corrige pas les paroles. Conserve les répétitions réellement prononcées et les indications techniques audibles. Écris dates et heures comme prononcées en toutes lettres. Retourne un seul champ transcription. Aucun texte attendu n'est fourni." },
      { inlineData: { mimeType: "audio/wav", data: bytes.toString("base64") } },
    ] }] }),
  })
  if (!response.ok) throw new Error(`Continuous ASR HTTP ${response.status}`)
  const result = await response.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }
  const parsed = JSON.parse(result.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text ?? "").join("") ?? "null")
  if (!parsed || typeof parsed.transcription !== "string" || !parsed.transcription.trim()) throw new Error("Missing actual transcription")
  if (digest(await readFile(file)) !== digest(original)) throw new Error("Source changed during transcription")
  const diagnosticDir = chapter ? path.join(dir, "narration-diagnostics") : dir
  await mkdir(diagnosticDir, { recursive: true })
  await writeFile(path.join(diagnosticDir, chapter ? `${chapter}-${finalClip ? "final-mix" : "source"}.json` : "continuous-transcription.json"), JSON.stringify({
    auditedAt: new Date().toISOString(), model, masterSha256: chapter ? undefined : digest(bytes), sourceSha256: digest(original), analyzedAudioSha256: digest(bytes), parentVideoSha256,
    source: chapter ? (finalClip ? "Audio decoded from the verified final chapter clip; no images uploaded" : "Original generated chapter WAV") : "Original continuous master WAV",
    recognized: parsed.transcription, note: "Diagnostic unconstrained transcription, not timestamp or chapter validation; no cuts, edits or validation status changes",
  }, null, 2))
  console.log(`Diagnostic transcription saved for ${manifest.id}${chapter ? `/${chapter}/${finalClip ? "final-mix" : "source"}` : ""}; no cuts or validation changed`)
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Continuous transcription failed"); process.exitCode = 1 })
