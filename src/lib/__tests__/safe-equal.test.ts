// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { safeEqual } from "../safe-equal"

describe("safeEqual (#1048)", () => {
  it("matches the same value", () => {
    expect(safeEqual("Bearer s3cret", "Bearer s3cret")).toBe(true)
  })

  it("refuses a different value of the same length", () => {
    expect(safeEqual("Bearer s3creT", "Bearer s3cret")).toBe(false)
  })

  it("refuses shorter and longer values without throwing", () => {
    expect(safeEqual("Bearer s3cre", "Bearer s3cret")).toBe(false)
    expect(safeEqual("Bearer s3cret-and-more", "Bearer s3cret")).toBe(false)
  })

  it("refuses a missing, empty or non-string value", () => {
    expect(safeEqual(null, "x")).toBe(false)
    expect(safeEqual(undefined, "x")).toBe(false)
    expect(safeEqual("", "x")).toBe(false)
    expect(safeEqual(42, "42")).toBe(false)
  })

  it("never matches an empty expected value", () => {
    expect(safeEqual("", "")).toBe(false)
  })

  it("compares the full Unicode value", () => {
    expect(safeEqual("é", "é")).toBe(true)
    expect(safeEqual("é", "é")).toBe(false)
  })
})
