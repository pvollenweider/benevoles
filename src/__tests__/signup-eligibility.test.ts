// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it, vi } from "vitest"
import {
  answersRefusal,
  existingOverlapRefusal,
  findOverlap,
  fullShift,
  fullShiftRefusal,
  minimumAgeRefusal,
  overlapWithExisting,
  registrationWindowRefusal,
  requiredPhoneRefusal,
  reservedRoleRefusal,
  selectionOverlapRefusal,
} from "@/lib/signup-eligibility"
import { checkAnswers } from "@/lib/event-questions"

const org = { timeZone: "Europe/Zurich" }
const day = new Date("2026-07-14T00:00:00Z")
const slot = <T extends object = object>(label: string, startTime: string, endTime: string, extra?: T) => ({ label, date: day, startTime, endTime, ...extra }) as { label: string; date: Date; startTime: string; endTime: string } & T

describe("registrationWindowRefusal", () => {
  it("lets an open window through", () => {
    expect(registrationWindowRefusal({ registrationsOpen: true, organization: org })).toBeNull()
    expect(registrationWindowRefusal({ registrationClosesAt: new Date(Date.now() + 86_400_000), organization: org })).toBeNull()
  })

  it("refuses with 409 when registrations are closed, not yet open or ended", () => {
    for (const w of [
      { registrationsOpen: false },
      { registrationOpensAt: new Date(Date.now() + 86_400_000) },
      { registrationClosesAt: new Date(Date.now() - 86_400_000) },
    ]) {
      const r = registrationWindowRefusal({ ...w, organization: org })
      expect(r?.status).toBe(409)
      expect(r?.body.error).toEqual(expect.any(String))
      expect(r?.body.error.length).toBeGreaterThan(0)
    }
  })

  it("treats the event as published whatever its row says (the route loads published events only)", () => {
    expect(registrationWindowRefusal({ publicStatus: "draft", organization: org } as never)).toBeNull()
  })
})

describe("requiredPhoneRefusal", () => {
  it("requires a non-blank phone only when the event asks for it", () => {
    expect(requiredPhoneRefusal(false, undefined)).toBeNull()
    expect(requiredPhoneRefusal(true, "079 123 45 67")).toBeNull()
    for (const phone of [undefined, "", "   "]) {
      expect(requiredPhoneRefusal(true, phone)).toEqual({ status: 400, body: { error: "Le téléphone est obligatoire pour cet événement." } })
    }
  })
})

describe("fullShiftRefusal", () => {
  const s = (id: string, capacity: number, taken: number, waitlistEnabled = false) => ({ id, label: `Créneau ${id}`, capacity, waitlistEnabled, registrations: Array(taken).fill({}) })

  it("lets free shifts and full shifts with a waitlist through", () => {
    expect(fullShiftRefusal([s("a", 2, 1), s("b", 1, 1, true)])).toBeNull()
  })

  it("refuses the first full shift without a waitlist with 409 and its id", () => {
    expect(fullShiftRefusal([s("a", 2, 1), s("b", 1, 1), s("c", 1, 2)])).toEqual({
      status: 409,
      body: { error: `Le créneau "Créneau b" est complet. Recharge la page.`, fullShiftId: "b" },
    })
    expect(fullShift("x", "X")).toEqual({ status: 409, body: { error: `Le créneau "X" est complet. Recharge la page.`, fullShiftId: "x" } })
  })
})

describe("selectionOverlapRefusal", () => {
  it("lets back-to-back shifts through", () => {
    expect(selectionOverlapRefusal([slot("A", "08:00", "10:00"), slot("B", "10:00", "12:00")])).toBeNull()
  })

  it("refuses two asked shifts that overlap with 400, naming both", () => {
    expect(selectionOverlapRefusal([slot("A", "08:00", "10:00"), slot("B", "12:00", "14:00"), slot("C", "09:00", "11:00")])).toEqual({
      status: 400,
      body: { error: `Les créneaux "A" et "C" se chevauchent.` },
    })
  })
})

describe("existingOverlapRefusal", () => {
  it("lets a sign-up that overlaps none of the volunteer's registrations through", () => {
    expect(existingOverlapRefusal([{ shift: slot("Déjà", "14:00", "16:00") }], [slot("A", "08:00", "10:00")])).toBeNull()
    expect(existingOverlapRefusal([], [slot("A", "08:00", "10:00")])).toBeNull()
  })

  it("refuses with 409 naming the registration it overlaps", () => {
    const existing = [{ shift: slot("Matin", "07:00", "08:00") }, { shift: slot("Déjà", "09:00", "11:00") }]
    expect(findOverlap(existing, [slot("A", "10:00", "12:00")])).toEqual({ label: "Déjà" })
    expect(existingOverlapRefusal(existing, [slot("A", "10:00", "12:00")])).toEqual({
      status: 409,
      body: { error: "Ce créneau chevauche une inscription existante (Déjà)." },
    })
    expect(overlapWithExisting("Déjà")).toEqual(existingOverlapRefusal(existing, [slot("A", "10:00", "12:00")]))
  })
})

describe("reservedRoleRefusal", () => {
  const reserved = new Map([["Sécurité", ["secouriste"]]])
  const member = (over: object = {}) => ({ volunteer: { email: "ana@example.org", tags: ["Secouriste"], active: true, ...over } })

  it("does not even load the invitation when no reserved role is asked", async () => {
    const loadInvite = vi.fn()
    expect(await reservedRoleRefusal({ shifts: [{ roleName: "Bar" }], reserved, email: "ana@example.org", loadInvite })).toBeNull()
    expect(loadInvite).not.toHaveBeenCalled()
  })

  it("lets an invited, active member with the tag take the role", async () => {
    const r = await reservedRoleRefusal({ shifts: [{ roleName: "Sécurité" }, { roleName: "Bar" }], reserved, email: "ana@example.org", loadInvite: async () => member({ email: "Ana@Example.org" }) })
    expect(r).toBeNull()
  })

  it("refuses with 403 without a valid invitation for this email", async () => {
    const noInvite = { status: 403, body: { error: expect.stringContaining("membres invités"), reservedRole: "Sécurité" } }
    for (const invite of [null, member({ email: "other@example.org" }), member({ active: false })]) {
      expect(await reservedRoleRefusal({ shifts: [{ roleName: "Sécurité" }], reserved, email: "ana@example.org", loadInvite: async () => invite })).toEqual(noInvite)
    }
  })

  it("refuses with 403 an invited member without the tag", async () => {
    const r = await reservedRoleRefusal({ shifts: [{ roleName: "Sécurité" }], reserved, email: "ana@example.org", loadInvite: async () => member({ tags: ["cuisine"] }) })
    expect(r).toEqual({ status: 403, body: { error: expect.stringContaining("ton invitation n'y donne pas accès"), reservedRole: "Sécurité" } })
  })
})

describe("answersRefusal", () => {
  const questions = [
    { id: "q1", label: "Taille de t-shirt", type: "single", options: ["S", "M"], required: true },
    { id: "q2", label: "Remarque", type: "text", options: [], required: false },
  ]

  it("lets valid answers through", () => {
    expect(answersRefusal(checkAnswers(questions, { q1: "M" }))).toBeNull()
  })

  it("refuses with 400, the joined messages and the questions in error", () => {
    const check = checkAnswers(questions, {})
    expect(check.ok).toBe(false)
    if (check.ok) return
    expect(answersRefusal(check)).toEqual({
      status: 400,
      body: { error: check.errors.map((e) => e.message).join(" "), questionIds: ["q1"], questionErrors: check.errors },
    })
  })
})

describe("minimumAgeRefusal", () => {
  const shifts = [slot("Bar", "18:00", "22:00", { minAge: 18 as number | null }), slot("Accueil", "10:00", "12:00", { minAge: null as number | null })]

  it("asks nothing when no shift is age-gated", () => {
    expect(minimumAgeRefusal([slot("Accueil", "10:00", "12:00", { minAge: null as number | null })], undefined)).toBeNull()
  })

  it("requires a birth date with 400, listing the gated shifts", () => {
    expect(minimumAgeRefusal(shifts, undefined)).toEqual({ status: 400, body: { error: "Date de naissance requise pour : Bar (18 ans min.)." } })
  })

  it("refuses with 403 a volunteer too young on the shift's day", () => {
    expect(minimumAgeRefusal(shifts, "2010-01-01")).toEqual({ status: 403, body: { error: "Âge minimum non atteint pour : Bar (18 ans min.)." } })
  })

  it("lets an old enough volunteer through", () => {
    expect(minimumAgeRefusal(shifts, "2000-01-01")).toBeNull()
  })
})
