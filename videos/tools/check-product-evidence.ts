// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { assembledOnTarget } from "../lib/product-evidence"
const valid = {
  targetCommit: "a".repeat(40),
  timeline: { capturePurpose: "narration-timed", product: { commit: "a".repeat(40), buildId: "fixture-build", productSourceSha256: "b".repeat(64) } },
  mix: { videoSha256: "c".repeat(64), timelineSha256: "d".repeat(64) },
  videoSha256: "c".repeat(64), timelineSha256: "d".repeat(64),
}
assert.equal(assembledOnTarget(valid), true)
assert.equal(assembledOnTarget({ ...valid, timeline: null }), false)
assert.equal(assembledOnTarget({ ...valid, mix: null }), false)
assert.equal(assembledOnTarget({ ...valid, videoSha256: null }), false)
assert.equal(assembledOnTarget({ ...valid, timelineSha256: "e".repeat(64) }), false, "new capture cannot certify the old MP4")
assert.equal(assembledOnTarget({ ...valid, videoSha256: "e".repeat(64) }), false, "assembly metadata cannot certify a replaced MP4")
assert.equal(assembledOnTarget({ ...valid, targetCommit: "e".repeat(40) }), false, "main advanced")
assert.equal(assembledOnTarget({ ...valid, timeline: { ...valid.timeline, capturePurpose: "rehearsal" } }), false)
assert.equal(assembledOnTarget({ ...valid, timeline: { ...valid.timeline, product: { ...valid.timeline.product, buildId: "" } } }), false)
assert.equal(assembledOnTarget({ ...valid, timeline: { ...valid.timeline, product: { ...valid.timeline.product, productSourceSha256: "missing" } } }), false)
console.log("Product lineage checks passed: stale/replaced MP4, new timeline, old main, rehearsal and missing proof rejected. No visual certification.")
