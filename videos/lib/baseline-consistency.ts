// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Coherence of one source set of a baseline: the manifest, the capture timeline, the narration
 * metadata and its audit, and the audio files actually on disk must describe the same narration.
 * `baseline add` refuses a set that cannot be assembled, before copying anything.
 *
 * Everything here is a pure function of already-read inputs: the caller reads the four JSON files
 * and hashes the audio files, then prints the issues.
 */
import { assertNarrationGeneration } from "./narration-generation"

export type SetUnderCheck = {
  manifest: { id: string; slug: string; continuousNarration?: boolean; continuousPauseTags?: boolean; voice: string; voiceStyle: string; musicGainDb?: number; segments: { id: string; transcript: string }[] }
  timeline: {
    slug: string
    capturePurpose?: string
    product?: { commit?: string; buildId?: string; productSourceSha256?: string }
    inputEvents?: unknown[]
    cues: { id: string }[]
  }
  audio: { model: string; voice: string; segments: Record<string, { file: string; generationSha256?: string }>; sentenceRevision?: unknown }
  audit: { promptVersion?: number; segments: { id: string; expected: string; audioSha256: string; needsReview: boolean }[] }
  /** Key: the `file` value of `audio.segments` (for example "audio/intro.wav"); absent key = file missing. */
  audioSha256: Record<string, string>
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.split(/\r?\n/)[0] ?? message
}

/**
 * One line per problem, each starting with the segment id or with `timeline:` / `narration:`.
 * A missing audio entry or file also makes the generation proof incomplete, so it can add a
 * `narration:` line: every actual problem is listed.
 */
export function setConsistencyIssues(set: SetUnderCheck): string[] {
  const { manifest, timeline, audio, audit, audioSha256 } = set
  const issues: string[] = []

  if (timeline.slug !== manifest.slug) {
    issues.push(`timeline: slug "${timeline.slug}" differs from manifest.slug "${manifest.slug}"`)
  }
  if (timeline.capturePurpose !== "narration-timed") {
    const purpose = timeline.capturePurpose === undefined ? "missing" : JSON.stringify(timeline.capturePurpose)
    issues.push(`timeline: capturePurpose is ${purpose}, not "narration-timed"`)
  }
  if (!timeline.product?.commit) issues.push("timeline: product.commit missing")
  // The assembler also refuses a capture without a build id or a source checksum (assemble.ts:56).
  if (!timeline.product?.buildId) issues.push("timeline: product.buildId missing")
  if (!timeline.product?.productSourceSha256) issues.push("timeline: product.productSourceSha256 missing")
  const cueIds = timeline.cues.map((cue) => cue.id)
  const segmentIds = manifest.segments.map((segment) => segment.id)
  if (cueIds.length !== segmentIds.length || cueIds.some((id, index) => id !== segmentIds[index])) {
    issues.push("timeline: cue ids differ from the manifest segment ids")
  }
  // assemble.ts:47 and :96 refuse these two inputs as well; both are visible from the files alone.
  if (manifest.musicGainDb !== undefined && (!Number.isFinite(manifest.musicGainDb) || Math.abs(manifest.musicGainDb) > 3)) {
    issues.push("manifest: musicGainDb must be finite and between -3 and 3")
  }
  if (!Array.isArray(timeline.inputEvents) || timeline.inputEvents.length === 0) {
    issues.push("timeline: no recorded interaction (inputEvents empty)")
  }
  if (audit.promptVersion !== 2) {
    const version = audit.promptVersion === undefined ? "missing" : String(audit.promptVersion)
    issues.push(`narration-audit: promptVersion is ${version}, 2 is required`)
  }

  try {
    assertNarrationGeneration(manifest, audio as unknown as Parameters<typeof assertNarrationGeneration>[1])
  } catch (error) {
    issues.push(`narration: ${firstLine(error)}`)
  }

  for (const segment of manifest.segments) {
    const generated = audio.segments[segment.id]
    const checksum = generated ? audioSha256[generated.file] : undefined
    if (!generated) issues.push(`${segment.id}: no audio segment in audio-metadata.json`)
    if (generated && !checksum) issues.push(`${segment.id}: audio file ${generated.file} has no checksum on disk`)

    const checked = audit.segments.find((entry) => entry.id === segment.id)
    if (!checked) {
      issues.push(`${segment.id}: no narration-audit entry`)
      continue
    }
    if (checked.expected !== segment.transcript) issues.push(`${segment.id}: audit expected text differs from the transcript`)
    if (checked.needsReview) issues.push(`${segment.id}: audit flagged the narration for review`)
    if (generated && checksum && checked.audioSha256 !== checksum) {
      issues.push(`${segment.id}: audit audioSha256 differs from the file checksum`)
    }
  }

  return issues
}
