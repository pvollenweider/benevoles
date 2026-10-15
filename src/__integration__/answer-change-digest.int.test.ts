import { describe, it, expect, afterAll, vi } from "vitest"

/**
 * #984 on Postgres: a volunteer's changes of answers within the delay make one line of one outbox
 * row, with the final answer; another volunteer's are a line of their own; a change undone before
 * the email leaves drops it; once sent, a new change starts a new email.
 */

vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("next/server", () => ({ after: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { openPayload } from "@/lib/notifications/outbox"
import { queueDigestItem } from "@/lib/notifications/digest"
import { answerChangeItem, mergeAnswerChangeItems, type AnswerChangeItem } from "@/lib/answer-changes"

const url = process.env.DATABASE_URL
const tag = `int-ans-${Date.now()}`

const rows = () => prisma.notificationOutbox.findMany({ where: { dedupeKey: { startsWith: tag } }, orderBy: { createdAt: "asc" } })
const items = (row: { payload: unknown }) => (openPayload(row.payload as string).data as { items: { value: AnswerChangeItem }[] }).items.map((i) => i.value)

describe.skipIf(!url)("answer change digest (#984)", () => {
  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { dedupeKey: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  let seq = 0
  const change = (volunteerId: string, name: string, from: string | null, to: string | null, at: Date) => queueDigestItem({
    kind: "answers_changed", groupKey: `${tag}:evt:a@x.org`, recipient: { email: "a@x.org" }, organizationId: null,
    base: { eventId: "evt", eventTitle: "Fête" },
    item: answerChangeItem(name, [{ questionId: "meal", label: "Repas ?", from: from ? [from] : [], to: to ? [to] : [] }]),
    itemKey: `change-${++seq}`,
    merge: { key: `volunteer:${volunteerId}`, combine: mergeAnswerChangeItems },
    now: at, delayMs: 300_000,
  })

  it("collapses one volunteer's changes into the final value, keeps another's apart, drops an undone one", async () => {
    const t0 = new Date()
    await change("v1", "Julie Martin", "Oui", "Non", t0)
    await change("v1", "Julie Martin", "Non", "Peut-être", new Date(t0.getTime() + 60_000))
    await change("v2", "Paul Roy", null, "Oui", new Date(t0.getTime() + 61_000))
    let found = await rows()
    expect(found).toHaveLength(1)
    expect(items(found[0])).toEqual([
      { volunteerName: "Julie Martin", changes: [{ questionId: "meal", label: "Repas ?", from: "Oui", to: "Peut-être" }] },
      { volunteerName: "Paul Roy", changes: [{ questionId: "meal", label: "Repas ?", from: null, to: "Oui" }] },
    ])
    // Each change pushes the email back.
    expect(found[0].nextAttemptAt.getTime()).toBe(t0.getTime() + 61_000 + 300_000)

    // Paul changes his mind back: his line goes, Julie's stays.
    await change("v2", "Paul Roy", "Oui", null, new Date(t0.getTime() + 62_000))
    found = await rows()
    expect(items(found[0]).map((i) => i.volunteerName)).toEqual(["Julie Martin"])
    // Julie too: nothing left to say, no email.
    await change("v1", "Julie Martin", "Peut-être", "Oui", new Date(t0.getTime() + 63_000))
    expect(await rows()).toHaveLength(0)
  })

  it("once the email is sent, a later change starts a new one", async () => {
    const t0 = new Date()
    await change("v3", "Zoé Martin", "Oui", "Non", t0)
    const [first] = await rows()
    await prisma.notificationOutbox.update({ where: { id: first.id }, data: { status: "sent" } })
    await change("v3", "Zoé Martin", "Non", "Oui", new Date(t0.getTime() + 600_000))
    const found = await rows()
    expect(found).toHaveLength(2)
    expect(items(found[1])).toEqual([{ volunteerName: "Zoé Martin", changes: [{ questionId: "meal", label: "Repas ?", from: "Non", to: "Oui" }] }])
  })
})
