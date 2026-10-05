// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

/**
 * Every text colour of the email templates reaches WCAG 2.2 AA (1.4.3, 4.5:1) on the white card
 * (#680): the grey footers, the « benevol.app » link, the unsubscribe line and the waitlist expiry
 * warning used to be between 1.9:1 and 3.6:1. Colours on a coloured background (the button) and
 * the hidden preheader are listed explicitly.
 */
const DIR = path.join(process.cwd(), "src/lib/notifications/templates")

function luminance(hex: string): number {
  const h = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrastOnWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05)

describe("email text colours", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".ts"))
  const uses = files.flatMap((f) =>
    readFileSync(path.join(DIR, f), "utf8").split("\n").flatMap((line, i) =>
      [...line.matchAll(/(?<![-\w])color:#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)].map((m) => ({ where: `${f}:${i + 1}`, hex: m[1], line })),
    ),
  )

  it("finds the template colours (sanity)", () => {
    expect(uses.length).toBeGreaterThan(20)
  })

  it("every text colour on the white card reaches 4.5:1", () => {
    const onColouredOrHidden = (line: string) => /background:#(?!fff)/i.test(line) || /display:none/.test(line)
    const failing = uses
      .filter((u) => !onColouredOrHidden(u.line))
      .filter((u) => contrastOnWhite(u.hex) < 4.5)
      .map((u) => `${u.where} #${u.hex} ${contrastOnWhite(u.hex).toFixed(2)}:1`)
    expect(failing).toEqual([])
  })
})
