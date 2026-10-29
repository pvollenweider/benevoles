// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Unconstrained multilingual ASR of the entire final soundtrack, including chapter gaps. */
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { loadManifest, videoDir } from "../lib/manifest"

async function main() {
  const manifest = await loadManifest(process.argv[2])
  if (!["BETA_ACCESS", "SECTORS", "SHIFT_SWAPS", "SECTOR_LEADERS", "PRIVACY_PERSONAL_LINKS"].includes(manifest.id)) throw new Error("Only batch32 synthetic recordings accepted")
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY missing")
  const directory = videoDir(manifest.slug)
  const file = path.join(directory, `${manifest.slug}.mp4`)
  const hash = async () => createHash("sha256").update(await readFile(file)).digest("hex")
  const videoSha256 = await hash()
  const { stdout: bytes } = await promisify(execFile)("ffmpeg", ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", "24000", "-f", "wav", "pipe:1"], { encoding: "buffer", maxBuffer: 80 * 1024 * 1024 })
  const model = process.env.VIDEO_AUDIT_MODEL ?? "gemini-3.8-flash"
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", signal: AbortSignal.timeout(180_000), headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { transcription: { type: "STRING" } }, required: ["transcription"] } }, contents: [{ parts: [
      { text: "Transcris exactement TOUTES les paroles audibles de cette bande-son entière, quelle que soit leur langue, dans leur ordre, y compris pendant les pauses et les transitions. Conserve les mots anglais, les consignes techniques et les échantillons vocaux de la musique s'ils sont audibles. Ne résume pas, ne complète pas, ne corrige pas. Retourne uniquement le champ transcription. Aucun texte attendu n'est fourni." },
      { inlineData: { mimeType: "audio/wav", data: bytes.toString("base64") } },
    ] }] }),
  })
  if (!response.ok) throw new Error(`Full soundtrack ASR HTTP ${response.status}`)
  const body = await response.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }
  const parsed = JSON.parse(body.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text ?? "").join("") ?? "null") as { transcription?: string } | null
  if (!parsed?.transcription?.trim()) throw new Error("Empty full soundtrack ASR")
  if (await hash() !== videoSha256) throw new Error("Final MP4 changed during ASR")
  const tokens = parsed.transcription.match(/(?<![\p{L}\p{N}_])(?:tu|ton|ta|tes|toi|te)(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])t['’]/giu) ?? []
  const vtt = await readFile(path.join(directory, `${manifest.slug}.vtt`), "utf8")
  const subtitleTokens = vtt.match(/(?<![\p{L}\p{N}_])(?:tu|ton|ta|tes|toi|te)(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])t['’]/giu) ?? []
  await mkdir(path.join(directory, "review"), { recursive: true })
  await writeFile(path.join(directory, "review/full-final-asr.json"), JSON.stringify({ auditedAt: new Date().toISOString(), model, videoSha256, audioSha256: createHash("sha256").update(bytes).digest("hex"), recognized: parsed.transcription, registerTokens: tokens, subtitleRegisterTokens: subtitleTokens, note: "Unconstrained entire final soundtrack; register matches require context review, music vocals must be compared with narration-only audio" }, null, 2))
  console.log(`${manifest.id}: entire soundtrack ASR saved; ${tokens.length} register candidates, ${subtitleTokens.length} in VTT`)
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Full soundtrack audit failed"); process.exitCode = 1 })
