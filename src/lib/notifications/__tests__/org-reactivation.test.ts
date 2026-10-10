import { describe, it, expect } from "vitest"
import { render } from "../templates"
import type { NotificationPayload } from "../types"

// « Réactiver mon espace » (#811): the email names the space, carries the link, says how long it works.
const payload: NotificationPayload = {
  kind: "org_reactivation",
  organizationId: null,
  recipient: { email: "julie@example.org", name: "Julie" },
  data: { adminName: "Julie", organizationName: "Fête <du> village", reactivateUrl: "https://www.benevol.app/admin/reactivate/confirm?lien=abc", hours: 24 },
}

describe("org_reactivation email (#811)", () => {
  it("names the space, carries the link and its validity, escaped in HTML", () => {
    const { subject, text, html } = render(payload)
    expect(subject).toBe("Réactiver l'espace Fête <du> village")
    expect(text).toContain("https://www.benevol.app/admin/reactivate/confirm?lien=abc")
    expect(text).toContain("une seule fois, pendant 24 heures")
    expect(text).toContain("l'espace reste désactivé")
    expect(html).toContain("Fête &lt;du&gt; village")
    expect(html).not.toContain("Fête <du> village")
    expect(html).toContain("Réactiver mon espace")
  })
})
