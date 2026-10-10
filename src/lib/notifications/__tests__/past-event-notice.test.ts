import { describe, it, expect } from "vitest"
import { renderPastEventNotice } from "../templates/administration"
import type { NotificationPayload } from "../types"

// The one notice before the first anonymisation of past events (#813).

const notice = (data: Record<string, unknown>): NotificationPayload => ({
  kind: "past_event_notice",
  recipient: { email: "admin@example.org", name: "Admin" },
  organizationId: "org",
  data: {
    organizationName: "Comité des fêtes",
    firstBatchOn: "lundi 9 novembre 2026",
    events: [{ title: "Fête du village", ended: "1 juin 2023" }],
    registrations: 1,
    membersOnlyOld: 0,
    ...data,
  },
})

describe("renderPastEventNotice", () => {
  it("gives the date and the events, then what to do, what goes and what stays", () => {
    const { subject, text, html } = renderPastEventNotice(notice({}))
    expect(subject).toBe("Le lundi 9 novembre 2026, les noms des bénévoles de vos anciens événements seront effacés")
    expect(text).toContain("Pour Comité des fêtes, le premier effacement aura lieu le lundi 9 novembre 2026. Il concerne 1 événement et 1 inscription :")
    expect(text).toContain("- Fête du village, terminé le 1 juin 2023")
    // The one thing to do comes right after the list.
    expect(text.indexOf("téléchargez-les avant le lundi 9 novembre 2026")).toBeLessThan(text.indexOf("Ce qui sera effacé"))
    expect(text).toContain("Ce qui reste :")
    expect(text).toContain("chaque mois")
    expect(text).toContain("/doc/exporter-et-conserver-ses-donnees")
    expect(text).not.toContain("Liste des membres")
    expect(html).toContain("<li style=\"margin:0.25em 0\">Fête du village, terminé le 1 juin 2023</li>")
    expect(html).toContain("<h3")
    expect(html).toContain("Voir comment exporter mes données")
  })

  it("lists every event, and the members with no recent participation", () => {
    const events = Array.from({ length: 25 }, (_, i) => ({ title: `Fête ${i + 1}`, ended: "1 juin 2023" }))
    const { text, html } = renderPastEventNotice(notice({ events, registrations: 300, membersOnlyOld: 12 }))
    expect(text).toContain("Il concerne 25 événements et 300 inscriptions :")
    expect(text).toContain("- Fête 25, terminé le 1 juin 2023")
    expect(text).toContain("12 membres n'ont participé à aucun événement depuis 3 ans. Leurs fiches restent : vous pouvez les désactiver ou effacer leurs données.")
    expect(text).toContain("triez par « Dernière participation »")
    expect(text).toContain("Liste des membres : ")
    expect(html).toContain("Ouvrir la liste des membres")
  })

  it("escapes what the organisation typed", () => {
    const { html } = renderPastEventNotice(notice({ organizationName: "<b>Club</b>", events: [{ title: "A & <B>", ended: "1 juin 2023" }] }))
    expect(html).not.toContain("<b>Club</b>")
    expect(html).toContain("A &amp; &lt;B&gt;")
  })
})
