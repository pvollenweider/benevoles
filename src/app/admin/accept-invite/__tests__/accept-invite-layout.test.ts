// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { metadata } from "../layout"

// The activation page is a client component: its title comes from this server layout (#1142).
describe("accept-invite layout", () => {
  it("gives the activation page its own browser title", () => {
    expect(metadata.title).toBe("Activer votre compte")
  })
})
