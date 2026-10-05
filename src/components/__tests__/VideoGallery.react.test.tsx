/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import VideoGallery from "@/components/videos/VideoGallery"

afterEach(() => cleanup())

const emptyScript = { title: "x", stableId: null, sections: [], utilite: null, demonstration: null, resultatVisible: null, pointsAttention: null }
const manifest = (id: string, slug: string) => ({
  id, slug, title: "x", description: "x", language: "fr-CH", voice: "Kore", voiceStyle: "x",
  viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
  segments: [{ id: "s1", transcript: "t", fallbackDurationMs: 1000 }],
})

const videos = [
  {
    id: "EVENT_CREATE_BLANK",
    slug: "event-create-blank",
    title: "Créer un événement depuis une page blanche",
    description: "Construire un événement qui ne correspond à aucun modèle.",
    category: "event-lifecycle",
    themes: ["evenement-cycle-de-vie" as const],
    audience: ["organisateur" as const],
    level: "essentiel" as const,
    feature: "Création d'un événement",
    updatedAt: "2026-10-05",
    revision: 1,
    tags: ["événement", "brouillon"],
    published: false,
    durationMs: 6 * 60_000,
    manifest: manifest("EVENT_CREATE_BLANK", "event-create-blank"),
    script: emptyScript,
  },
  {
    id: "VOLUNTEER_REGISTER",
    slug: "volunteer-register-mobile",
    title: "S'inscrire comme bénévole depuis son téléphone",
    description: "Choisir un créneau et s'inscrire en moins d'une minute.",
    category: "volunteer-journey",
    themes: ["parcours-benevole" as const],
    audience: ["benevole" as const],
    level: "decouverte" as const,
    feature: "Inscription bénévole",
    updatedAt: "2026-10-05",
    revision: 1,
    tags: ["inscription", "mobile"],
    published: true,
    durationMs: 3 * 60_000,
    manifest: manifest("VOLUNTEER_REGISTER", "volunteer-register-mobile"),
    script: emptyScript,
  },
]

describe("VideoGallery — filters (theme, audience, tag, search)", () => {
  it("shows every video with no filter applied", () => {
    render(<VideoGallery videos={videos} />)
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
  })

  it("filters by theme", () => {
    render(<VideoGallery videos={videos} />)
    fireEvent.change(screen.getByLabelText("Thème"), { target: { value: "parcours-benevole" } })
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getByText("S'inscrire comme bénévole depuis son téléphone")).toBeInTheDocument()
  })

  it("filters by audience", () => {
    render(<VideoGallery videos={videos} />)
    fireEvent.change(screen.getByLabelText("Public"), { target: { value: "organisateur" } })
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getByText("Créer un événement depuis une page blanche")).toBeInTheDocument()
  })

  it("filters by free-text search, accent- and case-insensitively", () => {
    render(<VideoGallery videos={videos} />)
    fireEvent.change(screen.getByLabelText("Recherche"), { target: { value: "EVENEMENT" } })
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
  })

  it("shows the « Réinitialiser les filtres » button only once a filter is active, and it clears every filter", () => {
    render(<VideoGallery videos={videos} />)
    expect(screen.queryByRole("button", { name: "Réinitialiser les filtres" })).toBeNull()
    fireEvent.change(screen.getByLabelText("Thème"), { target: { value: "parcours-benevole" } })
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser les filtres" }))
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
  })

  it("shows the « à venir » state on an unpublished video's card", () => {
    render(<VideoGallery videos={videos} />)
    expect(screen.getByText("À venir")).toBeInTheDocument()
  })

  it("filters by level", () => {
    render(<VideoGallery videos={videos} />)
    fireEvent.change(screen.getByLabelText("Niveau"), { target: { value: "decouverte" } })
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getByText("S'inscrire comme bénévole depuis son téléphone")).toBeInTheDocument()
  })

  it("shows the level as text on the card", () => {
    render(<VideoGallery videos={videos} />)
    const list = screen.getByRole("list")
    expect(within(list).getByText("Essentiel")).toBeInTheDocument()
    expect(within(list).getByText("Découverte")).toBeInTheDocument()
  })

  it("the card's link accessible name is just the title, not the whole card's text", () => {
    render(<VideoGallery videos={videos} />)
    const link = screen.getByRole("link", { name: "Créer un événement depuis une page blanche" })
    expect(link).toBeInTheDocument()
    // The description and other card text aren't part of the link's name.
    expect(screen.queryByRole("link", { name: /Construire un événement/ })).toBeNull()
  })

  it("a video listed under several themes appears once in the gallery, never duplicated", () => {
    const multiTheme = {
      ...videos[0],
      id: "MULTI_THEME",
      slug: "multi-theme",
      title: "Vidéo sur deux thèmes",
      themes: ["evenement-cycle-de-vie" as const, "parcours-benevole" as const],
    }
    render(<VideoGallery videos={[...videos, multiTheme]} />)
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
    expect(screen.getAllByText("Vidéo sur deux thèmes")).toHaveLength(1)

    // Filtering by either of its two themes still shows it exactly once.
    fireEvent.change(screen.getByLabelText("Thème"), { target: { value: "evenement-cycle-de-vie" } })
    expect(screen.getAllByText("Vidéo sur deux thèmes")).toHaveLength(1)
    fireEvent.change(screen.getByLabelText("Thème"), { target: { value: "parcours-benevole" } })
    expect(screen.getAllByText("Vidéo sur deux thèmes")).toHaveLength(1)
  })
})

describe("VideoGallery — debounced result-count announcement", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("announces nothing on first render", () => {
    render(<VideoGallery videos={videos} />)
    const region = screen.getByRole("status", { hidden: true })
    expect(region).toHaveTextContent("")
  })

  it("announces the result count after the debounce pause, not per keystroke", () => {
    render(<VideoGallery videos={videos} />)
    const search = screen.getByLabelText("Recherche")
    fireEvent.change(search, { target: { value: "E" } })
    act(() => { vi.advanceTimersByTime(100) })
    fireEvent.change(search, { target: { value: "Ev" } })
    act(() => { vi.advanceTimersByTime(100) })
    expect(screen.queryByText("1 vidéo affichée.")).toBeNull()
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByText(/vidéo.* affichée/)).toBeInTheDocument()
  })

  it("announces the zero-results case in words", () => {
    render(<VideoGallery videos={videos} />)
    fireEvent.change(screen.getByLabelText("Recherche"), { target: { value: "ne-correspond-a-rien" } })
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByText("Aucune vidéo ne correspond.")).toBeInTheDocument()
  })
})
