import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))

import { SWAP_REGISTRATION_RESETS, isRetryableConflict, runSwapTransaction, swapStateError, type SwapDb } from "../shift-swap-server"
import { attendanceStateOf } from "../attendance-state"

/** The error Prisma 7's pg adapter throws on a deadlock (seen against Postgres 16). */
const deadlock = { code: "P2010", meta: { driverAdapterError: { name: "DriverAdapterError", cause: { originalCode: "40P01", originalMessage: "deadlock detected", kind: "TransactionWriteConflict" } } } }

describe("isRetryableConflict (#1174)", () => {
  it("recognises a deadlock, a serialization failure and Prisma's write conflict", () => {
    expect(isRetryableConflict(deadlock)).toBe(true)
    expect(isRetryableConflict({ code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "40001" } } } })).toBe(true)
    expect(isRetryableConflict({ code: "P2034" })).toBe(true)
  })

  it("leaves every other error alone", () => {
    expect(isRetryableConflict({ code: "P2002" })).toBe(false)
    expect(isRetryableConflict(new Error("boom"))).toBe(false)
    expect(isRetryableConflict(null)).toBe(false)
  })
})

describe("runSwapTransaction (#1174)", () => {
  const db = (failures: unknown[]): SwapDb & { calls: number } => {
    const state = { calls: 0 }
    return Object.assign(state, {
      $transaction: async <R>(fn: (tx: never) => Promise<R>) => {
        state.calls++
        const failure = failures.shift()
        if (failure) throw failure
        return fn({} as never)
      },
    }) as SwapDb & { calls: number }
  }

  it("tries again after a deadlock, three times in all", async () => {
    const twice = db([deadlock, deadlock])
    await expect(runSwapTransaction(twice, async () => "done")).resolves.toBe("done")
    expect(twice.calls).toBe(3)
    const always = db([deadlock, deadlock, deadlock])
    await expect(runSwapTransaction(always, async () => "done")).rejects.toBe(deadlock)
  })

  it("never retries another error", async () => {
    const other = db([new Error("boom")])
    await expect(runSwapTransaction(other, async () => "done")).rejects.toThrow("boom")
    expect(other.calls).toBe(1)
  })
})

describe("a swap resets attendance (#1141)", () => {
  it("clears the check-in and the three absence columns together, so the invariants hold on the new shift", () => {
    expect(SWAP_REGISTRATION_RESETS).toMatchObject({ checkedInAt: null, attendanceStatus: null, attendanceAt: null, attendanceBy: null })
    // Whatever the row was before (present, or absent with its author and time), it is expected after.
    const absent = { checkedInAt: null, attendanceStatus: "absent", attendanceAt: new Date("2026-07-04T08:05:00Z"), attendanceBy: "adm-1" }
    const present = { checkedInAt: new Date("2026-07-04T08:05:00Z"), attendanceStatus: null, attendanceAt: null, attendanceBy: null }
    for (const before of [absent, present]) {
      const after = { ...before, ...SWAP_REGISTRATION_RESETS }
      expect(attendanceStateOf(after)).toBe("expected")
      expect(after).toMatchObject({ attendanceAt: null, attendanceBy: null })
    }
  })

  it("still clears what it cleared before: reminders and waitlist fields", () => {
    expect(SWAP_REGISTRATION_RESETS).toMatchObject({ reminderJ2Sent: null, reminderJ1Sent: null, reminderDdSent: null, waitingPosition: null, waitingOfferedAt: null, waitingExpiresAt: null })
  })
})

describe("swapStateError (#1174 E14)", () => {
  it("answers a replayed action with where the request stands", () => {
    expect(swapStateError("applied")).toBe("Cet échange a déjà été effectué.")
    expect(swapStateError("approval")).toBe("Cet échange attend la validation de l'organisation.")
    expect(swapStateError("expired")).toBe("Cette demande d'échange a expiré.")
    expect(swapStateError("impossible")).toBe("Cet échange ne peut plus être effectué.")
  })
})
