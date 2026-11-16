// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The only local files the image optimiser (/_next/image, next.config.ts `images.localPatterns`)
 * may fetch and resize: the screenshots of public/doc-img, the one folder `next/image` loads from
 * (the home page). Any other path, the API routes among them, gets a 400 instead of an internal
 * request. A new `next/image` source outside it is declared here (src/lib/__tests__/image-local-patterns.test.ts).
 */
export const IMAGE_LOCAL_PATTERNS = [{ pathname: "/doc-img/**", search: "" }] as const
