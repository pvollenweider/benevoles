import { describe, it, expect } from "vitest"
import { adminReachability, noReachableAdmin, reachabilityNote, unreachableNote } from "../admin-reachability"

const now = new Date("2026-10-10T12:00:00Z")
const at = (iso: string) => new Date(iso)

describe("adminReachability (#811)", () => {
  it("counts an address whose latest outcome is a permanent refusal as to verify", () => {
    const r = adminReachability(["a", "b"], [
      { addressHash: "a", outcome: "rejected_permanent", createdAt: at("2026-10-01T00:00:00Z") },
      { addressHash: "b", outcome: "accepted_by_relay", createdAt: at("2026-10-01T00:00:00Z") },
    ], now)
    expect(r).toEqual({ active: 2, toVerify: 1 })
    expect(noReachableAdmin(r)).toBe(false)
    expect(reachabilityNote(r)).toBe("dont 1 adresse à vérifier")
    expect(unreachableNote(r)).toBe("")
  })

  it("clears the flag when a later send to the same address was accepted", () => {
    const r = adminReachability(["a"], [
      { addressHash: "a", outcome: "rejected_permanent", createdAt: at("2026-09-01T00:00:00Z") },
      { addressHash: "a", outcome: "accepted_by_relay", createdAt: at("2026-10-01T00:00:00Z") },
    ], now)
    expect(r.toVerify).toBe(0)
    expect(reachabilityNote(r)).toBeNull()
  })

  it("keeps a temporary incident reachable: a new attempt is planned", () => {
    const r = adminReachability(["a"], [{ addressHash: "a", outcome: "failed_temporary", createdAt: at("2026-10-01T00:00:00Z") }], now)
    expect(noReachableAdmin(r)).toBe(false)
  })

  it("flags a space whose every administrator address was refused", () => {
    const outcomes = ["a", "b"].map((h) => ({ addressHash: h, outcome: "rejected_permanent", createdAt: at("2026-10-01T00:00:00Z") }))
    const r = adminReachability(["a", "b"], outcomes, now)
    expect(noReachableAdmin(r)).toBe(true)
    expect(reachabilityNote(r)).toBe("toutes les adresses refusées : aucun administrateur joignable")
    expect(unreachableNote(r)).toContain("Aucun administrateur joignable")
    expect(reachabilityNote(adminReachability(["a"], outcomes, now))).toBe("adresse refusée : administrateur injoignable")
  })

  it("flags a space with no active administrator at all", () => {
    const r = adminReachability([], [], now)
    expect(noReachableAdmin(r)).toBe(true)
    expect(reachabilityNote(r)).toBe("aucun administrateur actif")
    expect(unreachableNote(r)).toContain("Aucun administrateur actif")
  })

  it("ignores outcomes older than the retention window and other addresses", () => {
    const r = adminReachability(["a"], [
      { addressHash: "a", outcome: "rejected_permanent", createdAt: at("2024-01-01T00:00:00Z") },
      { addressHash: "z", outcome: "rejected_permanent", createdAt: at("2026-10-01T00:00:00Z") },
    ], now)
    expect(r.toVerify).toBe(0)
  })
})
