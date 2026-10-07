// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import fs from "fs"
import path from "path"
import { describe, it, expect } from "vitest"

// /videos/<slug> (event-create-blank) redirects to the canonical /videos/<ID> (#644). Production
// answered 307, a temporary redirect: search engines then keep the alias as a URL of its own (#759).
describe("video slug alias redirect", () => {
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/videos/[id]/page.tsx"), "utf-8")

  it("is permanent (308), not temporary", () => {
    expect(page).toMatch(/if \(isSlug\) permanentRedirect\(/)
    expect(page).not.toMatch(/(?<![A-Za-z])redirect\(/)
  })
})
