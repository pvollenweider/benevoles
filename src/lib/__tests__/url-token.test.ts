import { describe, it, expect, vi } from "vitest"
import { addressWithoutToken, stripTokenFromAddressBar } from "../url-token"

// #1042: the token of an emailed link leaves the address bar once the page has read it.

const q = (params: Record<string, string>) => `?${new URLSearchParams(params)}`

describe("addressWithoutToken", () => {
  it("drops only the token parameter, keeping the path, the rest of the query and the hash", () => {
    expect(addressWithoutToken(`https://www.benevol.app/admin/reset-password${q({ token: "abc" })}`)).toBe("/admin/reset-password")
    expect(addressWithoutToken(`/admin/keep${q({ org: "x", token: "abc" })}#top`)).toBe("/admin/keep?org=x#top")
  })

  it("returns null when there is no token to drop", () => {
    expect(addressWithoutToken("/admin/reset-password")).toBeNull()
    expect(addressWithoutToken(`/admin/events${q({ t: "1" })}`)).toBeNull()
  })
})

describe("stripTokenFromAddressBar", () => {
  it("replaces the history entry only when the address has a token", () => {
    const replaceState = vi.fn()
    stripTokenFromAddressBar({ location: { href: `https://www.benevol.app/admin/accept-invite${q({ token: "abc" })}` }, history: { replaceState } })
    expect(replaceState).toHaveBeenCalledWith(null, "", "/admin/accept-invite")
    replaceState.mockClear()
    stripTokenFromAddressBar({ location: { href: "https://www.benevol.app/admin/accept-invite" }, history: { replaceState } })
    expect(replaceState).not.toHaveBeenCalled()
  })
})
