import { describe, it, expect, afterAll } from "vitest"

/**
 * « Cette vidéo vous a-t-elle été utile ? » (#646) against a real Postgres: the public route stores
 * a day-only anonymous row for the current catalogue revision, the super-admin aggregation
 * (`groupBy` + `summarizeFeedback`, as /super-admin/video-feedback does) keeps revisions apart,
 * and the cleanup's retention cutoff only removes rows past the window.
 */

import { prisma } from "@/lib/prisma"
import { loadVideoCatalog } from "@/lib/video-catalog-load"
import { summarizeFeedback } from "@/lib/video-feedback"
import { daysAgo, RETENTION_DAYS } from "@/lib/retention"
import { POST } from "@/app/api/public/video-feedback/route"

const url = process.env.DATABASE_URL
const fakeId = `INT_FEEDBACK_${Date.now()}`
const createdIds: string[] = []

describe.skipIf(!url)("VideoFeedback (#646)", () => {
  afterAll(async () => {
    await prisma.videoFeedback.deleteMany({ where: { OR: [{ id: { in: createdIds } }, { videoId: fakeId }] } })
  })

  it("the route stores the answer for the current revision, with the day only", async () => {
    const video = loadVideoCatalog()[0]
    const res = await POST(
      new Request("http://localhost/api/public/video-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "192.0.2.46" },
        body: JSON.stringify({ videoId: video.id, revision: video.revision, useful: true, context: "documentation" }),
      }),
    )
    expect(res.status).toBe(201)
    const row = await prisma.videoFeedback.findFirst({ where: { videoId: video.id, revision: video.revision, context: "documentation" }, orderBy: { answeredOn: "desc" } })
    expect(row).not.toBeNull()
    createdIds.push(row!.id)
    expect(row!.language).toBe("fr")
    expect(row!.useful).toBe(true)
    expect(row!.answeredOn.toISOString()).toMatch(/T00:00:00\.000Z$/)
    expect(row!.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("aggregates per video and revision: a new revision starts fresh", async () => {
    const day = new Date("2026-10-01T00:00:00Z")
    const base = { videoId: fakeId, language: "fr", context: "masterclass", answeredOn: day }
    await prisma.videoFeedback.createMany({
      data: [
        { ...base, revision: 1, useful: true },
        { ...base, revision: 1, useful: true },
        { ...base, revision: 1, useful: false },
        { ...base, revision: 2, useful: false },
      ],
    })
    const grouped = await prisma.videoFeedback.groupBy({ by: ["videoId", "revision", "useful"], where: { videoId: fakeId }, _count: { _all: true } })
    const rows = summarizeFeedback(
      grouped.map((g) => ({ videoId: g.videoId, revision: g.revision, useful: g.useful, count: g._count._all })),
      [{ id: fakeId, title: "Vidéo de test", revision: 2 }],
    )
    expect(rows).toEqual([
      { videoId: fakeId, title: "Vidéo de test", revision: 2, current: true, yes: 0, no: 1, total: 1 },
      { videoId: fakeId, title: "Vidéo de test", revision: 1, current: false, yes: 2, no: 1, total: 3 },
    ])
  })

  it("the retention cutoff removes only the answers past the window", async () => {
    const now = new Date()
    const old = daysAgo(now, RETENTION_DAYS.videoFeedback + 2)
    const recent = daysAgo(now, RETENTION_DAYS.videoFeedback - 2)
    await prisma.videoFeedback.createMany({
      data: [
        { videoId: fakeId, revision: 9, language: "fr", useful: true, context: "masterclass", answeredOn: old },
        { videoId: fakeId, revision: 9, language: "fr", useful: false, context: "masterclass", answeredOn: recent },
      ],
    })
    // The cleanup cron's query (src/app/api/cron/cleanup/route.ts), scoped to this test's rows.
    const deleted = await prisma.videoFeedback.deleteMany({ where: { videoId: fakeId, revision: 9, answeredOn: { lt: daysAgo(now, RETENTION_DAYS.videoFeedback) } } })
    expect(deleted.count).toBe(1)
    const left = await prisma.videoFeedback.findMany({ where: { videoId: fakeId, revision: 9 } })
    expect(left.map((r) => r.useful)).toEqual([false])
  })
})
