import { describe, it, expect } from "vitest"
import { HOME_SIGNUP_VIDEO_ID, homeSignupVideo } from "../home-signup-video"
import { loadVideoCatalog } from "../video-catalog-load"

// The homepage's phone plays the volunteer sign-up tutorial in place (#765).
describe("homeSignupVideo", () => {
  const catalog = loadVideoCatalog()
  const base = "https://medias.example.org/"

  it("is the published volunteer sign-up video of the real catalogue, linked to its page, portrait, with a poster", () => {
    const video = homeSignupVideo(catalog, base)
    expect(video).not.toBeNull()
    expect(video!.id).toBe(HOME_SIGNUP_VIDEO_ID)
    expect(video!.href).toBe(`/videos/${HOME_SIGNUP_VIDEO_ID}`)
    expect(video!.duration).toMatch(/^\d+ min$/)
    expect(video!.frame.height).toBeGreaterThan(video!.frame.width)
    expect(video!.media.video).toMatch(/^https:\/\/medias\.example\.org\/.+\.mp4$/)
    expect(video!.media.captions).toMatch(/\.vtt$/)
    expect(video!.media.poster).toBeDefined()
  })

  it("is null without a media base: the phone stays a still image", () => {
    expect(homeSignupVideo(catalog, undefined)).toBeNull()
    expect(homeSignupVideo(catalog, "")).toBeNull()
  })

  it("is null when the video is not published", () => {
    const unpublished = catalog.map((v) => (v.id === HOME_SIGNUP_VIDEO_ID ? { ...v, published: false } : v))
    expect(homeSignupVideo(unpublished, base)).toBeNull()
  })
})
