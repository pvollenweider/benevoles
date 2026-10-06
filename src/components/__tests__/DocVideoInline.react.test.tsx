/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { hydrateRoot } from "react-dom/client"
import DocVideoInline from "@/components/videos/DocVideoInline"
import VideoPlayer from "@/components/videos/VideoPlayer"
import { markAutoplayIntent } from "@/lib/video-autoplay"
import type { DocVideoPlayer } from "@/lib/doc-video-references"

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const player: DocVideoPlayer = {
  id: "ORG_FIRST_STEPS",
  title: "Bien démarrer",
  label: "Voir la vidéo : Bien démarrer (3 min)",
  libraryHref: "/videos/ORG_FIRST_STEPS?from=doc",
  revision: 2,
  audience: ["organisateur"],
  media: {
    video: "https://medias.benevol.app/x/x.mp4",
    captions: "https://medias.benevol.app/x/x.vtt",
    transcript: "https://medias.benevol.app/x/x.txt",
  },
  aspectRatio: "1280 / 800",
  transcript: ["Premier passage.", "Second passage."],
}

const button = () => screen.getByRole("button", { name: "Voir la vidéo : Bien démarrer (3 min)" })

// A documentation unit opens its video in place (owner decision), as a disclosure.
describe("DocVideoInline", () => {
  it("renders the plain link to the library on the server (no JavaScript), no button and no video", () => {
    const html = renderToString(<DocVideoInline player={player} />)
    expect(html).toContain('href="/videos/ORG_FIRST_STEPS?from=doc"')
    expect(html).toContain("data-doc-video")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("<video")
  })

  it("hands the focus from the server link to the button when the link had it at hydration", async () => {
    const container = document.createElement("div")
    container.innerHTML = renderToString(<DocVideoInline player={player} />)
    document.body.appendChild(container)
    const link = container.querySelector("a")!
    link.focus()
    expect(link).toHaveFocus()
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, <DocVideoInline player={player} />)
    })
    expect(container.querySelector("a")).toBeNull()
    expect(container.querySelector("button")).toHaveFocus()
    act(() => root!.unmount())
    container.remove()
  })

  it("leaves the focus alone at hydration when the link didn't have it", async () => {
    const container = document.createElement("div")
    container.innerHTML = renderToString(<DocVideoInline player={player} />)
    document.body.appendChild(container)
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, <DocVideoInline player={player} />)
    })
    expect(container.querySelector("button")).not.toHaveFocus()
    act(() => root!.unmount())
    container.remove()
  })

  it("draws a visible focus outline on the button, like the links of the page", () => {
    render(<DocVideoInline player={player} />)
    expect(button().className).toMatch(/focus-visible:outline-2/)
    expect(button().className).toMatch(/focus-visible:outline-blue-600/)
  })

  it("is a collapsed disclosure once hydrated, with nothing downloaded yet", () => {
    render(<DocVideoInline player={player} />)
    const b = button()
    expect(b).toHaveAttribute("aria-expanded", "false")
    const region = document.getElementById(b.getAttribute("aria-controls")!)
    expect(region).not.toBeNull()
    expect(region).not.toBeVisible()
    expect(document.querySelector("video")).toBeNull()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("reveals the player with French captions, the feedback, the transcript and the library link, focus left on the button", () => {
    render(<DocVideoInline player={player} />)
    const b = button()
    b.focus()
    fireEvent.click(b)
    expect(b).toHaveAttribute("aria-expanded", "true")
    expect(b).toHaveFocus()
    const video = document.querySelector("video")!
    expect(video).toBeVisible()
    expect(video).not.toHaveAttribute("autoplay")
    expect(video.style.aspectRatio).toBe("1280 / 800")
    expect(video.querySelector('track[kind="captions"]')).toHaveAttribute("srclang", "fr")
    expect(screen.getByRole("group", { name: "Cette vidéo vous a-t-elle été utile ?" })).toBeInTheDocument()
    // The question is not a heading: it would open a section in the unit's outline.
    expect(screen.queryByRole("heading")).toBeNull()
    expect(screen.getByText("Transcription")).toBeInTheDocument()
    expect(screen.getByText("Second passage.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ouvrir dans la bibliothèque" })).toHaveAttribute("href", "/videos/ORG_FIRST_STEPS?from=doc")
  })

  it("never autoplays, even with a gallery autoplay intent left in the session, and leaves the intent alone", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
    markAutoplayIntent()
    render(<DocVideoInline player={player} />)
    fireEvent.click(button())
    expect(play).not.toHaveBeenCalled()
    expect(sessionStorage.getItem("benevol:video-autoplay-intent")).toBe("1")
  })

  it("hides the player and pauses it on a second press, then shows the same player again", () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
    render(<DocVideoInline player={player} />)
    const b = button()
    fireEvent.click(b)
    const video = document.querySelector("video")!
    fireEvent.click(b)
    expect(b).toHaveAttribute("aria-expanded", "false")
    expect(pause).toHaveBeenCalledTimes(1)
    expect(video).not.toBeVisible()
    fireEvent.click(b)
    expect(document.querySelector("video")).toBe(video)
    expect(video).toBeVisible()
  })

  it("omits the transcript disclosure when the video has no transcript", () => {
    render(<DocVideoInline player={{ ...player, transcript: [] }} />)
    fireEvent.click(button())
    expect(screen.queryByText("Transcription")).toBeNull()
  })
})

describe("VideoPlayer galleryAutoplay", () => {
  it("still autoplays on the video page by default (gallery intent)", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
    markAutoplayIntent()
    render(<VideoPlayer title="T" mediaUrls={player.media} />)
    expect(play).toHaveBeenCalledTimes(1)
  })
})
