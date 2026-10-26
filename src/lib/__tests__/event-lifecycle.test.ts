import { describe, it, expect } from "vitest"
import { currentStage, lifecycleNotes, lifecycleSteps, noteText, type LifecycleFacts } from "../event-lifecycle"

const base: LifecycleFacts = {
  publicStatus: "draft", isListed: true, endDate: "2026-07-05", today: "2026-06-01", shiftCount: 0, confirmationMessage: null, remindersEnabled: true,
}

// Lifecycle bar (#371).
describe("currentStage", () => {
  it("draft without shift, ready with one, published until the last day, finished after, archived always", () => {
    expect(currentStage(base)).toBe("draft")
    expect(currentStage({ ...base, shiftCount: 2 })).toBe("ready")
    expect(currentStage({ ...base, publicStatus: "published", today: "2026-07-05" })).toBe("published")
    expect(currentStage({ ...base, publicStatus: "published", today: "2026-07-06" })).toBe("finished")
    expect(currentStage({ ...base, publicStatus: "archived", shiftCount: 5 })).toBe("archived")
  })
})

describe("lifecycleSteps", () => {
  it("marks the stages before as done, the current one, the rest to do", () => {
    const steps = lifecycleSteps({ ...base, publicStatus: "published" })
    expect(steps.map((s) => `${s.id}:${s.state}`)).toEqual(["draft:done", "ready:done", "published:current", "finished:todo", "archived:todo"])
  })
})

describe("lifecycleNotes", () => {
  it("draft: needs a shift, invisible", () => {
    const n = lifecycleNotes(base, "e1")
    expect(noteText(n.needs[0])).toBe("Aucun créneau : ajoutez au moins un créneau pour pouvoir publier.")
    expect(n.needs[0].action).toEqual({ label: "ajoutez au moins un créneau", href: "/admin/events/e1/shifts" })
    expect(n.consequences[0]).toContain("Invisible")
  })

  it("ready: optional confirmation message, still invisible", () => {
    const n = lifecycleNotes({ ...base, shiftCount: 1 }, "e1")
    expect(n.needs[0].action).toEqual({ label: "Ajouter un message de confirmation", href: "/admin/events/e1/edit" })
    expect(lifecycleNotes({ ...base, shiftCount: 1, confirmationMessage: "Merci !" }, "e1").needs).toEqual([])
    expect(n.consequences[0]).toContain("publiez")
  })

  it("published: listed or not, reminders on or off", () => {
    const on = lifecycleNotes({ ...base, publicStatus: "published", shiftCount: 1, confirmationMessage: "x" }, "e1")
    expect(on.consequences).toEqual(["Visible sur la page publique de l'organisation, inscriptions ouvertes.", "Les rappels partent avant chaque créneau."])
    const off = lifecycleNotes({ ...base, publicStatus: "published", isListed: false, remindersEnabled: false, confirmationMessage: "x" }, "e1")
    expect(off.consequences[0]).toContain("non répertorié")
    expect(off.consequences[1]).toBe("Les rappels sont désactivés.")
  })

  it("published: inviting members is the first step, then inviting more (#1098)", () => {
    const none = lifecycleNotes({ ...base, publicStatus: "published", shiftCount: 1, confirmationMessage: "x" }, "e1")
    expect(none.needs).toHaveLength(1)
    expect(noteText(none.needs[0])).toBe("Aucun membre invité pour l'instant : inviter des membres, chacun reçoit son lien par email.")
    expect(none.needs[0].action).toEqual({ label: "inviter des membres", href: "/admin/events/e1/invitations" })
    const one = lifecycleNotes({ ...base, publicStatus: "published", confirmationMessage: "x", invitedCount: 1 }, "e1")
    expect(noteText(one.needs[0])).toBe("1 membre invité. Inviter d'autres membres")
    const many = lifecycleNotes({ ...base, publicStatus: "published", invitedCount: 12 }, "e1")
    expect(many.needs.map(noteText)).toEqual(["12 membres invités. Inviter d'autres membres", "Facultatif : la page d'inscription n'a pas de message de confirmation. Ajouter un message de confirmation"])
    // Not once it is over, nor before it is published.
    expect(lifecycleNotes({ ...base, publicStatus: "published", today: "2026-08-01" }, "e1").needs.some((n) => n.action?.href.endsWith("/invitations"))).toBe(false)
    expect(lifecycleNotes({ ...base, shiftCount: 1 }, "e1").needs.some((n) => n.action?.href.endsWith("/invitations"))).toBe(false)
  })

  it("finished and archived: archive to close, delete only once archived", () => {
    const fin = lifecycleNotes({ ...base, publicStatus: "published", today: "2026-08-01" }, "e1")
    expect(fin.needs[0]).toEqual({ before: "L'événement est passé : archivez-le pour le clore (« L'archiver » dans « À traiter », ou « Autres actions » en haut, puis Archiver)." })
    expect(fin.needs[0].action).toBeUndefined()
    expect(fin.consequences[1]).toContain("suppression définitive")
    const arch = lifecycleNotes({ ...base, publicStatus: "archived" }, "e1")
    expect(arch.needs).toEqual([])
    expect(arch.consequences[0]).toContain("Invisible")
  })
})
