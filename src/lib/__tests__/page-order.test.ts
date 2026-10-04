// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { movePageId, pageMoveBoundaryMessage, pageMoveMessage, PAGE_ORDER_FAILED } from "../page-order"
import { moveRole } from "../role-order"

describe("movePageId", () => {
  it("is role-order's moveRole, generic over ids", () => {
    expect(movePageId).toBe(moveRole)
  })

  it("moves a middle page up and down by one", () => {
    const ids = ["p1", "p2", "p3"]
    expect(movePageId(ids, "p2", "up")).toEqual({ roles: ["p2", "p1", "p3"], index: 0 })
    expect(movePageId(ids, "p2", "down")).toEqual({ roles: ["p1", "p3", "p2"], index: 2 })
  })

  it("returns null at the ends", () => {
    const ids = ["p1", "p2", "p3"]
    expect(movePageId(ids, "p1", "up")).toBeNull()
    expect(movePageId(ids, "p3", "down")).toBeNull()
  })
})

describe("pageMoveMessage", () => {
  it("says the position in the middle, with feminine agreement", () => {
    expect(pageMoveMessage("FAQ", 1, 4)).toBe("Page « FAQ » déplacée en position 2 sur 4.")
  })

  it("says first and last instead of a number", () => {
    expect(pageMoveMessage("FAQ", 0, 4)).toBe("Page « FAQ » déplacée en première position.")
    expect(pageMoveMessage("FAQ", 3, 4)).toBe("Page « FAQ » déplacée en dernière position.")
  })
})

describe("pageMoveBoundaryMessage", () => {
  it("says the page is already at that end, quoted and feminine", () => {
    expect(pageMoveBoundaryMessage("FAQ", "up")).toBe("La page « FAQ » est déjà en première position.")
    expect(pageMoveBoundaryMessage("FAQ", "down")).toBe("La page « FAQ » est déjà en dernière position.")
  })
})

describe("PAGE_ORDER_FAILED", () => {
  it("says the order could not be saved and was reverted", () => {
    expect(PAGE_ORDER_FAILED).toBe("L'ordre des pages n'a pas pu être enregistré. L'ordre enregistré est rétabli.")
  })
})
