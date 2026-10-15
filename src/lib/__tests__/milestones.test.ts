import { describe, it, expect } from "vitest"
import {
  daysUntilDue, dueDateInputValue, eligibleOwnerWhere, isEligibleMilestoneOwner, isMilestoneOverdue, milestoneChanges,
  milestoneReminderDue, ownerOptionLabel, ownerOptions, replaceMilestone, sortMilestones, validateMilestoneInput,
} from "../milestones"

describe("validateMilestoneInput (#989)", () => {
  it("accepts a title and a date, and trims the title", () => {
    expect(validateMilestoneInput({ title: "  Fermer les inscriptions ", dueDate: "2026-09-20" }))
      .toEqual({ ok: true, value: { title: "Fermer les inscriptions", dueDate: "2026-09-20" } })
  })

  it("asks for the title first, even when the date is missing too", () => {
    expect(validateMilestoneInput({ title: "   ", dueDate: "" }))
      .toEqual({ ok: false, field: "title", message: "Indiquez le titre du jalon." })
  })

  it("asks for the due date when it is empty or not a date", () => {
    for (const dueDate of ["", "20.09.2026", "2026-13-45"]) {
      expect(validateMilestoneInput({ title: "Rappels", dueDate }))
        .toEqual({ ok: false, field: "dueDate", message: "Indiquez l'échéance." })
    }
  })

  it("refuses a title longer than the API allows", () => {
    const result = validateMilestoneInput({ title: "a".repeat(141), dueDate: "2026-09-20" })
    expect(result).toMatchObject({ ok: false, field: "title" })
    expect(validateMilestoneInput({ title: "a".repeat(140), dueDate: "2026-09-20" }).ok).toBe(true)
  })

  it("accepts a past date, as the API does", () => {
    expect(validateMilestoneInput({ title: "Commander les t-shirts", dueDate: "2020-01-01" }).ok).toBe(true)
  })
})

describe("dueDateInputValue", () => {
  it("gives back the day stored at midnight UTC", () => {
    expect(dueDateInputValue("2026-09-20T00:00:00.000Z")).toBe("2026-09-20")
  })

  it("is empty for a value that is not a date", () => {
    expect(dueDateInputValue("pas une date")).toBe("")
  })
})

describe("milestoneChanges", () => {
  const before = { title: "Fermer les inscriptions", dueDate: "2026-09-20T00:00:00.000Z" }

  it("sends only the changed fields", () => {
    expect(milestoneChanges(before, { title: "Fermer les inscriptions", dueDate: "2026-09-25" })).toEqual({ dueDate: "2026-09-25" })
    expect(milestoneChanges(before, { title: "Clore les inscriptions", dueDate: "2026-09-20" })).toEqual({ title: "Clore les inscriptions" })
  })

  it("is empty when nothing changed", () => {
    expect(milestoneChanges(before, { title: "Fermer les inscriptions", dueDate: "2026-09-20" })).toEqual({})
  })
})

describe("sortMilestones / replaceMilestone", () => {
  const list = [
    { id: "a", title: "A", dueDate: "2026-09-01T00:00:00.000Z" },
    { id: "b", title: "B", dueDate: "2026-09-10T00:00:00.000Z" },
    { id: "c", title: "C", dueDate: "2026-09-20T00:00:00.000Z" },
  ]

  it("moves an edited milestone to its new place by due date", () => {
    const moved = replaceMilestone(list, { id: "a", title: "A", dueDate: "2026-09-15T00:00:00.000Z" })
    expect(moved.map((m) => m.id)).toEqual(["b", "a", "c"])
  })

  it("keeps the order of milestones on the same day and does not mutate the list", () => {
    const sameDay = [...list, { id: "d", title: "D", dueDate: "2026-09-10T00:00:00.000Z" }]
    expect(sortMilestones(sameDay).map((m) => m.id)).toEqual(["a", "b", "d", "c"])
    const renamed = replaceMilestone(list, { id: "b", title: "B2", dueDate: "2026-09-10T00:00:00.000Z" })
    expect(renamed.map((m) => m.title)).toEqual(["A", "B2", "C"])
    expect(list[1].title).toBe("B")
  })
})

describe("milestone owner (#985)", () => {
  it("sends the owner as an id, or null for « Aucun », and leaves it out when not asked", () => {
    expect(validateMilestoneInput({ title: "Tente", dueDate: "2026-09-20", ownerId: "a-1" }))
      .toEqual({ ok: true, value: { title: "Tente", dueDate: "2026-09-20", ownerId: "a-1" } })
    expect(validateMilestoneInput({ title: "Tente", dueDate: "2026-09-20", ownerId: "" }))
      .toEqual({ ok: true, value: { title: "Tente", dueDate: "2026-09-20", ownerId: null } })
    expect(validateMilestoneInput({ title: "Tente", dueDate: "2026-09-20" }))
      .toEqual({ ok: true, value: { title: "Tente", dueDate: "2026-09-20" } })
  })

  it("puts the owner in the PATCH only when it changed", () => {
    const before = { title: "Tente", dueDate: "2026-09-20T00:00:00.000Z", ownerId: "a-1" }
    expect(milestoneChanges(before, { title: "Tente", dueDate: "2026-09-20", ownerId: "a-1" })).toEqual({})
    expect(milestoneChanges(before, { title: "Tente", dueDate: "2026-09-20", ownerId: null })).toEqual({ ownerId: null })
    expect(milestoneChanges({ ...before, ownerId: null }, { title: "Tente", dueDate: "2026-09-20", ownerId: "a-2" })).toEqual({ ownerId: "a-2" })
    expect(milestoneChanges({ title: "Tente", dueDate: before.dueDate }, { title: "Tente", dueDate: "2026-09-20", ownerId: null })).toEqual({})
  })

  it("accepts only an active admin account of the same organisation", () => {
    expect(isEligibleMilestoneOwner({ organizationId: "org-a", isActive: true }, "org-a")).toBe(true)
    expect(isEligibleMilestoneOwner({ organizationId: "org-b", isActive: true }, "org-a")).toBe(false)
    expect(isEligibleMilestoneOwner({ organizationId: "org-a", isActive: false }, "org-a")).toBe(false)
    expect(isEligibleMilestoneOwner({ organizationId: null, isActive: true }, "org-a")).toBe(false)
    expect(isEligibleMilestoneOwner(null, "org-a")).toBe(false)
    expect(eligibleOwnerWhere("org-a")).toEqual({ organizationId: "org-a", isActive: true })
  })

  it("lists the team by name and keeps a deactivated current owner at the end", () => {
    const team = [{ id: "s", name: "Samira" }, { id: "c", name: "colette" }, { id: "e", name: "Élodie" }]
    expect(ownerOptions(team).map((o) => o.name)).toEqual(["colette", "Élodie", "Samira"])
    expect(ownerOptions(team, { id: "s", name: "Samira" })).toHaveLength(3)
    const withGone = ownerOptions(team, { id: "g", name: "Léa" })
    expect(withGone.at(-1)).toEqual({ id: "g", name: "Léa", inactive: true })
    expect(ownerOptionLabel(withGone.at(-1)!)).toBe("Léa (compte désactivé)")
    expect(ownerOptionLabel(withGone[0])).toBe("colette")
  })
})

describe("due day in the organisation's zone (#985)", () => {
  const due = "2026-09-20T00:00:00.000Z"
  // 23:30 on 20 September in Zurich; 00:30 on 21 September there.
  const lastMinute = new Date("2026-09-20T21:30:00Z")
  const nextDay = new Date("2026-09-20T22:30:00Z")

  it("is late only once the due day is over there, the same on every screen", () => {
    expect(isMilestoneOverdue({ dueDate: due, done: false }, lastMinute, "Europe/Zurich")).toBe(false)
    expect(isMilestoneOverdue({ dueDate: due, done: false }, nextDay, "Europe/Zurich")).toBe(true)
    // Still the 20th in New York at that instant.
    expect(isMilestoneOverdue({ dueDate: new Date(due), done: false }, nextDay, "America/New_York")).toBe(false)
    // Midnight UTC of the due day no longer counts as late.
    expect(isMilestoneOverdue({ dueDate: due, done: false }, new Date("2026-09-20T08:00:00Z"), "UTC")).toBe(false)
  })

  it("is never late once done", () => {
    expect(isMilestoneOverdue({ dueDate: due, done: true }, nextDay, "Europe/Zurich")).toBe(false)
  })

  it("counts whole days to the due day", () => {
    expect(daysUntilDue(due, new Date("2026-09-17T10:00:00Z"), "Europe/Zurich")).toBe(3)
    expect(daysUntilDue(due, lastMinute, "Europe/Zurich")).toBe(0)
    expect(daysUntilDue(due, nextDay, "Europe/Zurich")).toBe(-1)
  })

  it("reminds the owner from three days before until the due day, once, if not done", () => {
    const m = { dueDate: due, done: false, ownerId: "a-1", ownerRemindedAt: null }
    const at = (iso: string) => milestoneReminderDue(m, new Date(iso), "Europe/Zurich")
    expect(at("2026-09-16T10:00:00Z")).toBe(false) // 4 days before
    expect(at("2026-09-17T10:00:00Z")).toBe(true)
    expect(at("2026-09-20T10:00:00Z")).toBe(true)
    expect(at("2026-09-21T10:00:00Z")).toBe(false) // already late
    const now = new Date("2026-09-18T10:00:00Z")
    expect(milestoneReminderDue({ ...m, ownerId: null }, now, "Europe/Zurich")).toBe(false)
    expect(milestoneReminderDue({ ...m, done: true }, now, "Europe/Zurich")).toBe(false)
    expect(milestoneReminderDue({ ...m, ownerRemindedAt: new Date() }, now, "Europe/Zurich")).toBe(false)
  })
})
