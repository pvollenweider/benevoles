import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * A poste reserved to an answer (#962) against a real Postgres, through the public sign-up route:
 * the stored `QuestionAnswer` values decide (never a translated label), a missing or different
 * answer is refused with nothing written, and a known volunteer's stored « Oui » opens the shift
 * even when the form proves nothing about the address.
 *
 * Not run without `DATABASE_URL` (no Postgres in the change's own checks).
 */

const send = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: send }))
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: () => {} }))

import { prisma } from "@/lib/prisma"
import { POST as publicSignup } from "@/app/api/public/registrations/route"

const url = process.env.DATABASE_URL
const tag = `int-role-answer-${Date.now()}`
let ipSeq = 0

describe.skipIf(!url)("public sign-up to a poste reserved to an answer (#962)", () => {
  let orgId = ""
  let eventId = ""
  let shiftId = ""
  let questionId = ""

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "Org answer", slug: `${tag}-org`, timeZone: "Europe/Zurich", publicationApprovedAt: new Date() } })
    orgId = org.id
    const event = await prisma.event.create({
      data: { organizationId: orgId, slug: "fete", title: "Fête", startDate: new Date("2031-06-01"), endDate: new Date("2031-06-02"), publicStatus: "published" },
    })
    eventId = event.id
    questionId = (await prisma.eventQuestion.create({
      data: { eventId, label: "Permis de conduire", type: "yesno", options: [], required: false, displayScope: "event" },
    })).id
    shiftId = (await prisma.shift.create({
      data: {
        eventId, roleName: "Navette", label: "Navette", date: new Date("2031-06-01T00:00:00Z"), startTime: "10:00", endTime: "12:00", capacity: 5,
        reservedQuestionId: questionId, reservedAnswers: ["Oui"],
      },
    })).id
  })

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.questionAnswer.deleteMany({ where: { eventId } })
      await prisma.registration.deleteMany({ where: { event: { organizationId: orgId } } })
      await prisma.shift.deleteMany({ where: { event: { organizationId: orgId } } })
      await prisma.eventQuestion.deleteMany({ where: { eventId } })
      await prisma.event.deleteMany({ where: { organizationId: orgId } })
      await prisma.volunteer.deleteMany({ where: { organizationId: orgId } })
      await prisma.charterVersion.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.deleteMany({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  const signup = (email: string, answers: Record<string, unknown>) => publicSignup(new Request("http://localhost/api/public/registrations", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${tag}-ip-${ipSeq++}` },
    body: JSON.stringify({ eventId, shiftIds: [shiftId], firstName: "Chloé", lastName: "Roy", email, consent: true, charterAccepted: true, answers }),
  }))
  const answer = async (res: Response) => ({ status: res.status, body: await res.json() })

  it("accepts the accepted answer and stores it", async () => {
    const email = `${tag}-oui@example.org`
    expect((await signup(email, { [questionId]: "Oui" })).status).toBe(201)
    expect(await prisma.registration.count({ where: { shiftId, status: "active" } })).toBe(1)
    expect((await prisma.questionAnswer.findFirst({ where: { questionId, volunteer: { email } } }))?.values).toEqual(["Oui"])
  })

  it("refuses another answer or no answer, near the question and the shift, and writes nothing", async () => {
    const before = await prisma.registration.count({ where: { eventId } })
    for (const answers of [{ [questionId]: "Non" }, {}]) {
      const res = await answer(await signup(`${tag}-non-${ipSeq}@example.org`, answers))
      expect(res.status).toBe(403)
      expect(res.body.error).toBe("Ce poste est réservé aux personnes qui répondent Oui à « Permis de conduire ».")
      expect(res.body.reservedAnswerShiftIds).toEqual([shiftId])
      expect(res.body.questionErrors).toEqual([{ questionId, message: res.body.error }])
    }
    expect(await prisma.registration.count({ where: { eventId } })).toBe(before)
  })

  it("uses the volunteer's stored answer, so changing it opens the shift", async () => {
    const email = `${tag}-stored@example.org`
    await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Léa", lastName: "M", email } })
    const volunteer = await prisma.volunteer.findFirstOrThrow({ where: { email } })
    await prisma.questionAnswer.create({ data: { questionId, eventId, volunteerId: volunteer.id, values: ["Oui"] } })
    // The form proves nothing about the address and sends no answer: the stored « Oui » counts.
    expect((await signup(email, {})).status).toBe(201)
    await prisma.questionAnswer.update({ where: { questionId_volunteerId: { questionId, volunteerId: volunteer.id } }, data: { values: ["Non"] } })
    const other = await prisma.shift.create({
      data: { eventId, roleName: "Navette", label: "Navette 2", date: new Date("2031-06-02T00:00:00Z"), startTime: "10:00", endTime: "12:00", capacity: 5, reservedQuestionId: questionId, reservedAnswers: ["Oui"] },
    })
    const res = await publicSignup(new Request("http://localhost/api/public/registrations", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `${tag}-ip-${ipSeq++}` },
      body: JSON.stringify({ eventId, shiftIds: [other.id], firstName: "Léa", lastName: "M", email, consent: true, charterAccepted: true }),
    }))
    expect(res.status).toBe(403)
  })
})
