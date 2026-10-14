// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"

// Tailwind applies variants left to right: `hover:prose-a:decoration-2` compiles to
// `.x:hover :where(a)`, so hovering anywhere over a text block thickened (or, on event pages,
// underlined) every link in it. The link's own hover is `prose-a:hover:…` (`.x :where(a):hover`).
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "__tests__" || name === "generated" ? [] : sourceFiles(path)
    return /\.(tsx?|css)$/.test(name) ? [path] : []
  })
}

describe("hover styles on links inside prose", () => {
  it("target the hovered link, never every link of the hovered block", () => {
    const offenders = sourceFiles(join(process.cwd(), "src")).filter((file) => /(^|[\s"'`])hover:prose-[a-z]+:/m.test(readFileSync(file, "utf8")))
    expect(offenders).toEqual([])
  })
})
