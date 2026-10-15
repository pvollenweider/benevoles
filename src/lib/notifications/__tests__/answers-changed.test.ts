import { describe, it, expect } from "vitest"
import { renderAnswersChanged } from "../templates/answers-changed"

// The organisers' email of a change of answers from the personal page (#984).
const payload = (items: { volunteerName: string; changes: { questionId: string; label: string; from: string | null; to: string | null }[] }[]) => ({
  kind: "answers_changed" as const,
  recipient: { email: "a@org.ch" },
  data: { eventId: "evt-1", eventTitle: "Fête <village>", items: items.map((value, i) => ({ key: `c${i}`, mergeKey: `volunteer:v${i}`, value })) },
})
const meal = { questionId: "q1", label: "Repas ?", from: "Oui", to: "Non" }

describe("answers_changed email", () => {
  it("one volunteer, one change: singular subject, the change and the questions page", () => {
    const mail = renderAnswersChanged(payload([{ volunteerName: "Julie Martin", changes: [meal] }]))
    expect(mail.subject).toBe("Réponse modifiée — Fête <village>")
    expect(mail.text).toContain("Julie Martin a modifié sa réponse aux questions de Fête <village> :")
    expect(mail.text).toContain("- « Repas ? » : « Oui » → « Non »")
    expect(mail.text).toContain("/admin/events/evt-1/questions")
    expect(mail.html).toContain("Fête &lt;village&gt;")
    expect(mail.html).not.toContain("<village>")
  })

  it("an answer added or removed reads « pas de réponse »", () => {
    const mail = renderAnswersChanged(payload([{ volunteerName: "Julie Martin", changes: [{ ...meal, from: null }, { questionId: "q2", label: "Taille ?", from: "M", to: null }] }]))
    expect(mail.subject).toBe("Réponses modifiées — Fête <village>")
    expect(mail.text).toContain("« Repas ? » : pas de réponse → « Non »")
    expect(mail.text).toContain("« Taille ? » : « M » → pas de réponse")
  })

  it("several volunteers: one email listing each with their changes", () => {
    const mail = renderAnswersChanged(payload([{ volunteerName: "Julie Martin", changes: [meal] }, { volunteerName: "Paul Roy", changes: [meal] }]))
    expect(mail.subject).toBe("2 bénévoles ont modifié leurs réponses — Fête <village>")
    expect(mail.text).toContain("Julie Martin :")
    expect(mail.text).toContain("Paul Roy :")
  })
})
