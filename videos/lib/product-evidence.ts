// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Proven assembly lineage only; never visual/functional conformity. */
export function assembledOnTarget(options: {
  targetCommit: string
  timeline: { capturePurpose?: string; product?: { commit?: string; buildId?: string; productSourceSha256?: string } } | null
  mix: { videoSha256?: string; timelineSha256?: string } | null
  videoSha256: string | null
  timelineSha256: string | null
}): boolean {
  const { targetCommit, timeline, mix, videoSha256, timelineSha256 } = options
  const sha256 = /^[a-f0-9]{64}$/
  return /^[a-f0-9]{40}$/.test(targetCommit)
    && timeline?.capturePurpose === "narration-timed"
    && timeline.product?.commit === targetCommit
    && typeof timeline.product.buildId === "string" && timeline.product.buildId.length > 0
    && sha256.test(timeline.product.productSourceSha256 ?? "")
    && sha256.test(videoSha256 ?? "") && sha256.test(timelineSha256 ?? "")
    && mix?.videoSha256 === videoSha256 && mix?.timelineSha256 === timelineSha256
}
