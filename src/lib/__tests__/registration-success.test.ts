import { describe, it, expect } from "vitest"
import { showsPersonalLinkEmailNote, successBackLink, successPath } from "../registration-success"

const query = (path: string) => new URLSearchParams(path.split("?")[1] ?? "")

describe("successPath", () => {
  it("keeps the organisation of the page on the confirmation (regression: 404 without subdomain)", () => {
    const path = successPath("fete-des-liens", { editToken: null }, new URLSearchParams("org=asso-a"), false)
    expect(path).toBe("/fete-des-liens/success?org=asso-a")
  })

  it("has no query when there is nothing to carry", () => {
    expect(successPath("fete", {}, new URLSearchParams(), false)).toBe("/fete/success")
  })

  it("carries the token, the waiting list and the requested shifts", () => {
    const q = query(successPath("fete", { editToken: "tok", onWaitlist: true, requestedShifts: 2, activeShifts: 1 }, new URLSearchParams("org=a"), false))
    expect(Object.fromEntries(q)).toEqual({ org: "a", token: "tok", waitlist: "1", requested: "2", active: "1" })
  })

  it("leaves out the requested shifts when there are none, active defaults to 0", () => {
    expect(query(successPath("fete", { requestedShifts: 0 }, new URLSearchParams(), false)).has("requested")).toBe(false)
    expect(query(successPath("fete", { requestedShifts: 3 }, new URLSearchParams(), false)).get("active")).toBe("0")
  })

  it("does not carry other parameters of the page outside the embed", () => {
    const q = query(successPath("fete", {}, new URLSearchParams("org=a&groupe=abcd2345&creneau=x"), false))
    expect([...q.keys()]).toEqual(["org"])
  })

  it("embedded, keeps the group link, the organisation and embed=1", () => {
    const q = query(successPath("fete", { editToken: "tok" }, new URLSearchParams("org=a&groupe=abcd2345&embed=1"), true))
    expect(Object.fromEntries(q)).toEqual({ org: "a", token: "tok", groupe: "abcd2345", embed: "1" })
  })
})

describe("successPath, from the personal page (#1013)", () => {
  it("carries what was updated, keys and count only", () => {
    const q = query(successPath("fete", { editToken: "tok", updated: { contact: ["phone"], answers: 1 } }, new URLSearchParams(), false))
    expect(Object.fromEntries(q)).toEqual({ token: "tok", updated: "phone", updatedAnswers: "1" })
  })

  it("nothing updated: nothing carried", () => {
    expect(successPath("fete", { updated: { contact: [], answers: 0 } }, new URLSearchParams(), false)).toBe("/fete/success")
  })
})

// No dead end after a public sign-up (#1097).
describe("successBackLink", () => {
  it("goes back to the event, not to the organisation's home", () => {
    expect(successBackLink("fete", new URLSearchParams(), false)).toEqual({ href: "/fete", label: "Revenir à l'événement" })
  })

  it("keeps the organisation of the page and drops the token", () => {
    expect(successBackLink("fete", new URLSearchParams("org=asso-a&token=secret&waitlist=1"), false).href).toBe("/fete?org=asso-a")
  })

  it("goes back to the schedule in the frame, with its flow", () => {
    expect(successBackLink("fete", new URLSearchParams("org=club&groupe=abcd2345&token=tok&embed=1"), true))
      .toEqual({ href: "/fete?org=club&groupe=abcd2345&embed=1", label: "Revenir au planning" })
  })
})

describe("showsPersonalLinkEmailNote", () => {
  it("says the link is in the email when the page has none to show (#285)", () => {
    expect(showsPersonalLinkEmailNote({ hasToken: false, embed: false, waitlistOnly: false })).toBe(true)
  })

  it("stays quiet when the page links the personal page itself", () => {
    expect(showsPersonalLinkEmailNote({ hasToken: true, embed: false, waitlistOnly: false })).toBe(false)
  })

  it("is always said in the frame (#948)", () => {
    expect(showsPersonalLinkEmailNote({ hasToken: true, embed: true, waitlistOnly: false })).toBe(true)
  })

  it("is never said for a waiting list only: that email has no personal link", () => {
    expect(showsPersonalLinkEmailNote({ hasToken: false, embed: false, waitlistOnly: true })).toBe(false)
    expect(showsPersonalLinkEmailNote({ hasToken: false, embed: true, waitlistOnly: true })).toBe(false)
  })
})
