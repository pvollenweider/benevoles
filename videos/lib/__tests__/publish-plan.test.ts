// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { parseSha256Sum, planPublish, publishedFiles } from "../publish-plan"

const h = (c: string) => c.repeat(64)

describe("publishedFiles", () => {
  it("lists the video, captions, transcript and both posters of a slug", () => {
    expect(publishedFiles("event-create-blank")).toEqual([
      "event-create-blank/event-create-blank.mp4",
      "event-create-blank/event-create-blank.vtt",
      "event-create-blank/event-create-blank.txt",
      "event-create-blank/event-create-blank.jpg",
      "event-create-blank/event-create-blank-og.jpg",
    ])
  })

  it("lists only the two posters with postersOnly: a published video or its captions are never resent", () => {
    expect(publishedFiles("event-create-blank", { postersOnly: true })).toEqual([
      "event-create-blank/event-create-blank.jpg",
      "event-create-blank/event-create-blank-og.jpg",
    ])
  })
})

describe("parseSha256Sum", () => {
  it("reads busybox and GNU output, with or without ./ and the binary marker", () => {
    const out = `${h("a")}  ./x/x.mp4\n${h("b")}  x/x.vtt\n${h("c")} *x/x.txt\nsha256sum: y/y.mp4: No such file\n\n`
    expect(parseSha256Sum(out)).toEqual(new Map([["x/x.mp4", h("a")], ["x/x.vtt", h("b")], ["x/x.txt", h("c")]]))
  })

  it("ignores anything that is not a checksum line", () => {
    expect(parseSha256Sum("total 0\nnot a hash  file\n").size).toBe(0)
  })
})

describe("planPublish", () => {
  it("uploads new and changed files only, keeps the rest, and reports files only the server has", () => {
    const local = new Map([["a/a.mp4", h("1")], ["a/a.vtt", h("2")], ["b/b.mp4", h("3")]])
    const remote = new Map([["a/a.mp4", h("1")], ["a/a.vtt", h("9")], ["old/old.mp4", h("4")]])
    expect(planPublish(local, remote)).toEqual({ upload: ["a/a.vtt", "b/b.mp4"], unchanged: ["a/a.mp4"], extra: ["old/old.mp4"] })
  })

  it("uploads everything to an empty server", () => {
    const local = new Map([["a/a.mp4", h("1")]])
    expect(planPublish(local, new Map())).toEqual({ upload: ["a/a.mp4"], unchanged: [], extra: [] })
  })
})
