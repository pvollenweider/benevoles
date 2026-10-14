import { describe, it, expect } from "vitest"
import { successPath } from "../registration-success"

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
