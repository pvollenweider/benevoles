// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "vitest"
import { requireCaptureRevision, type ProductBuild } from "../product-build"
const proof: ProductBuild = { commit: "old", sourceTree: "tree", productSourceSha256: "hash", buildId: "build", snapshot: "/tmp/test", builtAt: "now" }
test("startup and final checks require current main without a pinned take", () => {
  requireCaptureRevision(proof, "old", null)
  assert.throws(() => requireCaptureRevision(proof, "new", null))
})
test("an already verified take may finish on its actual recorded revision", () => {
  requireCaptureRevision(proof, "new", { ...proof })
  assert.equal(proof.commit, "old")
})
test("pinning cannot accept a changed source, build or server snapshot", () => {
  for (const field of ["commit", "sourceTree", "productSourceSha256", "buildId", "snapshot", "builtAt"] as const) {
    assert.throws(() => requireCaptureRevision({ ...proof, [field]: "changed" }, "new", proof))
  }
})
