/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"
import VideoFeedbackTable from "../super-admin/VideoFeedbackTable"
import type { FeedbackSummaryRow } from "@/lib/video-feedback"

// Video feedback table, sortable by column (#820): header buttons, aria-sort, announcement, URL.

const row = (videoId: string, title: string, yes: number, no: number): FeedbackSummaryRow =>
  ({ videoId, title, revision: 1, current: true, yes, no, total: yes + no })
const rows = [row("A", "Créer un événement", 1, 3), row("B", "Accueil", 5, 0), row("C", "Badges", 0, 0)]

const titles = () => screen.getAllByRole("rowheader").map((h) => within(h).getByRole("link").textContent)

afterEach(() => { cleanup(); window.history.replaceState(null, "", "/") })

describe("VideoFeedbackTable", () => {
  it("shows the page's order, no column sorted", () => {
    render(<VideoFeedbackTable rows={rows} initialSort={{ col: null, dir: "asc" }} />)
    expect(titles()).toEqual(["Créer un événement", "Accueil", "Badges"])
    for (const h of screen.getAllByRole("columnheader")) expect(h).toHaveAttribute("aria-sort", "none")
    expect(screen.getByRole("cell", { name: "aucune réponse" })).toBeInTheDocument()
  })

  it("sorts with the header button, says so, and keeps it in the URL", async () => {
    window.history.replaceState(null, "", "/super-admin/video-feedback")
    render(<VideoFeedbackTable rows={rows} initialSort={{ col: null, dir: "asc" }} />)
    const button = screen.getByRole("button", { name: "% utile" })
    fireEvent.click(button)
    expect(titles()).toEqual(["Créer un événement", "Accueil", "Badges"])
    expect(screen.getByRole("columnheader", { name: "% utile" })).toHaveAttribute("aria-sort", "ascending")
    expect(window.location.search).toBe("?tri=utile-asc")
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Trié par pourcentage utile, croissant"))

    fireEvent.click(button)
    expect(titles()).toEqual(["Accueil", "Créer un événement", "Badges"])
    expect(screen.getByRole("columnheader", { name: "% utile" })).toHaveAttribute("aria-sort", "descending")
    expect(window.location.search).toBe("?tri=utile-desc")

    fireEvent.click(button)
    expect(titles()).toEqual(["Créer un événement", "Accueil", "Badges"])
    expect(window.location.search).toBe("")
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Tri réinitialisé"))
  })

  it("starts from the sort in the URL", () => {
    render(<VideoFeedbackTable rows={rows} initialSort={{ col: "video", dir: "asc" }} />)
    expect(titles()).toEqual(["Accueil", "Badges", "Créer un événement"])
    expect(screen.getByRole("columnheader", { name: "Vidéo" })).toHaveAttribute("aria-sort", "ascending")
  })
})
