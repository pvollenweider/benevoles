/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import PublishToggle from "../admin/PublishToggle"
import { PUBLICATION_REQUESTED_MESSAGE } from "@/lib/org-approval"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

describe("PublishToggle in a space awaiting validation (#810)", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("asks for the publication instead of publishing, and says what happens next", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, message: PUBLICATION_REQUESTED_MESSAGE }) })
    vi.stubGlobal("fetch", fetch)
    render(<PublishToggle eventId="evt-a" currentStatus="draft" awaitingValidation />)

    expect(screen.queryByRole("button", { name: "Publier" })).toBeNull()
    const button = screen.getByRole("button", { name: "Demander la publication" })
    button.focus()
    fireEvent.click(button)
    // A polite live region, not role="status": in the event header it must not add a second status region to the page.
    expect(await screen.findByText(PUBLICATION_REQUESTED_MESSAGE)).toHaveAttribute("aria-live", "polite")
    expect(fetch).toHaveBeenCalledWith("/api/admin/events/evt-a/publication-request", { method: "POST" })
    expect(button).toHaveFocus()
    expect(button).toHaveAccessibleName("Demande envoyée")
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(button).toHaveAccessibleDescription(PUBLICATION_REQUESTED_MESSAGE)
    // Already sent: a second click asks nothing more.
    fireEvent.click(button)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("keeps « Publier » in a validated space", () => {
    render(<PublishToggle eventId="evt-a" currentStatus="draft" />)
    expect(screen.getByRole("button", { name: "Publier" })).toBeInTheDocument()
  })
})
