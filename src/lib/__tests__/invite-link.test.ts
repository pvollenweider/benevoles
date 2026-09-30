import { describe, it, expect } from "vitest"
import { inviteLink } from "../invite-link"

// Activation link of an admin invite: one builder for creation and resend.
describe("inviteLink", () => {
  it("builds the accept-invite URL on the app origin, without a double slash", () => {
    expect(inviteLink("https://www.benevol.app", "abc")).toBe("https://www.benevol.app/admin/accept-invite?token=abc")
    expect(inviteLink("https://www.benevol.app/", "abc")).toBe("https://www.benevol.app/admin/accept-invite?token=abc")
  })

  it("falls back to localhost and escapes the token", () => {
    expect(inviteLink(undefined, "a b")).toBe("http://localhost:3000/admin/accept-invite?token=a%20b")
    expect(inviteLink("  ", "x")).toBe("http://localhost:3000/admin/accept-invite?token=x")
  })
})
