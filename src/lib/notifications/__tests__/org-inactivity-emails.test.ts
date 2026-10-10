import { describe, it, expect } from "vitest"
import { render } from "../templates"
import type { NotificationPayload } from "../types"

// The periodic check's emails (#811): each states the exact date and what happens without an
// answer, carries the « Conserver mon organisation » link, and the deactivation email says how
// to reactivate.
const notice = (step: "first" | "second" | "last"): NotificationPayload => ({
  kind: "org_inactivity_notice",
  organizationId: "org-1",
  recipient: { email: "julie@example.org", name: "Julie" },
  data: { step, organizationName: "Fête <du> village", lastActivity: "12 mars 2025", deactivationOn: "mardi 23 décembre 2026", keepUrl: "https://www.benevol.app/admin/keep?lien=abc" },
})

describe("periodic check emails (#811)", () => {
  it("asks, reminds, then warns for the last time, with the date and the consequence", () => {
    expect(render(notice("first")).subject).toBe("Souhaitez-vous conserver l'espace Fête <du> village ?")
    expect(render(notice("second")).subject).toBe("Rappel : souhaitez-vous conserver l'espace Fête <du> village ?")
    expect(render(notice("last")).subject).toBe("Dernier rappel : l'espace Fête <du> village sera désactivé le mardi 23 décembre 2026")
    const { text, html } = render(notice("first"))
    expect(text).toContain("n'a pas été utilisé depuis le 12 mars 2025")
    expect(text).toContain("Conserver mon organisation : https://www.benevol.app/admin/keep?lien=abc")
    expect(text).toContain("Sans réponse, l'espace sera désactivé le mardi 23 décembre 2026")
    expect(text).toContain("Espace désactivé faute d'activité ? Le réactiver")
    expect(html).toContain("Fête &lt;du&gt; village")
    expect(html).not.toContain("Fête <du> village")
    expect(render(notice("last")).text).toContain("C'est notre dernier message avant la désactivation.")
  })

  it("says the space was deactivated, its data kept, and how to reactivate it", () => {
    const { subject, text } = render({ kind: "org_inactivity_deactivated", organizationId: null, recipient: { email: "julie@example.org", name: "Julie" }, data: { organizationName: "Fête du village", deactivatedOn: "15 août 2027" } })
    expect(subject).toBe("L'espace Fête du village a été désactivé")
    expect(text).toContain("a été désactivé le 15 août 2027")
    expect(text).toContain("ouvrez-le, puis appuyez sur « Réactiver l'espace »")
    expect(text).toMatch(/Réactiver mon espace : https?:\/\/\S+\/admin\/reactivate$/m)
  })
})
