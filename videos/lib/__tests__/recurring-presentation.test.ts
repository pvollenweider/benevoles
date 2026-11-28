// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { estimateSentences, sentenceFor } from "../sentence-timing"
import { REPAIR_OWNER_EMAIL, seasonStart } from "../record-recurring-presentation"
import { RC_OWNER, RC_PERSON_EMAIL, RC_VOLUNTEER } from "../../../scripts/seed-video-repair-cafe"

const root = path.resolve(__dirname, "../../..")
const read = (file: string) => readFileSync(path.join(root, file), "utf8")
const manifest = JSON.parse(read("videos/manifests/presentation-permanences.json")) as { secondVoice?: { voice: string }; segments: { id: string; transcript: string; speaker?: string; fallbackDurationMs: number }[] }
const recorder = read("videos/lib/record-recurring-presentation.ts")

// The permanences presentation video: scenes, cues and voices agree with the manifest, the
// recorder agrees with its fixture, and the tools that film and review it accept it.
describe("RECURRING_PRESENTATION", () => {
  test("every segment is a scene in the manifest's order, and every cue lands on one sentence of it", () => {
    expect([...recorder.matchAll(/await (?:scene|card)\("([^"]+)"/g)].map((m) => m[1])).toEqual(manifest.segments.map((s) => s.id))
    for (const [, id, body] of recorder.matchAll(/await scene\("([^"]+)", async (?:at|\(\)) => \{([\s\S]*?)\n  \}\)/g)) {
      const segment = manifest.segments.find((s) => s.id === id)!
      const sentences = estimateSentences(segment.transcript, segment.fallbackDurationMs)
      for (const [, cue] of body.matchAll(/await at\("([^"]+)"\)/g)) expect(() => sentenceFor(sentences, cue)).not.toThrow()
    }
  })

  test("the hooks and the call to action are said by the second voice", () => {
    expect(manifest.secondVoice?.voice).toBeTruthy()
    for (const segment of manifest.segments) expect(segment.speaker === "second").toBe(recorder.includes(`await card("${segment.id}"`) || ["r-hook", "r-cta"].includes(segment.id))
  })

  test("the recorder signs in with the seeded organiser, and Sarah is a cast name on example.org", () => {
    expect(REPAIR_OWNER_EMAIL).toBe(RC_OWNER.email)
    expect(RC_VOLUNTEER.email).toMatch(RC_PERSON_EMAIL)
    expect(recorder).toContain(`email: "${RC_VOLUNTEER.email}"`)
  })

  test("the season starts on a Saturday at least two days ahead, whatever the take's day", () => {
    for (const now of ["2026-11-28T10:00:00Z", "2026-11-26T23:30:00Z", "2026-12-04T08:00:00Z"]) {
      const start = seasonStart(new Date(now))
      expect(new Date(`${start}T00:00:00Z`).getUTCDay()).toBe(6)
      expect(Date.parse(start) - Date.parse(now.slice(0, 10))).toBeGreaterThanOrEqual(2 * 86_400_000)
    }
  })

  test("the tools that film and review it accept it", () => {
    expect(read("videos/tools/local-production.ts")).toContain('"repair-cafe-presentation"')
    expect(read("videos/tools/local-production.ts")).toContain('"RECURRING_PRESENTATION"')
    expect(read("videos/tools/audit-audiovisual.ts")).toContain('"RECURRING_PRESENTATION"')
    expect(read("videos/tools/audit-full-final-audio.ts")).toContain('"RECURRING_PRESENTATION"')
    expect(read("videos/tools/record.ts")).toContain('slug === "presentation-permanences"')
  })
})
