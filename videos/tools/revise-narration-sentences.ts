// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Reuse verified continuous base audio; generate only changed sentences in the same voice.
 * Usage: revise-narration-sentences.ts VIDEO_ID PREVIOUS_ARTIFACT_DIRECTORY
 * The previous directory must contain source-manifest.json, audio-metadata.json and audio-original/.
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdir, readFile, writeFile, copyFile, readdir } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { loadManifest, videoDir, type AudioMetadata, type VideoManifest } from "../lib/manifest"
import { assertNarrationGeneration, sentenceGenerationSha256, revisedGenerationSha256, revisionSentences, type SentenceRevision } from "../lib/narration-generation"
import { sentenceTimingsFromAudio } from "../lib/sentence-audio"
const exec = promisify(execFile)
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
const json = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8"))
async function duration(file: string) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file])
  return Number(stdout.trim()) * 1000
}
function audioData(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return
  const obj = value as Record<string, unknown>
  if (obj.type === "audio" && typeof obj.data === "string") return obj.data
  for (const child of Object.values(obj)) {
    if (Array.isArray(child)) { for (const item of child) { const found = audioData(item); if (found) return found } }
    else if (child && typeof child === "object") { const found = audioData(child); if (found) return found }
  }
}
async function main() {
  const [id, previous] = process.argv.slice(2)
  assert(id && previous, "Video ID and explicit previous artifact directory required")
  const manifest = await loadManifest(id), dir = videoDir(manifest.slug)
  const base = path.resolve(previous)
  assert(path.dirname(base) === dir && path.basename(base).startsWith("previous-"), "Only this video's archived base accepted")
  const original = await json<VideoManifest>(path.join(base, "source-manifest.json"))
  const prior = await json<AudioMetadata>(path.join(base, "audio-metadata.json"))
  assert(!prior.sentenceRevision, "Use the original continuous base, not an already patched narration")
  assert.equal(original.id, manifest.id); assert.equal(manifest.continuousPauseTags, false)
  assert.equal(original.voice, manifest.voice); assert.equal(original.voiceStyle, manifest.voiceStyle)
  const baseGenerationSha256 = assertNarrationGeneration(original, prior)
  const audit = await json<{ segments: { id: string; expected: string; audioSha256: string; needsReview: boolean }[] }>(path.join(base, "narration-audit.json"))
  const revision: SentenceRevision = { version: 1, unit: "sentence", baseline: original, baseGenerationSha256, chapters: {} }
  const metadata: AudioMetadata = { model: prior.model, voice: prior.voice, generatedAt: new Date().toISOString(), sentenceRevision: revision, segments: {} }
  const evidence: unknown[] = []
  await mkdir(path.join(dir, "sentence-revisions"), { recursive: true })
  let overrides: Record<string, { sourceAudioSha256: string; boundariesMs: number[] }> = {}
  try { overrides = await json(path.join(dir, "sentence-boundaries.json")) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  for (const [si, segment] of manifest.segments.entries()) {
    assert.equal(original.segments[si].id, segment.id)
    const before = revisionSentences(original.segments[si].transcript, revision.unit), after = revisionSentences(segment.transcript, revision.unit)
    assert.equal(before.length, after.length, "Sentence boundaries must be retained")
    const source = path.join(base, "audio-original", `${segment.id}.wav`)
    const sourceAudioSha256 = sha(await readFile(source))
    const checked = audit.segments.find(s => s.id === segment.id)
    assert(checked && !checked.needsReview && checked.expected === original.segments[si].transcript && checked.audioSha256 === sourceAudioSha256, "Verified original audio required")
    const chapter: SentenceRevision["chapters"][string] = revision.chapters[segment.id] = { sourceAudioSha256, sentences: [] }
    const target = path.join(dir, "audio", `${segment.id}.wav`)
    if (before.every((text, i) => text === after[i])) {
      await copyFile(source, target)
      metadata.segments[segment.id] = { file: `audio/${segment.id}.wav`, durationMs: Math.round(await duration(target)), generationSha256: "" }
      console.log(`↷ ${segment.id}: unchanged original WAV`)
      continue
    }
    // A colon/semicolon belongs to the same edited sentence. Keeping such a short
    // clause separately can mistake a word pause for its boundary and clip it.
    const timings = await sentenceTimingsFromAudio(source, original.segments[si].transcript.replace(/[;:]/g, ","), prior.segments[segment.id].durationMs)
    let boundaries = [0, ...timings.slice(1).map((sentence, i) => (timings[i].endMs + sentence.startMs) / 2), await duration(source)]
    if (overrides[segment.id]) {
      assert.equal(overrides[segment.id].sourceAudioSha256, sourceAudioSha256, "Boundary proposals must refer to this original WAV")
      boundaries = overrides[segment.id].boundariesMs
      assert(boundaries.length === before.length + 1 && boundaries[0] === 0 && boundaries.every((b, i) => Number.isFinite(b) && (i === 0 || b > boundaries[i - 1])))
      assert(Math.abs(boundaries.at(-1)! - await duration(source)) < 2, "Last boundary must be original WAV duration")
    }
    chapter.boundariesMs = boundaries
    const work = path.join(dir, "sentence-revisions", segment.id); await mkdir(work, { recursive: true })
    const pieces: string[] = []
    for (let index = 0; index < before.length; index++) {
      const piece = path.join(work, `${index}.wav`), start = boundaries[index], end = boundaries[index + 1]
      if (before[index] === after[index]) {
        await exec("ffmpeg", ["-y", "-v", "error", "-i", source, "-af", `atrim=start=${start / 1000}:end=${end / 1000},asetpts=PTS-STARTPTS`, "-c:a", "pcm_s16le", piece])
      } else {
        const generationSha256 = sentenceGenerationSha256(after[index], manifest.voiceStyle, prior.model, manifest.voice)
        const cachedName = (await readdir(work)).find(name => name.endsWith(`-${generationSha256}.wav`))
        const generated = path.join(work, cachedName ?? `${index}-${generationSha256}.wav`)
        let bytes: Buffer
        try { bytes = await readFile(generated) } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
          assert(process.env.GEMINI_API_KEY, "GEMINI_API_KEY required")
          let encoded: string | undefined
          for (let attempt = 0; attempt < 4; attempt++) {
          const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
            method: "POST", signal: AbortSignal.timeout(180_000),
            headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
            body: JSON.stringify({ model: prior.model, input: [{ type: "user_input", content: [{ type: "text", text: after[index], annotations: [{ type: "speech_metadata", style: manifest.voiceStyle }] }] }], response_format: { type: "audio" }, generation_config: { speech_config: [{ voice: manifest.voice }] } }),
          })
          const body = await response.json()
          if (response.status === 429 && attempt < 3) {
            console.log("TTS rate limit; retrying the same changed sentence in 20 seconds")
            await new Promise(resolve => setTimeout(resolve, 20_000))
            continue
          }
          if (!response.ok) throw new Error(`Sentence TTS HTTP ${response.status}: ${JSON.stringify(body).slice(0, 400)}`)
          encoded = audioData(body); break
          }
          assert(encoded, "TTS returned no audio")
          bytes = Buffer.from(encoded, "base64"); await writeFile(generated, bytes)
        }
        const actualMs = await duration(generated), targetMs = end - start
        // Modest tempo correction preserves the previous scene timings without truncating speech.
        const tempo = Math.max(0.8, Math.min(1.25, actualMs / targetMs))
        await exec("ffmpeg", ["-y", "-v", "error", "-i", generated, "-af", `atempo=${tempo}`, "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", piece])
        chapter.sentences.push({ index, transcript: after[index], generationSha256, audioSha256: sha(bytes) })
        evidence.push({ chapter: segment.id, index, before: before[index], after: after[index], originalStartMs: start, originalEndMs: end, generatedFile: path.relative(dir, generated), generatedMs: actualMs, tempo, replacementMs: await duration(piece), originalBoundaryMethod: timings[index].method })
        console.log(`✓ ${segment.id}/${index}: ${after[index]}`)
      }
      pieces.push(piece)
    }
    const list = path.join(work, "concat.txt")
    await writeFile(list, pieces.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"))
    await exec("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-c:a", "pcm_s16le", target])
    metadata.segments[segment.id] = { file: `audio/${segment.id}.wav`, durationMs: Math.round(await duration(target)), generationSha256: "" }
  }
  const fingerprint = revisedGenerationSha256(manifest, prior.model, revision)
  for (const chapter of Object.values(metadata.segments)) chapter.generationSha256 = fingerprint
  assertNarrationGeneration(manifest, metadata)
  // Keep the working master truthful too: it is the assembled revision, not the
  // obsolete original master and not evidence of one newly generated TTS take.
  const masterList = path.join(dir, "sentence-revisions", "master-concat.txt")
  await writeFile(masterList, manifest.segments.map(s => `file '${path.join(dir, metadata.segments[s.id].file).replace(/'/g, "'\\''")}'`).join("\n"))
  await exec("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", masterList, "-c:a", "pcm_s16le", path.join(dir, "audio", "continuous-narration.wav")])
  await writeFile(path.join(dir, "audio-metadata.json"), JSON.stringify(metadata, null, 2) + "\n")
  await writeFile(path.join(dir, "sentence-revision-evidence.json"), JSON.stringify({ previous: base, generatedAt: metadata.generatedAt, voice: metadata.voice, note: "Verified continuous original with changed sentences regenerated only; no claim of a single new TTS take. Original chapters without changes are byte-identical.", sentences: evidence }, null, 2))
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Sentence revision failed"); process.exitCode = 1 })
