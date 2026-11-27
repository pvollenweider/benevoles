// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { addressStatus, addressStatusSentence, type AddressOutcomeInput } from "../address-status"

const HASH_CURRENT = "hash-current"
const HASH_OLD = "hash-old-address"
const now = new Date("2026-03-15T10:00:00Z")
const o = (over: Partial<AddressOutcomeInput>): AddressOutcomeInput => ({ addressHash: HASH_CURRENT, outcome: "accepted_by_relay", createdAt: now, ...over })

describe("addressStatus", () => {
  it("flags a recent permanent rejection on the current address as « to verify »", () => {
    const since = new Date("2026-03-10T09:00:00Z")
    const status = addressStatus(HASH_CURRENT, [o({ outcome: "rejected_permanent", createdAt: since })], now)
    expect(status).toEqual({ kind: "to_verify", since })
  })

  it("never flags a temporary failure as « to verify »", () => {
    const status = addressStatus(HASH_CURRENT, [o({ outcome: "failed_temporary", createdAt: new Date("2026-03-10T09:00:00Z") })], now)
    expect(status.kind).toBe("temporary_incident")
  })

  it("ignores a permanent rejection recorded on an address the member no longer has", () => {
    const status = addressStatus(HASH_CURRENT, [o({ addressHash: HASH_OLD, outcome: "rejected_permanent" })], now)
    expect(status).toEqual({ kind: "ok" })
  })

  it("an acceptance that has stayed 48 hours without a bounce clears an earlier rejection", () => {
    const status = addressStatus(HASH_CURRENT, [
      o({ outcome: "rejected_permanent", createdAt: new Date("2026-03-01T00:00:00Z") }),
      o({ outcome: "accepted_by_relay", createdAt: new Date("2026-03-10T00:00:00Z") }),
    ], now)
    expect(status).toEqual({ kind: "ok" })
  })

  // Regression (#1477): a mailbox that bounces after acceptance had its mark cleared by every new
  // reminder our relay accepted, until the bounce was read, so the organisers' filter showed nobody.
  it("keeps « to verify » when a new email was only just accepted by the relay", () => {
    const since = new Date("2026-03-14T15:15:00Z")
    const status = addressStatus(HASH_CURRENT, [
      o({ outcome: "accepted_by_relay", createdAt: new Date("2026-03-14T12:00:00Z") }),
      o({ outcome: "rejected_permanent", createdAt: since }),
      o({ outcome: "accepted_by_relay", createdAt: new Date("2026-03-15T09:00:00Z") }),
    ], now)
    expect(status).toEqual({ kind: "to_verify", since })
  })

  it("the 48 hours run from the acceptance: one second short keeps the mark, the exact time clears it", () => {
    const since = new Date("2026-03-10T00:00:00Z")
    const accepted = new Date("2026-03-13T10:00:00Z")
    const rows = [o({ outcome: "rejected_permanent", createdAt: since }), o({ outcome: "accepted_by_relay", createdAt: accepted })]
    expect(addressStatus(HASH_CURRENT, rows, new Date("2026-03-15T09:59:59Z"))).toEqual({ kind: "to_verify", since })
    expect(addressStatus(HASH_CURRENT, rows, new Date("2026-03-15T10:00:00Z"))).toEqual({ kind: "ok" })
  })

  it("a new rejection after an old acceptance restarts the mark from that rejection", () => {
    const since = new Date("2026-03-14T00:00:00Z")
    const status = addressStatus(HASH_CURRENT, [
      o({ outcome: "rejected_permanent", createdAt: new Date("2026-03-01T00:00:00Z") }),
      o({ outcome: "accepted_by_relay", createdAt: new Date("2026-03-05T00:00:00Z") }),
      o({ outcome: "rejected_permanent", createdAt: since }),
    ], now)
    expect(status).toEqual({ kind: "to_verify", since })
  })

  it("a temporary failure after a rejection does not clear the mark", () => {
    const since = new Date("2026-03-10T00:00:00Z")
    const status = addressStatus(HASH_CURRENT, [
      o({ outcome: "rejected_permanent", createdAt: since }),
      o({ outcome: "failed_temporary", createdAt: new Date("2026-03-14T00:00:00Z") }),
    ], now)
    expect(status).toEqual({ kind: "to_verify", since })
  })

  it("latest wins the other way too: a later rejection re-flags an address that once succeeded", () => {
    const since = new Date("2026-03-12T00:00:00Z")
    const status = addressStatus(HASH_CURRENT, [
      o({ outcome: "accepted_by_relay", createdAt: new Date("2026-03-01T00:00:00Z") }),
      o({ outcome: "rejected_permanent", createdAt: since }),
    ], now)
    expect(status).toEqual({ kind: "to_verify", since })
  })

  it("ignores an outcome older than the retention window", () => {
    const tooOld = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000)
    const status = addressStatus(HASH_CURRENT, [o({ outcome: "rejected_permanent", createdAt: tooOld })], now, 30)
    expect(status).toEqual({ kind: "ok" })
  })

  it("a member with no current address hash is always ok", () => {
    expect(addressStatus(null, [o({ outcome: "rejected_permanent" })], now)).toEqual({ kind: "ok" })
  })

  it("no matching outcome at all is ok", () => {
    expect(addressStatus(HASH_CURRENT, [], now)).toEqual({ kind: "ok" })
  })
})

describe("addressStatusSentence", () => {
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  it("states the date and a plain, non-blaming explanation for « to verify »", () => {
    const sentence = addressStatusSentence({ kind: "to_verify", since: new Date("2026-03-10T00:00:00Z") }, fmt)
    expect(sentence).toContain("Adresse à vérifier")
    expect(sentence).toContain("2026-03-10")
    expect(sentence).toContain("boîte inexistante ou adresse refusée par le serveur")
    expect(sentence?.toLowerCase()).not.toMatch(/vous |votre /)
  })

  it("words a temporary incident differently", () => {
    const sentence = addressStatusSentence({ kind: "temporary_incident", since: new Date("2026-03-10T00:00:00Z") }, fmt)
    expect(sentence).toContain("Incident temporaire")
    expect(sentence).toContain("nouvel essai prévu")
    expect(sentence).not.toContain("Adresse à vérifier")
  })

  it("is null when everything is fine", () => {
    expect(addressStatusSentence({ kind: "ok" }, fmt)).toBeNull()
  })
})
