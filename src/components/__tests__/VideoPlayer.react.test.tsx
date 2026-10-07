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

describe("VideoPlayer — reserved frame (#773, no layout shift)", () => {
  it("gives the wrapper and the video the frame's ratio and size before any metadata", () => {
    render(<VideoPlayer title="Titre" mediaUrls={mediaUrls} frame={{ width: 1280, height: 800 }} />)
    const video = document.querySelector("video")!
    expect(video).toHaveAttribute("width", "1280")
    expect(video).toHaveAttribute("height", "800")
    expect(video.style.aspectRatio).toBe("1280 / 800")
    expect(video.parentElement!.style.aspectRatio).toBe("1280 / 800")
  })

  it("reserves 16:9 when the frame is unknown", () => {
    render(<VideoPlayer title="Titre" mediaUrls={mediaUrls} />)
    const video = document.querySelector("video")!
    expect(video).toHaveAttribute("width", "1280")
    expect(video).toHaveAttribute("height", "720")
    expect(video.parentElement!.style.aspectRatio).toBe("1280 / 720")
  })

  it("keeps the same box when swapping to the fallback, without a video", async () => {
    render(<VideoPlayer title="Titre" mediaUrls={mediaUrls} frame={{ width: 1280, height: 800 }} />)
    const box = document.querySelector("video")!.parentElement!
    fireEvent.error(document.querySelector("video")!)
    await settle()
    const fallback = document.querySelector("[tabindex='-1']")!
    expect(fallback.parentElement).toBe(box)
    expect(box.style.aspectRatio).toBe("1280 / 800")
    expect(fallback).toHaveClass("h-full", "w-full")
  })

  // A portrait capture (390x844) at full column width ran far below the screen, controls out of
  // view at high zoom: its width is capped so the height stays within 80vh.
  it("caps a portrait frame's width so it never grows taller than the screen", () => {
    render(<VideoPlayer title="Titre" mediaUrls={mediaUrls} frame={{ width: 390, height: 844 }} />)
    expect(document.querySelector("video")!.parentElement!.style.maxWidth).toBe("min(100%, calc(80vh * 390 / 844))")
  })

  it("leaves a landscape frame at full width", () => {
    render(<VideoPlayer title="Titre" mediaUrls={mediaUrls} frame={{ width: 1280, height: 800 }} />)
    expect(document.querySelector("video")!.parentElement!.style.maxWidth).toBe("")
  })

  it("reserves the frame for the « bientôt disponible » message too", () => {
    render(<VideoPlayer title="Titre" mediaUrls={null} frame={{ width: 1280, height: 800 }} />)
    expect(screen.getByText("Vidéo bientôt disponible.").closest("[tabindex='-1']")!.parentElement!.style.aspectRatio).toBe("1280 / 800")
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
