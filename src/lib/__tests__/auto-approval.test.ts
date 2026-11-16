// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import {
  AUTO_APPROVAL_DAILY_CEILING,
  AUTO_APPROVAL_EXPLANATION,
  EMPTY_AUTO_APPROVAL,
  addCalendarDays,
  autoApprovalActivationCutoff,
  autoApprovalBudgetDay,
  autoApprovalCandidateProblem,
  autoApprovalCounterSentences,
  autoApprovalDayInZone,
  autoApprovalDayLabel,
  autoApprovalEndInstant,
  autoApprovalMaxDay,
  autoApprovalRemainingBudget,
  autoApprovalState,
  autoApprovalStateSentence,
  autoApprovalUntilError,
  autoApprovalView,
  parseAutoApprovalValue,
  type AutoApprovalCandidate,
} from "@/lib/auto-approval"

const ZURICH = "Europe/Zurich"
const on = (until: string, extra: Record<string, unknown> = {}) => ({
  ...EMPTY_AUTO_APPROVAL,
  until,
  activatedAt: "2026-11-01T09:00:00.000Z",
  activatedByLabel: "Opérateur",
  ...extra,
})

describe("autoApprovalState", () => {
  it("is off without a chosen day, or with a value it cannot read", () => {
    expect(autoApprovalState(null, new Date("2026-11-20T12:00:00Z"))).toBe("off")
    expect(autoApprovalState({}, new Date("2026-11-20T12:00:00Z"))).toBe("off")
    expect(autoApprovalState({ until: "2026-02-30" }, new Date("2026-11-20T12:00:00Z"))).toBe("off")
    expect(autoApprovalState("not json", new Date("2026-11-20T12:00:00Z"))).toBe("off")
  })

  it("is on until the very end of the chosen day, then expired", () => {
    // 16 November 2026 is a Monday; Europe/Zurich is UTC+1 then.
    expect(autoApprovalEndInstant("2026-11-16", ZURICH)?.toISOString()).toBe("2026-11-16T23:00:00.000Z")
    const value = on("2026-11-16")
    expect(autoApprovalState(value, new Date("2026-11-16T22:59:59.999Z"), ZURICH)).toBe("on")
    expect(autoApprovalState(value, new Date("2026-11-16T23:00:00.000Z"), ZURICH)).toBe("expired")
    expect(autoApprovalState(value, new Date("2026-11-17T08:00:00.000Z"), ZURICH)).toBe("expired")
  })

  it("is cut off until the chosen day ends, then expired", () => {
    const value = on("2026-11-16", { cutOffAt: "2026-11-16T12:00:00.000Z" })
    expect(autoApprovalState(value, new Date("2026-11-16T12:01:00.000Z"), ZURICH)).toBe("cut_off")
    expect(autoApprovalState(value, new Date("2026-11-16T23:00:00.000Z"), ZURICH)).toBe("expired")
  })

  it("uses the end of the day in the given zone, not UTC midnight", () => {
    const value = on("2026-11-16")
    expect(autoApprovalState(value, new Date("2026-11-17T00:30:00.000Z"), "UTC")).toBe("expired")
    expect(autoApprovalState(value, new Date("2026-11-17T00:30:00.000Z"), "America/New_York")).toBe("on")
    expect(autoApprovalEndInstant("2026-11-16", "America/New_York")?.toISOString()).toBe("2026-11-17T05:00:00.000Z")
  })

  it("keeps the whole day when it is a daylight-saving day", () => {
    // Spring forward: 29 March 2026 is 23 hours long in Zurich.
    expect(autoApprovalEndInstant("2026-03-29", ZURICH)?.toISOString()).toBe("2026-03-29T22:00:00.000Z")
    expect(autoApprovalState(on("2026-03-29"), new Date("2026-03-29T21:59:59.999Z"), ZURICH)).toBe("on")
    expect(autoApprovalState(on("2026-03-29"), new Date("2026-03-29T22:00:00.000Z"), ZURICH)).toBe("expired")
    // Fall back: 25 October 2026 is 25 hours long.
    expect(autoApprovalEndInstant("2026-10-25", ZURICH)?.toISOString()).toBe("2026-10-25T23:00:00.000Z")
    expect(autoApprovalState(on("2026-10-25"), new Date("2026-10-25T22:59:59.999Z"), ZURICH)).toBe("on")
    expect(autoApprovalState(on("2026-10-25"), new Date("2026-10-25T23:00:00.000Z"), ZURICH)).toBe("expired")
  })
})

describe("the chosen end day", () => {
  const now = new Date("2026-11-16T10:00:00Z")

  it("accepts today and today + 30, refuses + 31 and the past", () => {
    expect(autoApprovalDayInZone(now, ZURICH)).toBe("2026-11-16")
    expect(autoApprovalMaxDay(now, ZURICH)).toBe("2026-12-16")
    expect(autoApprovalUntilError("2026-11-16", now, ZURICH)).toBeNull()
    expect(autoApprovalUntilError("2026-12-16", now, ZURICH)).toBeNull()
    expect(autoApprovalUntilError("2026-12-17", now, ZURICH)).toBe("Choisissez une date entre aujourd'hui et le 16 décembre 2026.")
    expect(autoApprovalUntilError("2026-11-15", now, ZURICH)).toBe("Choisissez une date entre aujourd'hui et le 16 décembre 2026.")
  })

  it("names the missing or malformed day", () => {
    expect(autoApprovalUntilError("", now, ZURICH)).toBe("Indiquez une date de fin.")
    expect(autoApprovalUntilError("16/11/2026", now, ZURICH)).toBe("Indiquez une date de fin.")
    expect(autoApprovalUntilError(null, now, ZURICH)).toBe("Indiquez une date de fin.")
  })

  it("counts the operator's day, not the UTC day", () => {
    // 23:30 UTC on the 16th is already the 17th in Zurich.
    expect(autoApprovalDayInZone(new Date("2026-11-16T23:30:00Z"), ZURICH)).toBe("2026-11-17")
    expect(autoApprovalMaxDay(new Date("2026-11-16T23:30:00Z"), ZURICH)).toBe("2026-12-17")
    expect(autoApprovalUntilError("2026-11-16", new Date("2026-11-16T23:30:00Z"), ZURICH)).not.toBeNull()
  })

  it("adds days across month and year boundaries", () => {
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(autoApprovalDayLabel("2026-12-16", ZURICH)).toBe("16 décembre 2026")
  })
})

describe("the daily budget (UTC days)", () => {
  it("rolls over at UTC midnight", () => {
    const value = { ...EMPTY_AUTO_APPROVAL, budgetDate: "2026-11-15", budgetUsed: AUTO_APPROVAL_DAILY_CEILING }
    expect(autoApprovalBudgetDay(new Date("2026-11-15T23:59:59.999Z"))).toBe("2026-11-15")
    expect(autoApprovalRemainingBudget(value, new Date("2026-11-15T23:59:59.999Z"))).toBe(0)
    expect(autoApprovalBudgetDay(new Date("2026-11-16T00:00:00.000Z"))).toBe("2026-11-16")
    expect(autoApprovalRemainingBudget(value, new Date("2026-11-16T00:00:00.000Z"))).toBe(AUTO_APPROVAL_DAILY_CEILING)
  })

  it("subtracts the day's uses and never goes below zero", () => {
    const value = { ...EMPTY_AUTO_APPROVAL, budgetDate: "2026-11-16", budgetUsed: 3 }
    expect(autoApprovalRemainingBudget(value, new Date("2026-11-16T12:00:00Z"))).toBe(17)
    expect(autoApprovalRemainingBudget({ ...value, budgetUsed: 99 }, new Date("2026-11-16T12:00:00Z"))).toBe(0)
  })

  it("starts a new day's budget after a cut-off on the previous day", () => {
    const value = { ...on("2026-11-30"), budgetDate: "2026-11-15", budgetUsed: 20, cutOffAt: "2026-11-15T12:00:00Z" }
    expect(autoApprovalRemainingBudget(value, new Date("2026-11-16T00:00:00Z"))).toBe(20)
  })
})

describe("the view of the section", () => {
  const now = new Date("2026-11-16T10:00:00Z")

  it("renders the state, the counters and the bounds of the date field", () => {
    const view = autoApprovalView(on("2026-11-20", { budgetDate: "2026-11-16", budgetUsed: 3, totalSinceActivation: 12 }), now, ZURICH)
    expect(view.state).toBe("on")
    expect(view.today).toBe("2026-11-16")
    expect(view.maxUntil).toBe("2026-12-16")
    expect(view.maxUntilLabel).toBe("16 décembre 2026")
    expect(autoApprovalStateSentence(view)).toBe("Activée jusqu'au 20 novembre 2026 inclus, par Opérateur le 1 novembre 2026 à 10:00.")
    expect(autoApprovalCounterSentences(view)).toEqual(["Aujourd'hui : 3 sur 20", "Depuis l'activation : 12"])
    expect(view.cutOffNotice).toBeNull()
  })

  it("shows the cut-off notice until it is dismissed, even after a deactivation", () => {
    const cut = { ...on("2026-11-20"), cutOffAt: "2026-11-16T09:30:00.000Z" }
    expect(autoApprovalView(cut, now, ZURICH).cutOffNotice).toMatch(/^Attention : coupée automatiquement le .* : plafond de 20 validations atteint\.$/)
    expect(autoApprovalView({ ...cut, cutOffSeenAt: "2026-11-16T09:40:00.000Z" }, now, ZURICH).cutOffNotice).toBeNull()
    expect(autoApprovalView({ ...cut, until: null }, now, ZURICH).state).toBe("off")
    expect(autoApprovalView({ ...cut, until: null }, now, ZURICH).cutOffNotice).not.toBeNull()
  })

  it("says expired and off in plain words, without counters before the first activation", () => {
    const expired = autoApprovalView({ ...on("2026-11-10") }, now, ZURICH)
    expect(autoApprovalStateSentence(expired)).toBe("Expirée le 10 novembre 2026 : les nouveaux espaces restent en attente jusqu'à votre validation.")
    const off = autoApprovalView(null, now, ZURICH)
    expect(autoApprovalStateSentence(off)).toBe("Désactivée : les nouveaux espaces restent en attente jusqu'à votre validation.")
    expect(autoApprovalCounterSentences(off)).toEqual([])
  })

  it("keeps the operator's explanatory sentence", () => {
    expect(AUTO_APPROVAL_EXPLANATION).toBe(
      "Tant qu'elle est activée, un espace créé par l'inscription est validé tout seul, 5 à 10 minutes après que son responsable a activé son compte, sans aucune vérification. Les espaces déjà en attente vous restent.",
    )
  })
})

describe("eligibility of a space", () => {
  const now = new Date("2026-11-16T10:00:00Z")
  const value = { activatedAt: "2026-11-16T08:00:00.000Z" }
  const base = (): AutoApprovalCandidate => ({
    createdAt: new Date("2026-11-16T09:00:00Z"),
    signupAt: new Date("2026-11-16T09:00:00Z"),
    active: true,
    suspendedAt: null,
    publicationApprovedAt: null,
    outboundEmailApprovedAt: null,
    admins: [{
      email: "sacha.bonvin@example.org",
      createdAt: new Date("2026-11-16T09:00:00Z"),
      isActive: true,
      activatedAt: new Date("2026-11-16T09:30:00Z"),
    }],
  })

  it("accepts a sign-up space created after activation, whose owner activated five minutes ago", () => {
    expect(autoApprovalCandidateProblem(base(), value, now)).toBeNull()
    const exactlyFive = base()
    exactlyFive.admins[0].activatedAt = new Date(now.getTime() - 5 * 60 * 1000)
    expect(autoApprovalCandidateProblem(exactlyFive, value, now)).toBeNull()
  })

  it("excludes a space not created by the self-service sign-up", () => {
    expect(autoApprovalCandidateProblem({ ...base(), signupAt: null }, value, now)).toBe("not_signup")
  })

  it("excludes a space created before the option was turned on", () => {
    expect(autoApprovalCandidateProblem({ ...base(), createdAt: new Date("2026-11-16T07:59:59Z") }, value, now)).toBe("before_activation")
  })

  it("excludes an inactive or suspended space", () => {
    expect(autoApprovalCandidateProblem({ ...base(), active: false }, value, now)).toBe("inactive")
    expect(autoApprovalCandidateProblem({ ...base(), suspendedAt: new Date("2026-11-16T09:10:00Z") }, value, now)).toBe("suspended")
  })

  it("excludes a space already validated", () => {
    const both = base()
    both.publicationApprovedAt = new Date("2026-11-16T09:30:00Z")
    both.outboundEmailApprovedAt = new Date("2026-11-16T09:30:00Z")
    expect(autoApprovalCandidateProblem(both, value, now)).toBe("already_approved")
    // One grant missing is still pending, as before #1371.
    expect(autoApprovalCandidateProblem({ ...both, outboundEmailApprovedAt: null }, value, now)).toBeNull()
  })

  it("excludes a space whose sign-up owner is not active, or has no activation instant", () => {
    const inactive = base()
    inactive.admins[0].isActive = false
    expect(autoApprovalCandidateProblem(inactive, value, now)).toBe("no_active_owner")
    const unknown = base()
    unknown.admins[0].activatedAt = null
    expect(autoApprovalCandidateProblem(unknown, value, now)).toBe("no_active_owner")
    const invitedLater = {
      ...base(),
      admins: [...base().admins, { email: "autre@example.org", createdAt: new Date("2026-11-16T09:40:00Z"), isActive: true, activatedAt: new Date("2026-11-16T09:45:00Z") }],
    }
    expect(autoApprovalCandidateProblem(invitedLater, value, now)).toBeNull()
  })

  it("excludes an owner activated less than five minutes ago", () => {
    const young = base()
    young.admins[0].activatedAt = new Date(now.getTime() - 2 * 60 * 1000)
    expect(autoApprovalCandidateProblem(young, value, now)).toBe("owner_too_young")
    expect(autoApprovalActivationCutoff(now).toISOString()).toBe("2026-11-16T09:55:00.000Z")
  })
})

describe("parseAutoApprovalValue", () => {
  it("fills every default from a partial or hostile value", () => {
    expect(parseAutoApprovalValue(undefined)).toEqual(EMPTY_AUTO_APPROVAL)
    expect(parseAutoApprovalValue({ until: "2026-11-20", budgetUsed: -3, totalSinceActivation: "x" })).toMatchObject({
      until: "2026-11-20", budgetUsed: 0, totalSinceActivation: 0, cutOffAt: null,
    })
    expect(parseAutoApprovalValue({ until: "2026-11-20", cutOffAt: "not a date" }).cutOffAt).toBeNull()
    expect(parseAutoApprovalValue(JSON.stringify({ until: "2026-11-20" })).until).toBe("2026-11-20")
  })
})
