import { describe, it, expect, afterAll } from "vitest"

/**
 * Rate limit store against a real Postgres (#322): the counters must hold when several app
 * replicas hit the same key at once, which only the database's atomic upsert can prove.
 */

import { prisma } from "@/lib/prisma"
import { decide, postgresStore } from "@/lib/rate-limit"

const url = process.env.DATABASE_URL
const tag = `int-rl-${Date.now()}`

describe.skipIf(!url)("rate limit on Postgres (#322)", () => {
  afterAll(async () => {
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  it("concurrent hits are all counted, exactly once each", async () => {
    const key = `${tag}-concurrent`
    const results = await Promise.all(Array.from({ length: 25 }, () => postgresStore.hit(key, 60_000)))
    expect(results.map((r) => r.count).sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1))
    expect(results.filter((r) => decide(r, 10).ok)).toHaveLength(10)
    expect((await postgresStore.peek(key))?.count).toBe(25)
  })

  it("reports the time left in the window from the database clock", async () => {
    const win = await postgresStore.hit(`${tag}-ttl`, 60_000)
    expect(win.count).toBe(1)
    expect(win.msLeft).toBeGreaterThan(55_000)
    // resetAt is stored to the millisecond (timestamptz(3)) while now() has microseconds: the
    // window can read up to half a millisecond longer than requested.
    expect(win.msLeft).toBeLessThanOrEqual(60_001)
  })

  it("an expired window restarts at 1 and peek ignores it", async () => {
    const key = `${tag}-expired`
    await postgresStore.hit(key, 60_000)
    await postgresStore.hit(key, 60_000)
    await prisma.rateLimit.update({ where: { key }, data: { resetAt: new Date(Date.now() - 1000) } })

    expect(await postgresStore.peek(key)).toBeNull()
    const win = await postgresStore.hit(key, 60_000)
    expect(win.count).toBe(1)
    expect(win.msLeft).toBeGreaterThan(55_000)
  })

  it("peekMany reads several live windows at once and leaves out missing and expired keys", async () => {
    const live = `${tag}-many-live`, expired = `${tag}-many-expired`
    await postgresStore.hit(live, 60_000)
    await postgresStore.hit(live, 60_000)
    await postgresStore.hit(expired, 60_000)
    await prisma.rateLimit.update({ where: { key: expired }, data: { resetAt: new Date(Date.now() - 1000) } })
    const found = await postgresStore.peekMany!([live, expired, `${tag}-many-missing`])
    expect([...found.keys()]).toEqual([live])
    expect(found.get(live)?.count).toBe(2)
    expect(found.get(live)?.msLeft).toBeGreaterThan(55_000)
    expect((await postgresStore.peekMany!([])).size).toBe(0)
  })

  it("release gives back one hit, never below zero, and ignores a missing key (#1048)", async () => {
    const key = `${tag}-release`
    await postgresStore.hit(key, 60_000)
    await postgresStore.hit(key, 60_000)
    await postgresStore.release!(key)
    expect((await postgresStore.peek(key))?.count).toBe(1)
    await postgresStore.release!(key)
    await postgresStore.release!(key)
    expect((await postgresStore.peek(key))?.count).toBe(0)
    await postgresStore.release!(`${tag}-release-missing`)
    expect(await postgresStore.peek(`${tag}-release-missing`)).toBeNull()
  })
})
