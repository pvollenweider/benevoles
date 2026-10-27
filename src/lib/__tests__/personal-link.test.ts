import { describe, it, expect } from "vitest"
import { INVALID_LINK_STEPS, lastLinkEmailLabel, LINK_REQUEST_LIMIT, LINK_REQUEST_RESPONSE, LINK_REQUEST_SUBMIT, LINK_RESENT_RESPONSE, LOST_LINK_INTRO, LOST_LINK_SUMMARY, PERSONAL_LINK_DOC_LINKS, PERSONAL_LINK_EMAIL_NOTE, PERSONAL_LINK_NOTICE, showsLostLinkEntry } from "../personal-link"
import { readDocUnits } from "../doc-units"
import { renderDocUnit } from "../public-content"

// The personal link explained (#376).
describe("personal link copy", () => {
  it("dates the last email in the organization's time zone, nothing when unknown", () => {
    expect(lastLinkEmailLabel("2026-07-04T08:30:00Z", "Europe/Zurich")).toBe("Dernier email contenant ce lien : samedi 4 juillet à 10:30.")
    expect(lastLinkEmailLabel(null, "Europe/Zurich")).toBeNull()
    expect(lastLinkEmailLabel("nope", "Europe/Zurich")).toBeNull()
  })

  it("never confirms whether an address is registered, and says the link is private", () => {
    expect(LINK_REQUEST_RESPONSE).toMatch(/^Demande enregistrée\. Si une inscription existe/)
    expect(PERSONAL_LINK_NOTICE).toContain("Ne le partage pas")
    expect(INVALID_LINK_STEPS).toHaveLength(3)
    expect(LINK_REQUEST_LIMIT).toBe(3)
  })
})

// The throttle and the per-address cap can drop the email silently: no answer claims it left.
describe("link request answers", () => {
  it("never claim an email left, and say what to do when nothing arrives", () => {
    for (const text of [LINK_REQUEST_RESPONSE, LINK_RESENT_RESPONSE]) {
      expect(text).toMatch(/^Demande enregistrée/)
      expect(text).not.toMatch(/vient de partir|a été envoyé|est parti/)
      expect(text).toContain("Rien reçu ? Regarde dans tes indésirables.")
    }
    expect(LINK_REQUEST_RESPONSE).toContain("Le dernier lien reçu reste valable. Après plusieurs demandes, attends une heure avant de redemander.")
    expect(LINK_RESENT_RESPONSE).toContain("Le lien de cette page reste valable.")
  })
})

// « J'ai perdu mon lien personnel » on the event page (#1097).
describe("lost link entry", () => {
  it("is offered to a visitor without a session, never in the organiser's preview", () => {
    expect(showsLostLinkEntry({ preview: false, sessionRegistrations: 0 })).toBe(true)
    expect(showsLostLinkEntry({ preview: false, sessionRegistrations: 2 })).toBe(false)
    expect(showsLostLinkEntry({ preview: true, sessionRegistrations: 0 })).toBe(false)
  })

  it("promises nothing about the address and names no gender (#582)", () => {
    expect(LOST_LINK_INTRO).toMatch(/^Si une inscription existe à cette adresse/)
    for (const text of [LOST_LINK_SUMMARY, LOST_LINK_INTRO, LINK_REQUEST_SUBMIT.lost, PERSONAL_LINK_EMAIL_NOTE]) expect(text).not.toMatch(/·|\(e\)/)
    expect(LINK_REQUEST_SUBMIT.invalid).toBe("Recevoir un nouveau lien")
  })

  it.each(Object.entries(PERSONAL_LINK_DOC_LINKS))("%s opens an existing page and heading of content/guide/", (_name, href) => {
    const [pathname, anchor] = href.split("#")
    const unit = readDocUnits().find((u) => u.slug === pathname.replace(/^\/doc\//, ""))
    expect(unit, pathname).toBeDefined()
    if (anchor) expect([...renderDocUnit(unit!).matchAll(/<h[2-6] id="([^"]*)"/g)].map((m) => m[1])).toContain(anchor)
  })
})
