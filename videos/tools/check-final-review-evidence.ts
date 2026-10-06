// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Local inventory, never a claim of complete functional or human validation. */
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadCatalog, loadManifest, videoDir } from "../lib/manifest"

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON reports read from disk
async function json(file: string): Promise<any | null> {
  try { return JSON.parse(await readFile(file, "utf8")) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}
async function main() {
  const rows = []
  for (const entry of (await loadCatalog()).videos) {
    const manifest = await loadManifest(entry.id)
    const directory = videoDir(manifest.slug)
    const timeline = await json(path.join(directory, "timeline.json"))
    const audio = await json(path.join(directory, "audio-metadata.json"))
    const narration = await json(path.join(directory, "narration-audit.json"))
    const generationIds = new Set<string>()
    const continuousTranscript = manifest.segments.map(segment => segment.transcript).join(manifest.continuousPauseTags === false ? "\n\n" : "\n\n<short pause>\n\n")
    const expectedGeneration = createHash("sha256").update(JSON.stringify({ transcript: continuousTranscript, style: manifest.voiceStyle, model: audio?.model, voice: audio?.voice, promptVersion: manifest.continuousPauseTags === false ? 3 : 2 })).digest("hex")
    const narrationChapters = []
    for (const segment of manifest.segments) {
      const metadata = audio?.segments?.[segment.id]
      const audit = narration?.segments?.find((item: { id: string }) => item.id === segment.id)
      if (metadata?.generationSha256) generationIds.add(metadata.generationSha256)
      let audioSha256: string | null = null
      if (metadata && typeof metadata.file === "string" && /^audio\/[a-z0-9-]+\.wav$/.test(metadata.file)) {
        try { audioSha256 = createHash("sha256").update(await readFile(path.join(directory, metadata.file))).digest("hex") }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
      }
      narrationChapters.push({ id: segment.id, audioPresent: !!audioSha256, expectedTranscriptCurrent: audit?.expected === segment.transcript, auditMatchesAudio: !!audioSha256 && audit?.audioSha256 === audioSha256, auditPassed: audit?.needsReview === false, generationIdentified: !!metadata?.generationSha256 })
    }
    const sourceNarrationEvidenceCurrent = audio?.model === "gemini-3.8-flash-tts" && audio?.voice === manifest.voice && manifest.continuousNarration === true && generationIds.size === 1 && generationIds.has(expectedGeneration) && narrationChapters.every(chapter => chapter.audioPresent && chapter.expectedTranscriptCurrent && chapter.auditMatchesAudio && chapter.auditPassed && chapter.generationIdentified)
    let videoSha256: string | null = null
    try { videoSha256 = createHash("sha256").update(await readFile(path.join(directory, `${manifest.slug}.mp4`))).digest("hex") }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    const chapters = []
    for (const segment of manifest.segments) {
      const report = await json(path.join(directory, "audiovisual-review", `${segment.id}.json`))
      const sameVideo = !!videoSha256 && report?.videoSha256 === videoSha256
      const review = report?.review
      const structurallyComplete = !!review?.heardOpening && Array.isArray(review?.checkpoints) && review.checkpoints.length > 0 && Array.isArray(review?.issues) && typeof review?.voice?.consistent === "boolean" && typeof review?.voice?.warm === "boolean"
      const flagged = !structurallyComplete || review.issues.length > 0 || !review.voice.consistent || !review.voice.warm || review.checkpoints.some((point: { severity?: string; sync?: string }) => point.severity === "major" || point.sync === "uncertain" || point.sync === "missing")
      chapters.push({ id: segment.id, reportPresent: !!report, sameVideo, structurallyComplete, automatedReviewNeedsAttention: flagged })
    }
    const cueIds = timeline?.cues?.map((cue: { id: string }) => cue.id) ?? []
    const timelineMatchesManifest = cueIds.length === manifest.segments.length && manifest.segments.every(segment => cueIds.filter((id: string) => id === segment.id).length === 1)
    rows.push({ id: entry.id, slug: manifest.slug, videoSha256, capturePurpose: timeline?.capturePurpose ?? null, timelineMatchesManifest, narrationChapters, generationCount: generationIds.size, sourceNarrationEvidenceCurrent, chapters, currentAutomatedAudiovisualReviewsComplete: !!videoSha256 && timeline?.capturePurpose === "narration-timed" && timelineMatchesManifest && chapters.every(chapter => chapter.sameVideo && chapter.structurallyComplete && !chapter.automatedReviewNeedsAttention), finalDeliveryValidated: false })
  }
  const report = { checkedAt: new Date().toISOString(), note: "All catalogue entries inspected locally. Matching video hashes are necessary, not sufficient: transcript/prompt freshness, audio, functional coverage and human review remain separate gates. No upload or API call.", videos: rows }
  await writeFile(path.resolve("videos/output/final-review-evidence.json"), JSON.stringify(report, null, 2))
  console.log(`${rows.length} catalogue entries; ${rows.filter(row => row.currentAutomatedAudiovisualReviewsComplete).length} have complete unflagged audiovisual reports matching their current MP4. No final delivery certification.`)
  console.log(`${rows.filter(row => row.sourceNarrationEvidenceCurrent).length} have current audited source narration from one identified Gemini 3.8 TTS generation; this does not prove the final MP4 voice or synchronization.`)
  for (const row of rows.filter(row => row.narrationChapters.some(chapter => chapter.audioPresent && !chapter.expectedTranscriptCurrent))) console.log(`${row.id}: source narration transcript audit is missing or outdated`)
  for (const row of rows.filter(row => row.narrationChapters.every(chapter => chapter.audioPresent && chapter.expectedTranscriptCurrent && chapter.auditMatchesAudio && chapter.auditPassed) && !row.sourceNarrationEvidenceCurrent)) console.log(`${row.id}: source model, voice, continuous generation or current delivery instructions require verification`)
  for (const row of rows.filter(row => row.videoSha256 && row.chapters.some(chapter => chapter.reportPresent && !chapter.sameVideo))) console.log(`${row.id}: old audiovisual reports do not match current MP4`)
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Evidence check failed"); process.exitCode = 1 })
