// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { setConsistencyIssues, type SetUnderCheck } from "../baseline-consistency"

const model = "gemini-3.8-flash-tts"
const voice = "Kore"
const voiceStyle = "French, warm and friendly."

const manifest: SetUnderCheck["manifest"] = {
  id: "BETA_ACCESS",
  slug: "beta-access",
  continuousNarration: true,
  voice,
  voiceStyle,
  segments: [
    { id: "intro", transcript: "Bonjour, bienvenue." },
    { id: "outro", transcript: "Merci et à bientôt." },
  ],
}

const generationSha256 = createHash("sha256")
  .update(JSON.stringify({
    transcript: manifest.segments.map((segment) => segment.transcript).join("\n\n"),
    style: voiceStyle,
    model,
    voice,
    promptVersion: 3,
  }))
  .digest("hex")

/** A coherent set: every check of `setConsistencyIssues` passes. */
function coherent(): SetUnderCheck {
  return {
    manifest: {
      ...manifest,
      segments: manifest.segments.map((segment) => ({ ...segment })),
    },
    timeline: {
      slug: manifest.slug,
      capturePurpose: "narration-timed",
      product: { commit: "89a884c8d58c22dda6800481e1238bdc4e219dff" },
      cues: [{ id: "intro" }, { id: "outro" }],
    },
    audio: {
      model,
      voice,
      segments: {
        intro: { file: "audio/intro.wav", generationSha256 },
        outro: { file: "audio/outro.wav", generationSha256 },
      },
    },
    audit: {
      promptVersion: 2,
      segments: [
        { id: "intro", expected: "Bonjour, bienvenue.", audioSha256: "intro-sha", needsReview: false },
        { id: "outro", expected: "Merci et à bientôt.", audioSha256: "outro-sha", needsReview: false },
      ],
    },
    audioSha256: {
      "audio/intro.wav": "intro-sha",
      "audio/outro.wav": "outro-sha",
    },
  }
}

describe("setConsistencyIssues", () => {
  it("accepts a coherent set", () => {
    expect(setConsistencyIssues(coherent())).toEqual([])
  })

  it("reports a timeline that belongs to another video", () => {
    const set = coherent()
    set.timeline.slug = "other-video"
    expect(setConsistencyIssues(set)).toEqual(['timeline: slug "other-video" differs from manifest.slug "beta-access"'])
  })

  it("reports a capture that was not timed for the narration", () => {
    const set = coherent()
    set.timeline.capturePurpose = "rehearsal"
    expect(setConsistencyIssues(set)).toEqual(['timeline: capturePurpose is "rehearsal", not "narration-timed"'])
  })

  it("reports a missing product commit", () => {
    const set = coherent()
    delete set.timeline.product
    expect(setConsistencyIssues(set)).toEqual(["timeline: product.commit missing"])
  })

  it("reports cue ids that are not the manifest segment ids in order", () => {
    const set = coherent()
    set.timeline.cues = [{ id: "outro" }, { id: "intro" }]
    expect(setConsistencyIssues(set)).toEqual(["timeline: cue ids differ from the manifest segment ids"])
  })

  it("reports a narration audit made with an older prompt version", () => {
    const set = coherent()
    set.audit.promptVersion = 1
    expect(setConsistencyIssues(set)).toEqual(["narration-audit: promptVersion is 1, 2 is required"])
  })

  it("reports a narration audit without a prompt version", () => {
    const set = coherent()
    delete set.audit.promptVersion
    expect(setConsistencyIssues(set)).toEqual(["narration-audit: promptVersion is missing, 2 is required"])
  })

  it("reports a narration generation proof that does not match the manifest", () => {
    const set = coherent()
    set.audio.model = "another-model"
    expect(setConsistencyIssues(set)).toEqual(["narration: Gemini 3.8 TTS narration is required"])
  })

  it("reports a manifest segment with no audio entry", () => {
    const set = coherent()
    delete set.audio.segments.intro
    const issues = setConsistencyIssues(set)
    expect(issues).toContain("intro: no audio segment in audio-metadata.json")
    expect(issues).toContain("narration: intro: generation proof missing, mixed, or outdated for the current script and voice instructions")
  })

  it("reports an audio file that is missing on disk", () => {
    const set = coherent()
    delete set.audioSha256["audio/intro.wav"]
    expect(setConsistencyIssues(set)).toEqual(["intro: audio file audio/intro.wav has no checksum on disk"])
  })

  it("reports a segment with no narration-audit entry", () => {
    const set = coherent()
    set.audit.segments = set.audit.segments.filter((segment) => segment.id !== "intro")
    expect(setConsistencyIssues(set)).toEqual(["intro: no narration-audit entry"])
  })

  it("reports an audit expected text that differs from the transcript", () => {
    const set = coherent()
    set.audit.segments[0]!.expected = "Un autre texte."
    expect(setConsistencyIssues(set)).toEqual(["intro: audit expected text differs from the transcript"])
  })

  it("reports a narration flagged for review", () => {
    const set = coherent()
    set.audit.segments[0]!.needsReview = true
    expect(setConsistencyIssues(set)).toEqual(["intro: audit flagged the narration for review"])
  })

  it("reports an audio checksum that differs from the audit", () => {
    const set = coherent()
    set.audit.segments[0]!.audioSha256 = "other-sha"
    expect(setConsistencyIssues(set)).toEqual(["intro: audit audioSha256 differs from the file checksum"])
  })

  it("lists every problem of an inconsistent set", () => {
    const set = coherent()
    set.timeline.slug = "other-video"
    delete set.audioSha256["audio/intro.wav"]
    set.audit.segments[1]!.needsReview = true
    expect(setConsistencyIssues(set)).toEqual([
      'timeline: slug "other-video" differs from manifest.slug "beta-access"',
      "intro: audio file audio/intro.wav has no checksum on disk",
      "outro: audit flagged the narration for review",
    ])
  })
})
