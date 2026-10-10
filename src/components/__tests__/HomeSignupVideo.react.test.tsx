/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { hydrateRoot } from "react-dom/client"
import HomeSignupVideo from "@/components/public/HomeSignupVideo"
import type { HomeSignupVideo as HomeSignupVideoData } from "@/lib/home-signup-video"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const video: HomeSignupVideoData = {
  id: "VOLUNTEER_REGISTER",
  title: "S'inscrire comme bénévole",
  href: "/videos/VOLUNTEER_REGISTER",
  duration: "1 min",
  media: {
    video: "https://medias.benevol.app/x/x.mp4",
    captions: "https://medias.benevol.app/x/x.vtt",
    transcript: "https://medias.benevol.app/x/x.txt",
    poster: "https://medias.benevol.app/x/x.jpg",
  },
  frame: { width: 390, height: 844 },
}

// Stands for the hero's next/image still.
const still = <span role="img" aria-label="La page d'inscription sur un téléphone" />
const NAME = "Voir l'inscription en vidéo (1 min)"

describe("HomeSignupVideo (#765)", () => {
  it("renders the still and a plain link to the video's page on the server, no button and no video", () => {
    const html = renderToString(<HomeSignupVideo video={video}>{still}</HomeSignupVideo>)
    expect(html).toContain('href="/videos/VOLUNTEER_REGISTER"')
    expect(html).toContain("La page d&#x27;inscription sur un téléphone")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("<video")
  })

  it("hands the focus from the server link to the button when the link had it at hydration", async () => {
    const container = document.createElement("div")
    container.innerHTML = renderToString(<HomeSignupVideo video={video}>{still}</HomeSignupVideo>)
    document.body.appendChild(container)
    container.querySelector("a")!.focus()
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, <HomeSignupVideo video={video}>{still}</HomeSignupVideo>)
    })
    const button = container.querySelector("button")!
    expect(button).toHaveAccessibleName(NAME)
    expect(button).toHaveFocus()
    act(() => root?.unmount())
    container.remove()
  })

  it("loads nothing before the press, then plays in place with the focus on the player, captions and poster", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
    const { container } = render(<HomeSignupVideo video={video}>{still}</HomeSignupVideo>)
    expect(container.querySelector("video")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: NAME }))
    const player = container.querySelector("video")!
    expect(player).toHaveFocus()
    expect(player).not.toHaveAttribute("autoplay")
    expect(player).toHaveAttribute("poster", video.media.poster)
    expect(player.querySelector('track[kind="captions"][srclang="fr"]')).not.toBeNull()
    expect(play).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: NAME })).toBeNull()
    expect(screen.getByRole("link", { name: "Transcription et page de la vidéo" })).toHaveAttribute("href", "/videos/VOLUNTEER_REGISTER")
  })

  it("« Fermer la vidéo » pauses it, brings the still back and returns the focus to the trigger; reopening resumes", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
    const { container } = render(<HomeSignupVideo video={video}>{still}</HomeSignupVideo>)
    fireEvent.click(screen.getByRole("button", { name: NAME }))
    const player = container.querySelector("video")!

    fireEvent.click(screen.getByRole("button", { name: "Fermer la vidéo" }))
    expect(pause).toHaveBeenCalled()
    const trigger = screen.getByRole("button", { name: NAME })
    expect(trigger).toHaveFocus()
    expect(screen.getByRole("img", { name: "La page d'inscription sur un téléphone" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "Fermer la vidéo" })).toBeNull()

    fireEvent.click(trigger)
    expect(container.querySelector("video")).toBe(player)
  })
})
