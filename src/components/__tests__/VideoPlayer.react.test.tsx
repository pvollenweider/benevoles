/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import VideoPlayer from "@/components/videos/VideoPlayer"
import { markAutoplayIntent } from "@/lib/video-autoplay"

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.unstubAllGlobals()
})

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion: reduce") ? reduce : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

const mediaUrls = {
  video: "https://medias.benevol.app/x/x.mp4",
  captions: "https://medias.benevol.app/x/x.vtt",
  transcript: "https://medias.benevol.app/x/x.txt",
}

async function settle() {
  await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
  await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
}

describe("VideoPlayer — fallback on error (#644 accessibility review)", () => {
  it("shows the fallback without a player when mediaUrls is null, no video rendered", () => {
    render(<VideoPlayer title="Titre" mediaUrls={null} />)
    expect(screen.getByText("Vidéo bientôt disponible.")).toBeInTheDocument()
    expect(document.querySelector("video")).toBeNull()
  })

  it("shows the poster only when the media URLs carry one", () => {
    const { unmount } = render(<VideoPlayer title="Titre" mediaUrls={{ ...mediaUrls, poster: "https://medias.benevol.app/x/x.jpg" }} />)
    expect(document.querySelector("video")).toHaveAttribute("poster", "https://medias.benevol.app/x/x.jpg")
    unmount()
    render(<VideoPlayer title="Titre" mediaUrls={mediaUrls} />)
    expect(document.querySelector("video")).not.toHaveAttribute("poster")
  })

  it("announces nothing before any error", () => {
    render(<VideoPlayer title="Titre" mediaUrls={mediaUrls} />)
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("")
  })

  it("on error, swaps to the fallback and announces it, moving focus to it when focus was on the player", async () => {
    render(<VideoPlayer title="Titre" mediaUrls={mediaUrls} />)
    const video = document.querySelector("video")!
    video.focus()
    expect(video).toHaveFocus()

    fireEvent.error(video)
    await settle()

    const fallback = document.querySelector("[tabindex='-1']")!
    expect(fallback).toHaveTextContent("Vidéo bientôt disponible.")
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("Vidéo bientôt disponible.")
    expect(fallback).toHaveFocus()
  })

  it("on error, never steals focus when focus was elsewhere on the page", async () => {
    render(
      <div>
        <button>Un autre bouton</button>
        <VideoPlayer title="Titre" mediaUrls={mediaUrls} />
      </div>,
    )
    const elsewhere = screen.getByRole("button", { name: "Un autre bouton" })
    elsewhere.focus()
    expect(elsewhere).toHaveFocus()

    const video = document.querySelector("video")!
    fireEvent.error(video)
    await settle()

    const fallback = document.querySelector("[tabindex='-1']")!
    expect(fallback).toHaveTextContent("Vidéo bientôt disponible.")
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("Vidéo bientôt disponible.")
    expect(elsewhere).toHaveFocus()
  })
})

describe("VideoPlayer — autoplay (#644 owner decision)", () => {
  it("calls play() when arriving from the gallery and motion is allowed", async () => {
    stubReducedMotion(false)
    markAutoplayIntent()
    const play = vi.fn().mockResolvedValue(undefined)
    window.HTMLMediaElement.prototype.play = play

    render(<VideoPlayer title="Titre" mediaUrls={mediaUrls} />)
    await settle()

    expect(play).toHaveBeenCalledTimes(1)
  })

  it("never calls play() on a direct visit (no autoplay intent marked)", async () => {
    stubReducedMotion(false)
    const play = vi.fn().mockResolvedValue(undefined)
    window.HTMLMediaElement.prototype.play = play

    render(<VideoPlayer title="Titre" mediaUrls={mediaUrls} />)
    await settle()

    expect(play).not.toHaveBeenCalled()
  })

  it("never calls play() under prefers-reduced-motion: reduce, even from the gallery", async () => {
    stubReducedMotion(true)
    markAutoplayIntent()
    const play = vi.fn().mockResolvedValue(undefined)
    window.HTMLMediaElement.prototype.play = play

    render(<VideoPlayer title="Titre" mediaUrls={mediaUrls} />)
    await settle()

    expect(play).not.toHaveBeenCalled()
  })

  it("reads the autoplay intent once: a second player mount in the same session doesn't autoplay again", async () => {
    stubReducedMotion(false)
    markAutoplayIntent()
    const play = vi.fn().mockResolvedValue(undefined)
    window.HTMLMediaElement.prototype.play = play

    const { unmount } = render(<VideoPlayer title="Titre" mediaUrls={mediaUrls} />)
    await settle()
    expect(play).toHaveBeenCalledTimes(1)
    unmount()

    render(<VideoPlayer title="Titre" mediaUrls={mediaUrls} />)
    await settle()
    expect(play).toHaveBeenCalledTimes(1) // still 1, not 2
  })

  it("a rejected play() (browser autoplay policy) leaves the player usable, no crash, no fallback", async () => {
    stubReducedMotion(false)
    markAutoplayIntent()
    const play = vi.fn().mockRejectedValue(new DOMException("blocked", "NotAllowedError"))
    window.HTMLMediaElement.prototype.play = play

    render(<VideoPlayer title="Titre" mediaUrls={mediaUrls} />)
    await settle()

    expect(play).toHaveBeenCalledTimes(1)
    // Still the normal player, not the "coming soon" fallback — the rejection didn't trigger onError.
    expect(document.querySelector("video")).toBeInTheDocument()
    expect(screen.queryByText("Vidéo bientôt disponible.")).toBeNull()
  })

  it("never autoplays when there's no media to play (no VIDEO_MEDIA_BASE_URL)", async () => {
    stubReducedMotion(false)
    markAutoplayIntent()
    const play = vi.fn().mockResolvedValue(undefined)
    window.HTMLMediaElement.prototype.play = play

    render(<VideoPlayer title="Titre" mediaUrls={null} />)
    await settle()

    expect(play).not.toHaveBeenCalled()
  })

  it("does not use the autoplay attribute", () => {
    stubReducedMotion(false)
    render(<VideoPlayer title="Titre" mediaUrls={mediaUrls} />)
    expect(document.querySelector("video")).not.toHaveAttribute("autoplay")
  })
})
