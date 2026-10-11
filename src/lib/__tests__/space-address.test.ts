import { describe, expect, it } from "vitest"
import { spaceBaseDomain } from "../space-address"

describe("spaceBaseDomain", () => {
  it("uses the configured address without « www. »", () => {
    expect(spaceBaseDomain("https://www.benevol.app", "cdp.benevol.app", "benevol.app")).toBe("benevol.app")
    expect(spaceBaseDomain("https://benevol.app/", "cdp.benevol.app", "benevol.app")).toBe("benevol.app")
  })

  it("ignores the request host when an address is configured (proxy, local capture stack)", () => {
    expect(spaceBaseDomain("https://www.benevol.app", "default.localhost:43102", "benevol.app")).toBe("benevol.app")
  })

  it("falls back to the request host for localhost or an IP address", () => {
    expect(spaceBaseDomain("http://localhost:3000", "localhost:3000", "benevol.app")).toBe("localhost:3000")
    expect(spaceBaseDomain("http://localhost:3000", "cdp.localhost:3000", "benevol.app")).toBe("cdp.localhost:3000")
    expect(spaceBaseDomain("http://192.168.1.10:3000", "192.168.1.10:3000", "benevol.app")).toBe("192.168.1.10:3000")
  })

  it("falls back to the request host, then to the default, without a configured address", () => {
    expect(spaceBaseDomain(undefined, "cdp.example.org", "benevol.app")).toBe("example.org")
    expect(spaceBaseDomain("", null, "benevol.app")).toBe("benevol.app")
    expect(spaceBaseDomain(undefined, "", "benevol.app")).toBe("benevol.app")
  })
})
