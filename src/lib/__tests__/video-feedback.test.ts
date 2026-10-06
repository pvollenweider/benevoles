import { describe, it, expect } from "vitest"
import {
  checkFeedbackTarget,
  feedbackBodySchema,
  feedbackContextFrom,
  feedbackDay,
  feedbackLanguage,
  feedbackStorageKey,
  feedbackWording,
  summarizeFeedback,
} from "../video-feedback"

// « Cette vidéo vous a-t-elle été utile ? » (#646).

const valid = { videoId: "EVENT_CREATE_BLANK", revision: 2, useful: true, context: "masterclass" }

describe("feedbackBodySchema", () => {
  it("accepts a well-formed answer", () => {
    expect(feedbackBodySchema.safeParse(valid).success).toBe(true)
    expect(feedbackBodySchema.safeParse({ ...valid, useful: false, context: "documentation" }).success).toBe(true)
  })

  it("rejects a malformed id, revision, answer or context", () => {
    for (const bad of [
      { ...valid, videoId: "event-create-blank" },
      { ...valid, videoId: "" },
      { ...valid, revision: 0 },
      { ...valid, revision: 1.5 },
      { ...valid, revision: "2" },
      { ...valid, useful: "oui" },
      { ...valid, context: "email" },
      { videoId: valid.videoId, revision: 2, context: "masterclass" },
      null,
    ]) {
      expect(feedbackBodySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
    }
  })

  it("never keeps an extra field such as an email or an organization", () => {
    const parsed = feedbackBodySchema.parse({ ...valid, email: "a@example.org", organizationId: "org-1" })
    expect(Object.keys(parsed).sort()).toEqual(["context", "revision", "useful", "videoId"])
  })
})

describe("feedbackContextFrom", () => {
  it("is « documentation » only for ?from=doc, the video library otherwise", () => {
    expect(feedbackContextFrom("doc")).toBe("documentation")
    expect(feedbackContextFrom(["doc", "x"])).toBe("documentation")
    expect(feedbackContextFrom(undefined)).toBe("masterclass")
    expect(feedbackContextFrom(null)).toBe("masterclass")
    expect(feedbackContextFrom("gallery")).toBe("masterclass")
  })
})

describe("feedbackLanguage and feedbackDay", () => {
  it("keeps the primary language subtag", () => {
    expect(feedbackLanguage("fr-CH")).toBe("fr")
    expect(feedbackLanguage("fr")).toBe("fr")
    expect(feedbackLanguage("DE-ch")).toBe("de")
  })

  it("keeps the UTC day only, never the time", () => {
    expect(feedbackDay(new Date("2026-10-06T23:59:58.123Z")).toISOString()).toBe("2026-10-06T00:00:00.000Z")
    expect(feedbackDay(new Date("2026-10-07T00:00:00.001Z")).toISOString()).toBe("2026-10-07T00:00:00.000Z")
  })
})

describe("checkFeedbackTarget", () => {
  const catalog = [{ id: "EVENT_CREATE_BLANK", revision: 2 }]

  it("accepts the current revision of a catalogued video", () => {
    expect(checkFeedbackTarget({ videoId: "EVENT_CREATE_BLANK", revision: 2 }, catalog)).toBe("ok")
  })

  it("refuses an unknown video", () => {
    expect(checkFeedbackTarget({ videoId: "NOT_A_VIDEO", revision: 1 }, catalog)).toBe("unknown-video")
  })

  it("refuses an older (or future) revision: a regenerated video starts fresh", () => {
    expect(checkFeedbackTarget({ videoId: "EVENT_CREATE_BLANK", revision: 1 }, catalog)).toBe("stale-revision")
    expect(checkFeedbackTarget({ videoId: "EVENT_CREATE_BLANK", revision: 3 }, catalog)).toBe("stale-revision")
  })
})

describe("feedbackStorageKey", () => {
  it("is per video and per revision, so a new revision can be answered again", () => {
    expect(feedbackStorageKey("A_B", 1)).not.toBe(feedbackStorageKey("A_B", 2))
    expect(feedbackStorageKey("A_B", 1)).not.toBe(feedbackStorageKey("A_C", 1))
  })
})

describe("feedbackWording", () => {
  it("says « tu » for a volunteer-only video", () => {
    expect(feedbackWording(["benevole"]).question).toBe("Cette vidéo t'a-t-elle été utile ?")
    expect(feedbackWording(["benevole"]).thanks).toBe("Merci pour ta réponse.")
  })

  it("says « vous » for organizers, the super admin and mixed audiences", () => {
    for (const audience of [["organisateur"], ["super-admin"], ["organisateur", "benevole"], ["benevole", "organisateur"]] as const) {
      expect(feedbackWording(audience).question).toBe("Cette vidéo vous a-t-elle été utile ?")
    }
  })

  it("uses no middle dot or em dash", () => {
    for (const w of [feedbackWording(["benevole"]), feedbackWording(["organisateur"])]) {
      for (const text of Object.values(w)) expect(text).not.toMatch(/[·—]/)
    }
  })
})

describe("summarizeFeedback", () => {
  const catalog = [
    { id: "A_VIDEO", title: "Vidéo A", revision: 2 },
    { id: "B_VIDEO", title: "Vidéo B", revision: 1 },
  ]

  it("adds Oui and Non per video and revision", () => {
    const rows = summarizeFeedback(
      [
        { videoId: "B_VIDEO", revision: 1, useful: true, count: 3 },
        { videoId: "B_VIDEO", revision: 1, useful: false, count: 1 },
      ],
      catalog,
    )
    expect(rows.find((r) => r.videoId === "B_VIDEO")).toEqual({ videoId: "B_VIDEO", title: "Vidéo B", revision: 1, current: true, yes: 3, no: 1, total: 4 })
  })

  it("lists every catalogued video at its current revision, even without answers", () => {
    const rows = summarizeFeedback([], catalog)
    expect(rows.map((r) => [r.videoId, r.revision, r.total])).toEqual([["A_VIDEO", 2, 0], ["B_VIDEO", 1, 0]])
  })

  it("starts a regenerated video fresh: the older revision's answers stay on their own row", () => {
    const rows = summarizeFeedback(
      [
        { videoId: "A_VIDEO", revision: 1, useful: true, count: 5 },
        { videoId: "A_VIDEO", revision: 1, useful: false, count: 2 },
        { videoId: "A_VIDEO", revision: 2, useful: false, count: 1 },
      ],
      catalog,
    )
    const a = rows.filter((r) => r.videoId === "A_VIDEO")
    expect(a).toEqual([
      { videoId: "A_VIDEO", title: "Vidéo A", revision: 2, current: true, yes: 0, no: 1, total: 1 },
      { videoId: "A_VIDEO", title: "Vidéo A", revision: 1, current: false, yes: 5, no: 2, total: 7 },
    ])
  })

  it("keeps answers for a video no longer in the catalogue, last and untitled", () => {
    const rows = summarizeFeedback([{ videoId: "GONE", revision: 3, useful: true, count: 2 }], catalog)
    expect(rows.at(-1)).toEqual({ videoId: "GONE", title: null, revision: 3, current: false, yes: 2, no: 0, total: 2 })
  })
})
