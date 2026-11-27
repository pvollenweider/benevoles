// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { SP_EVENT, SP_OWNER, SP_PEOPLE, SP_PERSON_EMAIL, SP_POSTES, spShiftId } from "../../../scripts/seed-video-signup-settings"
import { SIGNUP_SETTINGS_OWNER_EMAIL } from "../record-signup-page-settings"
import { verifySignupSettingsReviewFixture } from "../verify-signup-settings-review-fixture"
import { surnameOf } from "../fixture-names"

const root = path.resolve(__dirname, "../../..")
const read = (file: string) => readFileSync(path.join(root, file), "utf8")
const recorder = read("videos/lib/record-signup-page-settings.ts")

// The sign-up page settings video: its fixture, its recorder and the tools that let it be filmed.
describe("sign-up page settings fixture (scripts/seed-video-signup-settings.ts)", () => {
  test("the recorder signs in with the seeded owner and opens the seeded event and shifts", () => {
    expect(SIGNUP_SETTINGS_OWNER_EMAIL).toBe(SP_OWNER.email)
    expect(recorder).toContain(`const EVENT_ID = "${SP_EVENT.id}"`)
    expect(recorder).toContain(`const EVENT_SLUG = "${SP_EVENT.slug}"`)
    for (const key of ["bar-evening", "vestiaire", "accueil-am"]) expect(SP_POSTES.flatMap((p) => p.shifts.map((s) => s.key))).toContain(key)
    expect(spShiftId("bar-evening")).toBe("video-signup-shift-bar-evening")
  })

  test("« Bar » and « Vestiaire » overlap on two postes, so the take can refuse then allow it", () => {
    const shiftOf = (role: string) => SP_POSTES.find((p) => p.roleName === role)!.shifts[0]
    expect([shiftOf("Bar").start, shiftOf("Bar").end]).toEqual([shiftOf("Vestiaire").start, shiftOf("Vestiaire").end])
    expect(SP_POSTES.find((p) => p.roleName === "Bar")!.sector).not.toBe(SP_POSTES.find((p) => p.roleName === "Vestiaire")!.sector)
  })

  test("the tools that film and review it accept it explicitly", () => {
    expect(read("videos/tools/local-production.ts")).toContain('"signup-page-settings"')
    expect(read("videos/tools/audit-audiovisual.ts")).toContain('"EVENT_SIGNUP_PAGE_SETTINGS"')
    expect(read("videos/tools/audit-full-final-audio.ts")).toContain('"EVENT_SIGNUP_PAGE_SETTINGS"')
  })
})

describe("verifySignupSettingsReviewFixture", () => {
  const previous = process.env.DATABASE_URL
  afterEach(() => { process.env.DATABASE_URL = previous })

  const volunteers = Object.entries(SP_PEOPLE).map(([key, firstName]) => ({ id: `video-signup-person-${key}`, email: `video.signup.${key}@example.org`, firstName, lastName: surnameOf(firstName), phone: null }))
  const fixture = (over: Record<string, unknown> = {}) => ({
    slug: "formation-inscription", name: "Association des Vendanges de Montvert",
    admins: [{ id: SP_OWNER.id, email: SP_OWNER.email }],
    volunteers,
    events: [{ id: SP_EVENT.id, slug: SP_EVENT.slug, title: SP_EVENT.title, sectorLeaders: [], sectors: [{ name: "Accueil" }, { name: "Buvette" }],
      shifts: [{ id: "video-signup-shift-bar-evening", eventId: SP_EVENT.id }],
      registrations: [{ eventId: SP_EVENT.id, volunteerId: volunteers[0].id }] }],
    ...over,
  })
  const db = (org: unknown) => ({ organization: { findUniqueOrThrow: async () => org } }) as never

  test("accepts the seeded synthetic organisation on the local video database", async () => {
    process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:45433/benevoles_video"
    await expect(verifySignupSettingsReviewFixture(db(fixture()))).resolves.toBeUndefined()
    for (const v of volunteers) expect(v.email).toMatch(SP_PERSON_EMAIL)
  })

  test("refuses another database, or any member that is not the fixture's", async () => {
    process.env.DATABASE_URL = "postgresql://u:p@db.example.org:5432/benevoles"
    await expect(verifySignupSettingsReviewFixture(db(fixture()))).rejects.toThrow()
    process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:45433/benevoles_video"
    const stranger = { id: "video-signup-person-zoe", email: "zoe@gmail.com", firstName: "Zoé", lastName: surnameOf("Zoé"), phone: null }
    await expect(verifySignupSettingsReviewFixture(db(fixture({ volunteers: [...volunteers.slice(1), stranger] })))).rejects.toThrow()
  })
})
