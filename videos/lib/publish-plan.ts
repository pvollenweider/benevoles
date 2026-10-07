// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What `make video-publish` must send to the media server (medias.benevol.app): only the files
 * that are new or whose content changed, compared by SHA-256. Pure, so the decision is tested on
 * its own; videos/tools/publish.ts does the reading, hashing and transfer.
 */

/**
 * Files of a rendered video served to viewers: the video, its captions, its transcript, and its
 * two posters (`<slug>.jpg` and the `<slug>-og.jpg` link preview, videos/tools/posters.ts).
 */
export const PUBLISHED_EXTENSIONS = [".mp4", ".vtt", ".txt", ".jpg", "-og.jpg"] as const

/** The two posters only: what `--posters-only` sends, never touching a published video or its captions. */
export const POSTER_EXTENSIONS = [".jpg", "-og.jpg"] as const

/**
 * `<slug>/<slug>.mp4`, `<slug>/<slug>-og.jpg` etc.: the path of a published file, relative to the
 * media root. With `postersOnly`, only the two posters.
 */
export function publishedFiles(slug: string, { postersOnly = false }: { postersOnly?: boolean } = {}): string[] {
  return (postersOnly ? POSTER_EXTENSIONS : PUBLISHED_EXTENSIONS).map((ext) => `${slug}/${slug}${ext}`)
}

/**
 * Parses `sha256sum` output (`<hash>  ./<path>` or `<hash>  <path>`, one per line) into
 * path → hash. Lines that do not look like a checksum are ignored.
 */
export function parseSha256Sum(output: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const line of output.split("\n")) {
    const match = /^([0-9a-f]{64})\s+\*?(?:\.\/)?(.+)$/.exec(line.trim())
    if (match) result.set(match[2], match[1])
  }
  return result
}

export type PublishPlan = {
  /** New on the server, or different content: to send. */
  upload: string[]
  /** Same content already on the server. */
  unchanged: string[]
  /** On the server but not part of what is published from here (kept; never deleted automatically). */
  extra: string[]
}

/** Compares local and remote checksums (path → hash). Paths are sorted for a stable output. */
export function planPublish(local: Map<string, string>, remote: Map<string, string>): PublishPlan {
  const upload: string[] = []
  const unchanged: string[] = []
  for (const [file, hash] of local) {
    if (remote.get(file) === hash) unchanged.push(file)
    else upload.push(file)
  }
  const extra = [...remote.keys()].filter((file) => !local.has(file))
  return { upload: upload.sort(), unchanged: unchanged.sort(), extra: extra.sort() }
}
