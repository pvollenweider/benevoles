// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The most disk the image optimiser (/_next/image) may keep in `.next/cache/images`
 * (next.config.ts `images.maximumDiskCacheSize`): past it, Next.js deletes the least recently used
 * files. Without a value Next.js takes half of the free disk space it sees at startup, which on
 * Kubernetes is the node's disk, far above the `sizeLimit` of the emptyDir mounted there
 * (k8s/deployment.yaml): a pod whose emptyDir passes its limit is evicted. A test keeps the volume
 * at least twice this size (src/lib/__tests__/k8s-hardening.test.ts).
 */
export const IMAGE_DISK_CACHE_MAX_BYTES = 200 * 1024 * 1024
