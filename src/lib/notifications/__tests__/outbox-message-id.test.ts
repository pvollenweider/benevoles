// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { directRefFromMessageId, outboxIdFromMessageId } from "@/lib/bounce-dsn"
import { directMessageId, directMessageRef, outboxMessageHost } from "../outbox-message-id"

// The Message-ID of a direct send: a random reference tied to its DeliveryOutcome rows,
// so a deferred bounce can be matched without trusting anything in the notice.

describe("directMessageRef", () => {
  it("is 40 lowercase letters and digits: 160 random bits, above the 120-bit bound", () => {
    const ref = directMessageRef()
    expect(ref).toMatch(/^[a-z0-9]{40}$/)
    expect(ref).toHaveLength(40)
    expect(ref.length * 4).toBeGreaterThanOrEqual(120)
  })

  it("is unguessable: two calls never return the same reference", () => {
    expect(directMessageRef()).not.toBe(directMessageRef())
  })
})

describe("directMessageId", () => {
  it("uses this deployment's host and the direct prefix", () => {
    const ref = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"
    expect(directMessageId(ref)).toBe(`<direct-${ref}@${outboxMessageHost()}>`)
  })

  it("round-trips through the bounce parser, and never looks like an outbox id", () => {
    const id = directMessageId(directMessageRef())
    const host = outboxMessageHost()
    const ref = directRefFromMessageId(id, host)
    expect(ref).toMatch(/^[a-z0-9]{40}$/)
    expect(outboxIdFromMessageId(id, host)).toBeNull()
  })
})
