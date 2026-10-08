import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { posterPreloadOptions, VIDEO_CROSS_ORIGIN } from "../video-cors"

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8")

describe("poster preload in the player's CORS mode", () => {
  it("preloads the poster as a high-priority image, in the player's CORS mode", () => {
    expect(posterPreloadOptions()).toEqual({ as: "image", fetchPriority: "high", crossOrigin: "anonymous" })
    expect(posterPreloadOptions().crossOrigin).toBe(VIDEO_CROSS_ORIGIN)
  })

  // Regression: the preload had no crossorigin while <video crossOrigin="anonymous"> fetches its
  // poster in CORS mode; the browser ignored the preload and downloaded the poster twice.
  it("uses the same constant in the player and in the detail page's preload", () => {
    expect(read("src/components/videos/VideoPlayer.tsx")).toContain("crossOrigin={VIDEO_CROSS_ORIGIN}")
    expect(read("src/components/videos/VideoPlayer.tsx")).not.toMatch(/^\s*crossOrigin="/m)
    expect(read("src/app/videos/[id]/page.tsx")).toContain("preload(mediaUrls.poster, posterPreloadOptions())")
  })
})
