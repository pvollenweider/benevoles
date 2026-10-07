import { describe, it, expect } from "vitest"
import { DEFAULT_VIDEO_FRAME, frameAspectRatio, frameOrDefault, videoFrame } from "../video-frame"

// #773: the player reserves its frame before the media loads (CLS 0.24 on /videos/<ID> without it).
describe("videoFrame", () => {
  const viewport = { width: 1280, height: 800, deviceScaleFactor: 1 }

  it("prefers the render's measured size (videos/renders.json)", () => {
    expect(videoFrame({ render: { width: 1920, height: 1080 }, manifest: { viewport } })).toEqual({ width: 1920, height: 1080 })
  })

  it("falls back to the manifest's recording viewport without a render", () => {
    expect(videoFrame({ manifest: { viewport } })).toEqual({ width: 1280, height: 800 })
    expect(videoFrame({ render: null, manifest: { viewport } })).toEqual({ width: 1280, height: 800 })
  })

  it("ignores an unusable render or viewport size", () => {
    expect(videoFrame({ render: { width: 0, height: 800 }, manifest: { viewport } })).toEqual({ width: 1280, height: 800 })
    expect(videoFrame({ render: { width: Number.NaN, height: 800 }, manifest: { viewport: { width: -1, height: 800 } } })).toEqual(DEFAULT_VIDEO_FRAME)
  })

  it("defaults to 16:9 when nothing measured the frame", () => {
    expect(videoFrame({})).toEqual({ width: 1280, height: 720 })
    expect(videoFrame({ manifest: null })).toEqual({ width: 1280, height: 720 })
  })

  it("never hands out the shared default object", () => {
    const frame = videoFrame({})
    frame.width = 1
    expect(DEFAULT_VIDEO_FRAME.width).toBe(1280)
  })
})

describe("frameAspectRatio / frameOrDefault", () => {
  it("writes the CSS aspect-ratio value of a frame", () => {
    expect(frameAspectRatio({ width: 1280, height: 800 })).toBe("1280 / 800")
  })

  it("uses 16:9 for a missing or unusable frame", () => {
    expect(frameAspectRatio(undefined)).toBe("1280 / 720")
    expect(frameAspectRatio(null)).toBe("1280 / 720")
    expect(frameAspectRatio({ width: 1280, height: 0 })).toBe("1280 / 720")
    expect(frameOrDefault({ width: Number.POSITIVE_INFINITY, height: 720 })).toEqual(DEFAULT_VIDEO_FRAME)
  })

  it("keeps a usable frame as is", () => {
    expect(frameOrDefault({ width: 1080, height: 1920 })).toEqual({ width: 1080, height: 1920 })
  })
})
