// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Diagnostic evidence only: never changes audio, cuts or validation status.
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadManifest, videoDir } from "../lib/manifest"

async function main() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY missing")
  const manifest = await loadManifest(process.argv[2])
  if (!manifest.continuousNarration) throw new Error("Continuous narration required")
  const dir = videoDir(manifest.slug)
  const file = path.join(dir, "audio", "continuous-narration.wav")
  const bytes = await readFile(file)
  const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex")
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
  if (digest(await readFile(file)) !== digest(bytes)) throw new Error("Master changed during transcription")
  await writeFile(path.join(dir, "continuous-transcription.json"), JSON.stringify({
    auditedAt: new Date().toISOString(), model, masterSha256: digest(bytes),
    recognized: parsed.transcription, note: "Diagnostic full-take transcription, not timestamp or chapter validation",
  }, null, 2))
  console.log(`Full-take diagnostic transcription saved for ${manifest.id}; no cuts or validation changed`)
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Continuous transcription failed"); process.exitCode = 1 })
