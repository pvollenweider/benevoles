import { describe, it, expect } from "vitest"
import {
  answerChangeAudience, answerChangeGroupKey, answerChangeItem, answerChangeLog, answerChangeMergeKey, answerChanges,
  answersClosedText, answersEditState, mergeAnswerChangeItems, type AnswerChangeItem,
} from "../answer-changes"
import { describeChanges, describeEntry } from "../event-log-narrative"

// A volunteer changing their answers from the personal page (#984, part 2).

const TZ = "Europe/Zurich"
// Sat 4 July 2026, 10:00–12:00 in Zurich (08:00 UTC).
const shift = { date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00" }
const later = { date: new Date("2026-07-05T00:00:00Z"), startTime: "10:00", endTime: "12:00" }

describe("answersEditState: the withdrawals' lock", () => {
  it("open while a shift has not started, without an earlier deadline", () => {
    expect(answersEditState({ registrations: [{ status: "active", shift }], timeZone: TZ, now: new Date("2026-07-04T07:59:00Z") })).toEqual({ allowed: true })
  })

  it("closed once the shift started, then once it is over", () => {
    expect(answersEditState({ registrations: [{ status: "active", shift }], timeZone: TZ, now: new Date("2026-07-04T08:00:00Z") })).toEqual({ allowed: false, reason: "started" })
    expect(answersEditState({ registrations: [{ status: "active", shift }], timeZone: TZ, now: new Date("2026-07-04T10:00:00Z") })).toEqual({ allowed: false, reason: "ended" })
  })

  it("closed past the event's earlier deadline for a confirmed place, open for a waitlist entry", () => {
    const setting = { cancelDeadlineDays: 2 }
    const now = new Date("2026-07-03T08:00:00Z")
    expect(answersEditState({ registrations: [{ status: "active", shift }], setting, timeZone: TZ, now })).toEqual({ allowed: false, reason: "deadline" })
    expect(answersEditState({ registrations: [{ status: "waiting", shift }], setting, timeZone: TZ, now })).toEqual({ allowed: true })
  })

  it("open while any registration can still be withdrawn", () => {
    const now = new Date("2026-07-04T11:00:00Z")
    expect(answersEditState({ registrations: [{ status: "active", shift }, { status: "active", shift: later }], timeZone: TZ, now })).toEqual({ allowed: true })
  })

  it("names a shift under way before the deadline of another, and closes without registration", () => {
    const now = new Date("2026-07-04T09:00:00Z")
    expect(answersEditState({ registrations: [{ status: "active", shift }, { status: "active", shift: later }], setting: { cancelDeadlineDays: 2 }, timeZone: TZ, now })).toEqual({ allowed: false, reason: "started" })
    expect(answersEditState({ registrations: [], timeZone: TZ, now })).toEqual({ allowed: false, reason: "ended" })
  })

  it("says why in the volunteer's voice", () => {
    expect(answersClosedText("deadline")).toMatch(/^Tu ne peux plus modifier tes réponses en ligne : le délai/)
    expect(answersClosedText("started")).toContain("ta mission a commencé")
    expect(answersClosedText("ended")).toContain("l'événement est terminé")
  })
})

describe("answerChanges", () => {
  const questions = [
    { id: "meal", label: "Repas ?", answers: [{ values: ["Oui"] }] },
    { id: "size", label: "Taille ?", answers: [] },
    { id: "car", label: "Transport ?", answers: [{ values: ["Voiture", "Vélo"] }] },
    { id: "note", label: "Remarque ?", answers: [{ values: ["Rien"] }] },
  ]

  it("keeps only the questions sent whose answer differs, in form order", () => {
    const values = new Map([["size", ["M"]], ["meal", ["Non"]], ["car", ["Voiture", "Vélo"]]])
    expect(answerChanges(questions, new Set(["meal", "size", "car", "note"]), values)).toEqual([
      { questionId: "meal", label: "Repas ?", from: ["Oui"], to: ["Non"] },
      { questionId: "size", label: "Taille ?", from: [], to: ["M"] },
      // Sent empty: cleared.
      { questionId: "note", label: "Remarque ?", from: ["Rien"], to: [] },
    ])
  })

  it("leaves a question that was not sent as it is, and finds nothing when nothing changed", () => {
    expect(answerChanges(questions, new Set(["meal"]), new Map([["meal", ["Oui"]]]))).toEqual([])
    expect(answerChanges(questions, new Set(["meal"]), new Map())).toEqual([{ questionId: "meal", label: "Repas ?", from: ["Oui"], to: [] }])
  })
})

describe("the event log entry", () => {
  const change = { questionId: "car", label: "Transport ?", from: [], to: ["Voiture", "Vélo"] }

  it("keeps the question and the answer before and after, nothing else", () => {
    expect(answerChangeLog(change)).toEqual({ question: { from: "Transport ?", to: "Transport ?" }, answer: { from: null, to: "Voiture, Vélo" } })
  })

  it("reads as a sentence naming the question, and a « réponse » line", () => {
    const changes = answerChangeLog(change)
    expect(describeEntry({ action: "question.answer_changed", actorLabel: "Julie Martin", changes })).toBe("Julie Martin a modifié sa réponse à « Transport ? »")
    expect(describeChanges(changes)).toEqual(["réponse : pas de réponse → Voiture, Vélo"])
  })

  it("still reads once an erasure removed the answer", () => {
    expect(describeEntry({ action: "question.answer_changed", actorLabel: "Bénévole effacé", changes: { question: { from: "Transport ?", to: "Transport ?" } } })).toBe("Bénévole effacé a modifié sa réponse à « Transport ? »")
    expect(describeEntry({ action: "question.answer_changed", actorLabel: "Bénévole", changes: null })).toBe("Bénévole a modifié sa réponse à une question")
  })
})

describe("the organisers' email items", () => {
  const item = (changes: AnswerChangeItem["changes"]): AnswerChangeItem => ({ volunteerName: "Julie Martin", changes })

  it("reads each change as people do", () => {
    expect(answerChangeItem("Julie Martin", [{ questionId: "q", label: "Repas ?", from: ["Oui"], to: [] }])).toEqual(item([{ questionId: "q", label: "Repas ?", from: "Oui", to: null }]))
  })

  it("two changes of one question collapse into the first answer and the last one", () => {
    const merged = mergeAnswerChangeItems(item([{ questionId: "q", label: "Repas ?", from: "Oui", to: "Non" }]), item([{ questionId: "q", label: "Repas ?", from: "Non", to: "Peut-être" }]))
    expect(merged).toEqual(item([{ questionId: "q", label: "Repas ?", from: "Oui", to: "Peut-être" }]))
  })

  it("adds another question, and drops one changed back", () => {
    const merged = mergeAnswerChangeItems(
      item([{ questionId: "q", label: "Repas ?", from: "Oui", to: "Non" }, { questionId: "s", label: "Taille ?", from: null, to: "M" }]),
      item([{ questionId: "q", label: "Repas ?", from: "Non", to: "Oui" }, { questionId: "n", label: "Remarque ?", from: null, to: "19h" }]),
    )
    expect(merged).toEqual(item([{ questionId: "s", label: "Taille ?", from: null, to: "M" }, { questionId: "n", label: "Remarque ?", from: null, to: "19h" }]))
  })

  it("nothing left once every change is undone", () => {
    expect(mergeAnswerChangeItems(item([{ questionId: "q", label: "Repas ?", from: "Oui", to: "Non" }]), item([{ questionId: "q", label: "Repas ?", from: "Non", to: "Oui" }]))).toBeNull()
  })

  it("groups per event and recipient address, merges per volunteer", () => {
    expect(answerChangeGroupKey("e1", "Admin@Org.ch")).toBe("answers_changed:e1:admin@org.ch")
    expect(answerChangeMergeKey("v1")).toBe("volunteer:v1")
  })
})

describe("answerChangeAudience: who is told", () => {
  const changes = [{ questionId: "q", label: "Repas ?", from: ["Oui"], to: ["Non"] }]
  const admins = [{ email: "a@org.ch", name: "A" }, { email: "b@org.ch", name: "B" }]

  it("every active admin, with every change", () => {
    expect(answerChangeAudience(changes, { admins, fallbackEmail: "f@x.ch" })).toEqual(admins.map((recipient) => ({ recipient, changes })))
  })

  it("the fallback address only without any admin, nobody without either", () => {
    expect(answerChangeAudience(changes, { admins: [], fallbackEmail: "f@x.ch" })).toEqual([{ recipient: { email: "f@x.ch", name: "Admin" }, changes }])
    expect(answerChangeAudience(changes, { admins: [], fallbackEmail: null })).toEqual([])
  })

  it("nobody when nothing changed", () => {
    expect(answerChangeAudience([], { admins })).toEqual([])
  })
})
