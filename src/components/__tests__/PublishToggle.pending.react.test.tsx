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
    expect(await screen.findByText(PUBLICATION_REQUESTED_MESSAGE)).toHaveAttribute("role", "status")
    expect(fetch).toHaveBeenCalledWith("/api/admin/events/evt-a/publication-request", { method: "POST" })
    expect(button).toHaveFocus()
    expect(button).toHaveAccessibleDescription(PUBLICATION_REQUESTED_MESSAGE)
  })

  it("keeps « Publier » in a validated space", () => {
    render(<PublishToggle eventId="evt-a" currentStatus="draft" />)
    expect(screen.getByRole("button", { name: "Publier" })).toBeInTheDocument()
  })
})
