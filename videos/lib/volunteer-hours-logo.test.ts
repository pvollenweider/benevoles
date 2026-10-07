// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { createHoursLogo, assertHoursLogo } from "./volunteer-hours-logo"
import { test } from "vitest"

test("volunteer-hours-logo guards", async () => {
  async function main() {
    const expected = { ...await createHoursLogo(), organizationId: "video-hours" }
    await assertHoursLogo(expected)
    for (const changed of [null, { ...expected, organizationId: "default" }, { ...expected, width: 241 }, { ...expected, hash: "unknown" }, { ...expected, data: Buffer.from("unknown") }]) await assert.rejects(() => assertHoursLogo(changed))
    console.log("Hours logo byte/dimension/ownership guards passed, no database or browser")
  }
  await main()
})
