// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { coverageLine, droppedSentence, expiredSentence, LEASE_EXPIRED_SENTENCE, QUEUE_EXPIRED_SENTENCE, fillMissingTargets, formatHours, ANOTHER_HINT, anotherOffer, anotherReplaceRecap, formToConfig, historyEntry, NO_OTHER_SENTENCE, ONLY_ONE_SENTENCE, runLine, sameAsSentence, parseHours, posteChoicesFrom, replacedDraftCount, rotationSummary, runStateLabel, runTone, scopeShiftIds, summaryProblems, withoutProblem, type PageShift, type ProposalForm } from "../proposal-view"

// The page « Proposition d'affectations » (#1172): the form turned into a run's configuration.
const shifts: PageShift[] = [
  { id: "a1", roleName: "Camion 1", date: "2031-07-07", capacity: 3, open: true },
  { id: "a2", roleName: "Camion 1", date: "2031-07-08", capacity: 3, open: true },
  { id: "b1", roleName: "Camion 2", date: "2031-07-07", capacity: 2, open: true },
  { id: "n1", roleName: "Nuit", date: "2031-07-07", capacity: 2, open: true },
  { id: "r1", roleName: "Renfort", date: "2031-07-07", capacity: 1, open: true },
  { id: "old", roleName: "Camion 1", date: "2031-07-01", capacity: 3, open: false },
]
const form = (extra: Partial<ProposalForm> = {}): ProposalForm => ({
  dates: ["2031-07-07"],
  postes: ["Camion 1", "Camion 2", "Nuit", "Renfort"],
  people: [
    { volunteerId: "p1", included: true, targetHours: "12", prefer: "Camion 1", avoid: "" },
    { volunteerId: "p2", included: true, targetHours: "7,5", prefer: "", avoid: "Nuit" },
    { volunteerId: "p3", included: false, targetHours: "", prefer: "", avoid: "" },
  ],
  posteChoices: [
    { roleName: "Camion 1", category: "Camions", night: false, reserve: 0 },
    { roleName: "Camion 2", category: " camions ", night: false, reserve: 0 },
    { roleName: "Nuit", category: "", night: true, reserve: 0 },
    { roleName: "Renfort", category: "", night: false, reserve: 1 },
  ],
  maxConsecutiveDays: "2",
  maxNightAddOns: "2",
  ...extra,
})

describe("form to configuration", () => {
  it("resolves the scope, categories over the whole event, night add-ons, the reserve capped by capacity, targets and wishes", () => {
    const r = formToConfig(form(), shifts)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.config.scope).toEqual({ shiftIds: ["a1", "b1", "n1", "r1"], volunteerIds: ["p1", "p2"] })
    // « Camions » and « camions » are one category, with every shift of both postes, in scope or not.
    expect(r.config.categories).toEqual([{ key: "c1", name: "Camions", shiftIds: ["a1", "a2", "b1", "old"] }])
    expect(r.config.nightShiftIds).toEqual(["n1"])
    expect(r.config.reserve).toEqual([{ shiftId: "r1", count: 1 }])
    expect(r.config.rotation).toEqual({ maxConsecutiveDays: 2, maxNightAddOns: 2 })
    expect(r.config.preferences).toEqual([{ volunteerId: "p1", prefer: ["Camion 1"], avoid: [] }, { volunteerId: "p2", prefer: [], avoid: ["Nuit"] }])
    // No seed from the page: the server gives a first proposal its fixed seed.
    expect(r.config).not.toHaveProperty("seed")
    expect(r.targets).toEqual([{ volunteerId: "p1", targetMinutes: 720 }, { volunteerId: "p2", targetMinutes: 450 }])
  })

  it("lists every problem with the field to fix", () => {
    const r = formToConfig(form({ dates: [], maxConsecutiveDays: "0", people: [{ volunteerId: "p1", included: true, targetHours: "beaucoup", prefer: "Nuit", avoid: "Nuit" }] }), shifts)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problems.map((p) => p.field)).toEqual(["proposal-dates", "target-p1", "avoid-p1", "proposal-consecutive"])
    expect(formToConfig(form({ people: [] }), shifts)).toMatchObject({ ok: false, problems: [{ field: "proposal-people" }] })
    expect(formToConfig(form({ dates: ["2031-07-01"] }), shifts)).toMatchObject({ ok: false, problems: [{ field: "proposal-postes", message: expect.stringContaining("Aucun créneau") }] })
  })

  it("names the person in each message, and checks the reserve against the poste's capacity", () => {
    const r = formToConfig(form({ people: [{ volunteerId: "p1", included: true, targetHours: "?", prefer: "", avoid: "" }], posteChoices: [{ roleName: "Renfort", category: "", night: false, reserve: 2 }, { roleName: "Nuit", category: "", night: false, reserve: 0, reserveText: "deux" }] }), shifts, (id) => (id === "p1" ? "Léa Favre" : ""))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problems).toEqual([
      { field: "target-p1", message: "Léa Favre : indiquez un objectif en heures (0 pour aucun objectif), par exemple 12 ou 7,5." },
      { field: "reserve-0", message: "Renfort : indiquez une réserve entre 0 et 1." },
      { field: "reserve-1", message: "Nuit : indiquez une réserve entre 0 et 2." },
    ])
  })

  it("allows no rotation limit (empty fields)", () => {
    const r = formToConfig(form({ maxConsecutiveDays: "", maxNightAddOns: "" }), shifts)
    expect(r.ok && r.config.rotation).toEqual({ maxConsecutiveDays: null, maxNightAddOns: null })
  })

  it("prefills poste choices from a previous run", () => {
    const r = formToConfig(form(), shifts)
    if (!r.ok) throw new Error("form")
    expect(posteChoicesFrom(r.config, shifts, ["Camion 1", "Camion 2", "Nuit", "Renfort", "Nouveau"])).toEqual([
      { roleName: "Camion 1", category: "Camions", night: false, reserve: 0 },
      { roleName: "Camion 2", category: "Camions", night: false, reserve: 0 },
      { roleName: "Nuit", category: "", night: true, reserve: 0 },
      { roleName: "Renfort", category: "", night: false, reserve: 1 },
      { roleName: "Nouveau", category: "", night: false, reserve: 0 },
    ])
    expect(posteChoicesFrom(null, shifts, ["Nuit"])).toEqual([{ roleName: "Nuit", category: "", night: false, reserve: 0 }])
  })
})

describe("helpers", () => {
  it("reads and writes hours in French", () => {
    expect(parseHours("7,5")).toBe(450)
    expect(parseHours(" 12 ")).toBe(720)
    expect(parseHours("0")).toBe(0)
    expect(parseHours("-1")).toBeNull()
    expect(parseHours("")).toBeNull()
    expect(parseHours("800")).toBeNull()
    expect(formatHours(450)).toBe("7,5")
    expect(formatHours(360)).toBe("6")
    expect(formatHours(20)).toBe("0,33")
  })

  it("keeps only open shifts in the scope", () => {
    expect(scopeShiftIds(shifts, ["2031-07-01", "2031-07-08"], ["Camion 1"])).toEqual(["a2"])
  })

  it("names the states and the drops", () => {
    expect(runStateLabel({ status: "queued", outcome: null })).toBe("En attente")
    expect(runStateLabel({ status: "running", outcome: null })).toBe("Calcul en cours")
    expect(runStateLabel({ status: "interrupted", outcome: "complete" })).toBe("Calcul arrêté avant la fin")
    expect(runStateLabel({ status: "interrupted", outcome: null, stopReason: "lease_expired" })).toBe("Calcul arrêté avant la fin")
    expect(runStateLabel({ status: "interrupted", outcome: null, stopReason: "queue_expired" })).toBe("Calcul non démarré")
    expect(historyEntry({ ordinal: 2, status: "interrupted", outcome: null, stopReason: "queue_expired", writtenAt: null, writtenCount: 0 }, "31 octobre")).toMatch(/calcul non démarré/)
    expect(expiredSentence("lease_expired")).toBe(LEASE_EXPIRED_SENTENCE)
    expect(expiredSentence("queue_expired")).toBe(QUEUE_EXPIRED_SENTENCE)
    expect(expiredSentence("cancelled")).toBeNull()
    expect(expiredSentence(null)).toBeNull()
    expect(runStateLabel({ status: "finished", outcome: "complete" })).toBe("Toutes les places couvertes")
    expect(runStateLabel({ status: "finished", outcome: "incomplete" })).toBe("Couverture partielle")
    expect(runStateLabel({ status: "finished", outcome: "proven_impossible" })).toBe("Couverture complète impossible")
    expect(runStateLabel({ status: "failed", outcome: null })).toBe("Échec du calcul")
    expect(droppedSentence([])).toBeNull()
    expect(droppedSentence([{ reason: "availability" }, { reason: "capacity" }, { reason: "availability" }])).toBe("3 affectations écartées à l'écriture, les données ayant changé pendant le calcul : disponibilités changées (2), plus de place (1).")
  })
})

describe("outcome wording (#1172 review)", () => {
  const states = [
    { status: "queued", outcome: null }, { status: "running", outcome: null }, { status: "failed", outcome: null },
    { status: "interrupted", outcome: "incomplete" }, { status: "finished", outcome: "complete" },
    { status: "finished", outcome: "incomplete" }, { status: "finished", outcome: "proven_impossible" },
  ]

  it("never uses solver words in any state", () => {
    for (const r of states) expect(runStateLabel(r)).not.toMatch(/démontr|impossible démontré|recherche|graine|budget|incomplet\b/i)
  })

  it("keeps red for a real failure only; a proven maximum is neutral, partial coverage amber", () => {
    expect(states.map(runTone)).toEqual(["neutral", "neutral", "error", "warning", "complete", "warning", "neutral"])
  })

  it("leads with the coverage and names the history entries apart", () => {
    expect(coverageLine({ filled: 29, seats: 31 })).toBe("29 places couvertes sur 31")
    expect(coverageLine({ filled: 1, seats: 1 })).toBe("1 place couverte sur 1")
    // Runs are told apart by their ordinal, never by a draw number (owner decision 2026-10-31).
    const base = { ordinal: 3, status: "finished", outcome: "proven_impossible", writtenAt: new Date(), writtenCount: 29, coverage: { filled: 29, seats: 31 } }
    expect(historyEntry(base, "30 octobre à 22:59")).toBe("Proposition 3, 30 octobre à 22:59\u00a0: couverture complète impossible, 29 places couvertes sur 31, 29 affectations écrites")
    expect(historyEntry({ ...base, ordinal: 1, writtenAt: null, coverage: null, status: "failed", outcome: null }, "1 mai à 10:00")).toBe("Proposition 1, 1 mai à 10:00\u00a0: échec du calcul, rien d'écrit")
    expect(historyEntry(base, "x")).not.toMatch(/tirage|graine|seed/i)
    expect(runLine(3, "31 octobre à 14:05")).toBe("Proposition 3, lancée le 31 octobre à 14:05.")
  })
})

describe("« Proposer une autre répartition » (owner decision 2026-10-31)", () => {
  const finished = { status: "finished", stale: [] as string[], report: {} }

  it("is offered on a finished run with a report, whatever its coverage", () => {
    expect(anotherOffer(finished)).toBe("button")
    expect(anotherOffer({ ...finished, report: { onlyOne: false } })).toBe("button")
    for (const status of ["queued", "running", "interrupted", "failed"]) expect(anotherOffer({ ...finished, status })).toBeNull()
    expect(anotherOffer({ ...finished, report: null })).toBeNull()
  })

  it("says plainly that no other assignment covers as many seats when the search proved it, unless the data changed since", () => {
    expect(anotherOffer({ ...finished, report: { onlyOne: true } })).toBe("only_one")
    expect(anotherOffer({ ...finished, report: { onlyOne: true }, stale: ["availability"] })).toBe("button")
    expect(ONLY_ONE_SENTENCE).toBe("Aucune autre répartition ne peut couvrir autant de places avec ces données et ces règles.")
  })

  it("explains itself in one line and names the earlier proposal it found again", () => {
    expect(ANOTHER_HINT).toBe("Même périmètre et mêmes réglages\u00a0: rechercher une autre répartition, si elle existe.")
    expect(sameAsSentence(2)).toBe("Aucune autre répartition trouvée\u00a0: cette recherche a retrouvé la même répartition que la proposition 2.")
  })

  it("says plainly when nothing different was found, keeps the drafts and still offers to try again", () => {
    const none = { status: "finished", outcome: null, stopReason: "no_other" }
    expect(runStateLabel(none)).toBe("Aucune autre répartition")
    expect(runTone(none)).toBe("neutral")
    expect(anotherOffer({ ...none, stale: [], report: null })).toBe("button")
    expect(NO_OTHER_SENTENCE).toBe("Aucune autre répartition trouvée avec ces données et ces réglages. Vos brouillons n'ont pas changé.")
    expect(historyEntry({ ...none, ordinal: 4, writtenAt: null, writtenCount: 0, coverage: null }, "1 mai à 10:00")).toBe("Proposition 4, 1 mai à 10:00\u00a0: aucune autre répartition, rien d'écrit")
  })

  it("asks before replacing proposed drafts, with its own words", () => {
    const one = anotherReplaceRecap(1, 3)
    expect(one.title).toBe("Remplacer 1 brouillon proposé\u00a0?")
    expect(one.lead).toBe("Si une autre répartition est trouvée, elle remplace le brouillon proposé non verrouillé de ce périmètre. Sinon, rien ne change.")
    expect(one.lines[0]).toBe("La proposition 3 reste consultable dans Propositions précédentes.")
    expect(one.confirmLabel).toBe("Remplacer et proposer")
    expect(anotherReplaceRecap(29, 1).title).toBe("Remplacer 29 brouillons proposés\u00a0?")
    expect(anotherReplaceRecap(29, 1).lead).toContain("les 29 brouillons proposés non verrouillés")
  })
})

describe("missing hour targets (#1172 review)", () => {
  const people = [
    { volunteerId: "p1", included: true, targetHours: "", prefer: "", avoid: "" },
    { volunteerId: "p2", included: true, targetHours: " ", prefer: "", avoid: "" },
    { volunteerId: "p3", included: true, targetHours: "beaucoup", prefer: "", avoid: "" },
    { volunteerId: "p4", included: false, targetHours: "", prefer: "", avoid: "" },
    { volunteerId: "p5", included: true, targetHours: "4", prefer: "", avoid: "" },
  ]

  it("tells an empty target from a malformed one, and collapses empty ones into one summary item", () => {
    const r = formToConfig(form({ people }), shifts, (id) => id.toUpperCase())
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problems.filter((p) => p.kind === "target_missing").map((p) => p.field)).toEqual(["target-p1", "target-p2"])
    const items = summaryProblems(r.problems)
    expect(items.map((i) => i.message)).toEqual(["2 personnes sans objectif d'heures", "P3 : indiquez un objectif en heures (0 pour aucun objectif), par exemple 12 ou 7,5."])
    expect(items[0]).toMatchObject({ field: "target-p1", missingTargets: 2 })
  })

  it("keeps a single missing target as its own named item", () => {
    const r = formToConfig(form({ people: [people[0], people[4]] }), shifts, () => "Noah De Jong")
    if (r.ok) throw new Error("expected problems")
    expect(summaryProblems(r.problems).map((i) => i.message)).toEqual(["Noah De Jong : indiquez un objectif en heures (0 pour aucun objectif), par exemple 12 ou 7,5."])
  })

  it("fills the suggestion only where an included person has no target, never over a typed value", () => {
    const r = fillMissingTargets(people, () => 720)
    expect(r.filled).toBe(2)
    expect(r.people.map((p) => p.targetHours)).toEqual(["12", "12", "beaucoup", "", "4"])
  })

  it("clears only the fixed field's problem", () => {
    const problems = [{ field: "a", message: "x" }, { field: "b", message: "y" }]
    expect(withoutProblem(problems, "a")).toEqual([{ field: "b", message: "y" }])
    expect(withoutProblem(problems, "c")).toEqual(problems)
  })
})

describe("folded settings and relaunch (#1172 review)", () => {
  const choices = [
    { roleName: "A", category: "", night: false, reserve: 0 },
    { roleName: "B", category: "", night: false, reserve: 0 },
  ]

  it("sums up « Rotation, nuit et réserve » in one line", () => {
    expect(rotationSummary(choices, "", "")).toBe("Aucun réglage")
    expect(rotationSummary([{ ...choices[0], category: "Bars", night: true }, { ...choices[1], category: "bars", reserve: 1 }], "2", "1"))
      .toBe("Catégorie sur 2 postes, ajout de nuit sur 1 poste, réserve sur 1 poste, 2 jours d'affilée au plus, 1 ajout de nuit par personne au plus")
  })

  it("counts the proposed drafts a relaunch would replace, on the scope's shifts only", () => {
    expect(replacedDraftCount({ a1: 2, b1: 1, a2: 5 }, ["a1", "b1", "n1"])).toBe(3)
    expect(replacedDraftCount({}, ["a1"])).toBe(0)
  })
})
