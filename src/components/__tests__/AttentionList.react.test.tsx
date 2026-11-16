/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react"
import AttentionList from "../admin/AttentionList"
import AnnounceProvider from "../admin/AnnounceProvider"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

// « Ce qui demande votre attention » (#372): severity as text, a link naming its event, an empty state.

describe("AttentionList", () => {
  afterEach(cleanup)

  it("says so when nothing needs attention", () => {
    render(<AttentionList items={[]} />)
    expect(screen.getByRole("region", { name: "Ce qui demande votre attention" })).toHaveTextContent("Rien ne demande votre attention")
  })

  it("lists items with their severity as text and a link naming the event", () => {
    render(<AttentionList items={[
      { id: "milestones:e1", severity: "high", eventTitle: "Fête", message: "2 jalons sont en retard.", action: "Voir les jalons", href: "/admin/events/e1" },
      { id: "starting:e2", severity: "low", eventTitle: "Marché", message: "L'événement commence dans 3 jours.", action: "Ouvrir l'événement", href: "/admin/events/e2" },
    ]} />)
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText("Urgent")).toBeInTheDocument()
    expect(within(items[1]).getByText("Info")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /^Voir les jalons\s*:\s*Fête$/ })).toHaveAttribute("href", "/admin/events/e1")
  })

  it("« L'archiver » archives in place with a confirmation naming the event (#1098)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    render(
      <AnnounceProvider>
        <AttentionList items={[
          { id: "ended:e1", severity: "low", eventTitle: "Fête", message: "L'événement est terminé mais toujours publié.", action: "L'archiver", href: "/admin/events/e1", archiveEventId: "e1" },
        ]} />
      </AnnounceProvider>,
    )
    // A button, not a link back to the overview.
    expect(screen.queryByRole("link", { name: /archiver/ })).toBeNull()
    const opener = screen.getByRole("button", { name: /^L'archiver\s*:\s*Fête$/ })
    fireEvent.click(opener)
    const dialog = screen.getByRole("alertdialog", { name: "Archiver « Fête » ?" })
    const confirm = within(dialog).getByRole("button", { name: "Confirmer" })
    expect(confirm).toHaveFocus()
    // Annuler gives the focus back to the opener.
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuler" }))
    expect(screen.getByRole("button", { name: /^L'archiver/ })).toHaveFocus()

    fireEvent.click(screen.getByRole("button", { name: /^L'archiver/ }))
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/e1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ publicStatus: "archived" }) }))
    // The list's heading takes the focus, and the outcome is voiced.
    expect(screen.getByRole("heading", { name: "Ce qui demande votre attention" })).toHaveFocus()
    await waitFor(() => expect(screen.getByText("Événement archivé : Fête.")).toBeInTheDocument())
    vi.unstubAllGlobals()
  })
})
