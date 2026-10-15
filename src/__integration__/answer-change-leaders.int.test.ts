import { describe, it, expect, afterAll, vi } from "vitest"

/**
 * #984 part 3 on Postgres: one save that changes a question attached to « Cuisine » (which has a
 * sector leader), one attached to « Parking » (no leader) and an unattached one. The leader's
 * grouped email holds only the Cuisine change, with their personal link; the organisers' holds the
 * other two; a second change of the Cuisine answer merges into the leader's line.
 */

vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("next/server", () => ({ after: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { linkToken } from "@/lib/token-vault"
import { openPayload } from "@/lib/notifications/outbox"
import { queueAnswerChangeNotifications } from "@/lib/answer-change-notifications"
import type { AnswerChangeItem } from "@/lib/answer-changes"

const url = process.env.DATABASE_URL
const tag = `int-ansl-${Date.now()}`

type Data = { items: { value: AnswerChangeItem }[]; token?: string; roleName?: string; orgSlug?: string }
const data = (row: { payload: unknown }) => openPayload(row.payload as string).data as Data
const questionIds = (row: { payload: unknown }) => data(row).items.flatMap((i) => i.value.changes.map((c) => c.questionId))

describe.skipIf(!url)("answer changes routed to sector leaders (#984, part 3)", () => {
  let orgId = ""

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  it("splits one save between the leader of the poste and the organisers", async () => {
    orgId = (await prisma.organization.create({ data: { name: `Comité ${tag}`, slug: tag } })).id
    await prisma.adminUser.create({ data: { organizationId: orgId, email: `${tag}-admin@example.org`, name: "Anne", passwordHash: "x", role: "admin" } })
    const event = await prisma.event.create({ data: { organizationId: orgId, slug: tag, title: "Fête", startDate: new Date("2026-07-04"), endDate: new Date("2026-07-04") } })
    const leader = await prisma.sectorLeader.create({ data: { eventId: event.id, roleName: "Cuisine", name: "Marc Dupont", email: `${tag}-marc@example.org`, ...linkToken.data(`${tag}-lead`) } })

    const changes = [
      { questionId: "meal", label: "Repas ?", from: ["Oui"], to: ["Non"], roleName: "Cuisine" },
      { questionId: "park", label: "Parking ?", from: [], to: ["Oui"], roleName: "Parking" },
      { questionId: "size", label: "Taille ?", from: ["M"], to: ["L"], roleName: null },
    ]
    const t0 = new Date()
    await queueAnswerChangeNotifications({ event: { id: event.id, title: "Fête", organizationId: orgId }, volunteerId: "v1", volunteerName: "Julie Martin", changes, changeId: `${tag}-1` }, t0)

    const rows = await prisma.notificationOutbox.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } })
    expect(rows).toHaveLength(2)
    const toLeader = rows.find((r) => r.dedupeKey?.startsWith("sector_leader_answers_changed:"))!
    const toAdmin = rows.find((r) => r.dedupeKey?.startsWith("answers_changed:"))!
    expect(toLeader.dedupeKey).toBe(`sector_leader_answers_changed:${event.id}:${leader.id}:${tag}-1`)
    expect(questionIds(toLeader)).toEqual(["meal"])
    expect(data(toLeader)).toMatchObject({ token: `${tag}-lead`, roleName: "Cuisine", orgSlug: tag })
    expect(questionIds(toAdmin)).toEqual(["park", "size"])

    // Julie changes the meal answer again before the email leaves: one line, the final value.
    await queueAnswerChangeNotifications({
      event: { id: event.id, title: "Fête", organizationId: orgId }, volunteerId: "v1", volunteerName: "Julie Martin",
      changes: [{ questionId: "meal", label: "Repas ?", from: ["Non"], to: ["Peut-être"], roleName: "Cuisine" }], changeId: `${tag}-2`,
    }, new Date(t0.getTime() + 60_000))
    const after = await prisma.notificationOutbox.findMany({ where: { organizationId: orgId } })
    expect(after).toHaveLength(2)
    const leaderRow = after.find((r) => r.id === toLeader.id)!
    expect(data(leaderRow).items.map((i) => i.value)).toEqual([{ volunteerName: "Julie Martin", changes: [{ questionId: "meal", label: "Repas ?", from: "Oui", to: "Peut-être" }] }])
    // The organisers' email is untouched by a change that is the leader's.
    expect(after.find((r) => r.id === toAdmin.id)!.nextAttemptAt.getTime()).toBe(toAdmin.nextAttemptAt.getTime())
  })
})
