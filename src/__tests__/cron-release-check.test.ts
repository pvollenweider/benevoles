import { describe, it, expect, vi, beforeEach } from "vitest"

const env = vi.hoisted(() => ({ CRON_SECRET: "s3cret", RELEASE_CHECK: undefined as string | undefined }))
vi.mock("@/lib/env", () => ({ env, releaseCheckEnabled: () => env.RELEASE_CHECK?.trim().toLowerCase() !== "off" }))

const fetchLatestRelease = vi.hoisted(() => vi.fn())
vi.mock("@/lib/release-check-fetch", () => ({ fetchLatestRelease }))

const findUniqueReleaseState = vi.hoisted(() => vi.fn())
const upsertReleaseState = vi.hoisted(() => vi.fn())
const updateReleaseState = vi.hoisted(() => vi.fn())
const findManyAdminUser = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: {
    releaseCheckState: { findUnique: findUniqueReleaseState, upsert: upsertReleaseState, update: updateReleaseState },
    adminUser: { findMany: findManyAdminUser },
  },
}))

const enqueueNotifications = vi.hoisted(() => vi.fn())
const deliverAfterResponse = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications, deliverAfterResponse }))

import { GET, POST } from "@/app/api/cron/release-check/route"

const req = (auth?: string) => new Request("http://localhost/api/cron/release-check", { method: "POST", headers: auth ? { authorization: auth } : {} })

describe("POST /api/cron/release-check", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    env.RELEASE_CHECK = undefined
    findUniqueReleaseState.mockResolvedValue(null)
    upsertReleaseState.mockResolvedValue({ latestVersion: null })
    findManyAdminUser.mockResolvedValue([])
  })

  it("refuses without the secret", async () => {
    expect((await POST(req())).status).toBe(401)
    expect((await POST(req("Bearer nope"))).status).toBe(401)
    expect(fetchLatestRelease).not.toHaveBeenCalled()
  })

  it("makes no outbound request at all when RELEASE_CHECK=off", async () => {
    env.RELEASE_CHECK = "off"
    const res = await POST(req("Bearer s3cret"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enabled: false })
    expect(fetchLatestRelease).not.toHaveBeenCalled()
    expect(upsertReleaseState).not.toHaveBeenCalled()
  })

  it("is silent on a network failure (never throws, still 200)", async () => {
    fetchLatestRelease.mockResolvedValue(null)
    upsertReleaseState.mockResolvedValue({ latestVersion: null })
    const res = await POST(req("Bearer s3cret"))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ enabled: true, checked: false })
    expect(findManyAdminUser).not.toHaveBeenCalled()
  })

  it("emails super admins once for a newer version, stores lastNotifiedVersion", async () => {
    fetchLatestRelease.mockResolvedValue({ version: "v99.0.0", url: "https://github.com/x/releases/tag/v99.0.0" })
    findUniqueReleaseState.mockResolvedValue({ latestVersion: "v1.0.0", lastNotifiedVersion: null })
    upsertReleaseState.mockResolvedValue({ latestVersion: "v99.0.0" })
    findManyAdminUser.mockResolvedValue([{ email: "sa@x.ch" }])
    enqueueNotifications.mockResolvedValue(["row-1"])

    const res = await POST(req("Bearer s3cret"))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ enabled: true, checked: true, latestVersion: "v99.0.0", notified: 1 })
    expect(enqueueNotifications).toHaveBeenCalledWith([
      expect.objectContaining({ kind: "release_available", recipient: { email: "sa@x.ch" }, dedupeKey: "release_available:v99.0.0:sa@x.ch" }),
    ])
    expect(deliverAfterResponse).toHaveBeenCalledWith(["row-1"])
    expect(updateReleaseState).toHaveBeenCalledWith({ where: { id: "singleton" }, data: { lastNotifiedVersion: "v99.0.0" } })
  })

  it("does not notify twice for the same version", async () => {
    fetchLatestRelease.mockResolvedValue({ version: "v99.0.0", url: "https://x" })
    findUniqueReleaseState.mockResolvedValue({ latestVersion: "v99.0.0", lastNotifiedVersion: "v99.0.0" })
    upsertReleaseState.mockResolvedValue({ latestVersion: "v99.0.0" })

    const res = await POST(req("Bearer s3cret"))
    expect(await res.json()).toMatchObject({ notified: 0 })
    expect(enqueueNotifications).not.toHaveBeenCalled()
    expect(updateReleaseState).not.toHaveBeenCalled()
  })

  it("GET works the same as POST", async () => {
    fetchLatestRelease.mockResolvedValue(null)
    const res = await GET(req("Bearer s3cret"))
    expect(res.status).toBe(200)
  })
})
