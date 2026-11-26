// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { directRefFromMessageId, outboxIdFromMessageId } from "@/lib/bounce-dsn"
import { DIRECT_MESSAGE_REF_BYTES, DIRECT_MESSAGE_REF_LENGTH, directMessageId, directMessageRef, outboxMessageHost } from "../outbox-message-id"

// The Message-ID of a direct send: a random reference tied to its DeliveryOutcome rows,
// so a deferred bounce can be matched without trusting anything in the notice.

describe("directMessageRef", () => {
  it("is the generated length of lowercase hex characters: 160 random bits, above the 120-bit bound", () => {
    const ref = directMessageRef()
    expect(ref).toMatch(new RegExp(`^[0-9a-f]{${DIRECT_MESSAGE_REF_LENGTH}}$`))
    expect(ref).toHaveLength(DIRECT_MESSAGE_REF_LENGTH)
    expect(DIRECT_MESSAGE_REF_LENGTH).toBe(DIRECT_MESSAGE_REF_BYTES * 2)
    expect(DIRECT_MESSAGE_REF_BYTES * 8).toBeGreaterThanOrEqual(120)
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

  it("is always read back by the bounce parser, and never looks like an outbox id", () => {
    const host = outboxMessageHost()
    for (let i = 0; i < 20; i++) {
      const ref = directMessageRef()
      const id = directMessageId(ref)
      expect(directRefFromMessageId(id, host)).toBe(ref)
      expect(outboxIdFromMessageId(id, host)).toBeNull()
    }
  })
})
