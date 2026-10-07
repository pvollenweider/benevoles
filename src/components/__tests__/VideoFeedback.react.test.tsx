/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import VideoFeedback from "@/components/videos/VideoFeedback"
import { feedbackStorageKey } from "@/lib/video-feedback"

// « Cette vidéo vous a-t-elle été utile ? » (#646).

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

async function settle() {
  await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
  await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
}

function stubFetch(status: number) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const props = { videoId: "EVENT_CREATE_BLANK", revision: 2, audience: ["organisateur"] as const, context: "masterclass" as const }

describe("VideoFeedback", () => {
  it("asks with « vous » and two real buttons in a named group (not a landmark), shown before the video ends", () => {
    render(<VideoFeedback {...props} />)
    expect(screen.getByRole("heading", { level: 2, name: "Cette vidéo vous a-t-elle été utile ?" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Cette vidéo vous a-t-elle été utile ?" })).toBeInTheDocument()
    expect(screen.queryByRole("region")).toBeNull()
    expect(screen.getByRole("button", { name: "Oui" })).toHaveAttribute("type", "button")
    expect(screen.getByRole("button", { name: "Non" })).toHaveAttribute("type", "button")
  })

  it("asks with « tu » for a volunteer-only video", () => {
    render(<VideoFeedback {...props} audience={["benevole"]} />)
    expect(screen.getByRole("heading", { name: "Cette vidéo t'a-t-elle été utile ?" })).toBeInTheDocument()
  })

  it("posts the answer, replaces the buttons by a thank-you that takes focus, without announcing it twice", async () => {
    const fetchMock = stubFetch(201)
    render(<VideoFeedback {...props} context="documentation" />)
    const no = screen.getByRole("button", { name: "Non" })
    no.focus()
    await act(async () => { fireEvent.click(no) })
    await settle()

    expect(fetchMock).toHaveBeenCalledWith("/api/public/video-feedback", expect.objectContaining({ method: "POST" }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ videoId: "EVENT_CREATE_BLANK", revision: 2, useful: false, context: "documentation" })
    expect(screen.queryByRole("button", { name: "Oui" })).toBeNull()
    const thanks = screen.getByText("Merci pour votre réponse.", { selector: "p" })
    expect(thanks).toHaveFocus()
    // Focus voices it; the status region stays empty (#646 accessibility review).
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
    expect(localStorage.getItem(feedbackStorageKey("EVENT_CREATE_BLANK", 2))).toBe("no")
  })

  it("shows « déjà répondu » instead of the buttons when this browser already answered this revision", async () => {
    localStorage.setItem(feedbackStorageKey("EVENT_CREATE_BLANK", 2), "yes")
    render(<VideoFeedback {...props} />)
    await settle()
    expect(screen.queryByRole("button", { name: "Oui" })).toBeNull()
    expect(screen.getByText("Vous avez déjà répondu pour cette vidéo. Merci.")).toBeInTheDocument()
    // Same reserved area as the buttons it replaces after hydration (#773, no layout shift).
    expect(screen.getByText("Vous avez déjà répondu pour cette vidéo. Merci.").parentElement).toHaveClass("min-h-[2.375rem]")
    // Not announced on load: nothing happened.
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
  })

  it("asks again for a new revision of a video answered before", async () => {
    localStorage.setItem(feedbackStorageKey("EVENT_CREATE_BLANK", 1), "yes")
    render(<VideoFeedback {...props} />)
    await settle()
    expect(screen.getByRole("button", { name: "Oui" })).toBeInTheDocument()
  })

  it("keeps the buttons and focus, and announces the error, when the answer isn't recorded", async () => {
    stubFetch(500)
    render(<VideoFeedback {...props} />)
    const yes = screen.getByRole("button", { name: "Oui" })
    yes.focus()
    await act(async () => { fireEvent.click(yes) })
    await settle()
    expect(yes).toHaveFocus()
    expect(screen.getByRole("status")).toHaveTextContent("Votre réponse n'a pas pu être enregistrée. Réessayez dans un moment.")
    // The visible error describes both buttons.
    for (const name of ["Oui", "Non"]) {
      expect(screen.getByRole("button", { name })).toHaveAccessibleDescription("Votre réponse n'a pas pu être enregistrée. Réessayez dans un moment.")
    }
    expect(localStorage.getItem(feedbackStorageKey("EVENT_CREATE_BLANK", 2))).toBeNull()
  })

  it("asks to reload when the video was regenerated meanwhile (409)", async () => {
    stubFetch(409)
    render(<VideoFeedback {...props} />)
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Oui" })) })
    await settle()
    expect(screen.getByRole("status")).toHaveTextContent("Cette vidéo a été mise à jour. Rechargez la page pour répondre.")
  })

  it("sends one request even when clicked twice while it runs", async () => {
    let resolve: (r: Response) => void = () => {}
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((r) => { resolve = r }))
    vi.stubGlobal("fetch", fetchMock)
    render(<VideoFeedback {...props} />)
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Oui" })) })
    expect(screen.getByRole("button", { name: "Non" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("group")).toHaveAttribute("aria-busy", "true")
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Non" })) })
    await act(async () => { resolve(new Response("{}", { status: 201 })) })
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
