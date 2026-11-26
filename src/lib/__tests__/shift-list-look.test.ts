// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { COLOR_OPTIONS, getBarClasses, getListBorderClass, LIST_BORDER_HEX, type ColorKey } from "../roles"
import { shiftViewState, type TimelineShift } from "../public-timeline"
import { shiftListRowLook } from "../shift-list-look"

const shift = (over: Partial<TimelineShift> = {}): TimelineShift => ({
  id: "s", roleName: "Accueil", label: "Accueil", startTime: "09:00", endTime: "11:00", status: "open", capacity: 4, registered: 2, spotsLeft: 2, ...over,
})
const state = (over: Partial<Parameters<typeof shiftViewState>[0]> = {}) => shiftViewState({ shift: shift(), selected: false, conflict: false, reserved: false, locked: false, ...over })
const look = (over: Partial<Parameters<typeof shiftListRowLook>[0]> = {}) => shiftListRowLook({ view: state(), roleName: "Accueil", ...over })

// The look of every state of `shiftViewState`: a card with the poste's left border when it can be
// chosen (selected and held included), a quiet row when it cannot.
describe("shiftListRowLook for a row that can be activated", () => {
  it("keeps the card and adds the poste's 6 px left border", () => {
    const row = look()
    expect(row.kind).toBe("card")
    expect(row.button).toContain("min-h-11")
    expect(row.button).toContain("border-2")
    expect(row.button).toContain("rounded-xl")
    expect(row.button).toContain("bg-white")
    expect(row.button).toContain("hover:bg-gray-50")
    expect(row.button).toContain("border-l-[6px]")
    expect(row.button).toContain("border-l-blue-600")
    expect(row.button).not.toContain("border-0")
    expect(row.placesStatus).toBe(true)
    expect(row.statusLine).toContain("font-semibold")
    expect(row.statusLine).toContain("text-gray-900")
  })

  it("uses the poste's own colour, including an organiser's explicit choice", () => {
    expect(look({ roleName: "Buvette" }).button).toContain("border-l-amber-700")
    expect(look({ roleName: "Accueil", colorKey: "red" }).button).toContain("border-l-red-600")
  })

  it("keeps the selected card, its blue frame and the poste's left border", () => {
    const row = look({ view: state({ selected: true }) })
    expect(row.kind).toBe("selected")
    expect(row.button).toContain("border-blue-700")
    expect(row.button).toContain("bg-blue-50")
    expect(row.button).toContain("border-l-blue-600")
    expect(row.button).toContain("cursor-pointer")
    expect(row.statusLine).not.toContain("font-semibold")
    expect(row.statusLine).toContain("text-gray-800")
  })

  it("keeps the held card, its green frame and the poste's left border", () => {
    const row = look({ view: state({ held: "active" }) })
    expect(row.kind).toBe("held")
    expect(row.button).toContain("border-green-700")
    expect(row.button).toContain("bg-green-50")
    expect(row.button).toContain("border-l-blue-600")
    expect(row.button).toContain("cursor-default")
    expect(row.statusLine).not.toContain("font-semibold")
  })

  it("stays a card on a full shift with a waiting list, without the plain places status", () => {
    const row = look({ view: state({ shift: shift({ status: "full", waitlistEnabled: true, spotsLeft: 0, registered: 4 }) }) })
    expect(row.kind).toBe("card")
    expect(row.button).toContain("border-l-blue-600")
    expect(row.placesStatus).toBe(false)
    expect(row.statusLine).not.toContain("font-semibold")
  })

  it("stays a card when the role's limit per person is reached, without the plain places status", () => {
    const row = look({ view: state(), limitReached: 2 })
    expect(row.kind).toBe("card")
    expect(row.button).toContain("border-l-blue-600")
    expect(row.placesStatus).toBe(false)
    expect(row.statusLine).not.toContain("font-semibold")
  })

  it("keeps a locked shift selected when it can still be deselected", () => {
    const row = look({ view: state({ locked: true, selected: true }), roleName: "Accueil" })
    expect(row.kind).toBe("selected")
    expect(row.button).toContain("border-l-blue-600")
  })
})

describe("shiftListRowLook for a row that cannot be activated", () => {
  const quiet = [
    ["reserved", () => look({ view: state({ reserved: true }) })],
    ["ended", () => look({ view: state({ shift: shift({ status: "ended" }) }) })],
    ["overlap", () => look({ view: state({ conflict: true }) })],
    ["locked", () => look({ view: state({ locked: true }) })],
    ["closed", () => look({ view: state({ shift: shift({ status: "closed" }) }) })],
    ["full without a waiting list", () => look({ view: state({ shift: shift({ status: "full", spotsLeft: 0, registered: 4 }) }) })],
  ] as const

  for (const [name, make] of quiet) {
    it(`makes a quiet row for a ${name} shift`, () => {
      const row = make()
      expect(row.kind).toBe("quiet")
      expect(row.button).toContain("border-0")
      expect(row.button).toContain("bg-transparent")
      expect(row.button).not.toContain("hover:")
      expect(row.button).not.toMatch(/border-l-/)
      expect(row.button).toContain("text-gray-500")
      expect(row.button).toContain("font-normal")
      expect(row.button).toContain("forced-colors:text-[GrayText]")
      expect(row.button).toContain("min-h-8")
      expect(row.button).toContain("py-1.5")
      expect(row.button).toContain("pl-[22px]")
      expect(row.button).toContain("flex")
      expect(row.button).toContain("flex-wrap")
      expect(row.button).toContain("justify-between")
      expect(row.button).toContain("items-baseline")
      expect(row.button).toContain("gap-x-3")
      expect(row.button).toContain("sm:justify-start")
      expect(row.button).toContain("sm:gap-x-2")
      expect(row.title).toContain("text-[15px]")
      expect(row.statusLine).toContain("text-sm")
      expect(row.details).toContain("text-sm")
      expect(row.details).toContain("w-full")
      for (const cls of [row.title, row.statusLine, row.details]) {
        expect(cls).toContain("break-words")
        expect(cls).not.toMatch(/nowrap|truncate/)
      }
      expect(row.placesStatus).toBe(false)
    })
  }

  it("keeps the text at the card's text x, 32 px tall and without a poste colour", () => {
    const row = look({ view: state({ reserved: true }) })
    // The card: 6 px left border + 16 px padding; the quiet row: no border + 22 px padding.
    expect(row.button).toContain("pl-[22px]")
    expect(row.button).toContain("rounded-xl")
    expect(row.button).toContain("min-h-8")
  })
})

// Guard for WCAG 2.2 SC 1.4.11 Non-text Contrast: the 6 px left border identifies the poste on a
// card, against the white card ground. It must reach 3:1 on white for every option of the palette.
function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe("the list's poste colours", () => {
  it("uses the timeline bar's default shade for every option", () => {
    for (const { key } of COLOR_OPTIONS) {
      const barShade = getBarClasses("Peu importe", "default", key).split(" ")[0].replace("bg-", "")
      expect(getListBorderClass("Peu importe", key)).toBe(`border-l-${barShade}`)
    }
  })

  it("has a hex value and at least 3:1 against white for every option", () => {
    expect(Object.keys(LIST_BORDER_HEX).sort()).toEqual(COLOR_OPTIONS.map((o) => o.key).sort())
    for (const { key, label } of COLOR_OPTIONS) {
      const hex = LIST_BORDER_HEX[key as ColorKey]
      expect(hex, label).toMatch(/^#[0-9a-f]{6}$/i)
      expect(contrastRatio(hex, "#ffffff"), label).toBeGreaterThanOrEqual(3)
    }
  })
})
