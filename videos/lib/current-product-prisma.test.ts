// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { assertCurrentVideoPrismaEnvironment as guard, assertCurrentVideoSnapshot as snapshot } from "./current-product-prisma"
import { test } from "vitest"

test("current-product-prisma guards", async () => {

  const db = "postgresql://video:example@localhost:45433/benevoles_video"
  for (const port of [43102, 43106, 43108, 43110, 43112, 43114]) guard(`http://localhost:${port}`, db, "production")
  for (const base of ["https://benevol.app", "http://localhost:3100", "http://localhost:3101", "http://localhost:43103", "http://localhost:43111", "http://localhost:43113", "http://localhost:43115", "http://localhost:43102/", "http://localhost:43102?org=default", "http://localhost:43102/admin", "http://127.0.0.1:43102"]) assert.throws(() => guard(base, db, "production"))
  for (const value of [undefined, "postgresql://video:example@external:45433/benevoles_video", "postgresql://video:example@localhost:5432/benevoles_video", "postgresql://video:example@localhost:45433/production", "https://localhost:45433/benevoles_video"]) assert.throws(() => guard("http://localhost:43102", value, "production"))
  assert.throws(() => guard("http://localhost:43102", db, "development"))
  for (const value of ["/Users/pol/Desktop/benevoles", "/tmp", "/tmp/benevoles-video-production.A/../root", "/tmp/benevoles-video-production.A/src", "/tmp/another.A"]) assert.throws(() => snapshot(value))
  snapshot("/tmp/benevoles-video-production.4YeEsm")
  snapshot("/private/tmp/benevoles-video-production.4YeEsm")
})
