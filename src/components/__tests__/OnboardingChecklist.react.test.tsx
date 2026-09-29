/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react"

const refresh = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

import OnboardingChecklist from "../admin/OnboardingChecklist"
import { onboardingSteps } from "@/lib/onboarding"

// First-run checklist (#369): an ordered list, each step's state readable as text, the next step
// marked, and a way to hide it for the organization.

const steps = onboardingSteps({
  publicTitle: null, charterCustomized: false, timeZone: null,
  firstEventId: "e1", activeShiftCount: 0, publishedEventUrl: null, registrationCount: 0,
})

describe("OnboardingChecklist", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

  it("is a labelled section with an ordered list and the progress", () => {
    render(<OnboardingChecklist steps={steps} />)
    const section = screen.getByRole("region", { name: "Premiers pas" })
    expect(within(section).getByText(/1 étape sur 4 terminée/)).toBeInTheDocument()
    const items = within(section).getAllByRole("listitem")
    expect(items).toHaveLength(6)
    expect(section.querySelector("ol")).not.toBeNull()
  })

  it("spells out each step's state and marks the next one", () => {
    render(<OnboardingChecklist steps={steps} />)
    const next = screen.getByRole("link", { name: "Définir les postes et les créneaux" })
    expect(next).toHaveAttribute("aria-current", "step")
    expect(next).toHaveAttribute("href", "/admin/events/e1/shifts")
    expect(screen.getByText(/— prochaine étape/)).toBeInTheDocument()
    expect(screen.getByText(/— fait/)).toBeInTheDocument()
    expect(screen.getAllByText(/— facultatif/)).toHaveLength(2)
  })

  it("hides the list for the organization", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    render(<OnboardingChecklist steps={steps} />)
    fireEvent.click(screen.getByRole("button", { name: "Masquer ces étapes" }))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(fetch).toHaveBeenCalledWith("/api/admin/settings/organization", expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ onboardingDismissed: true }),
    }))
  })

  it("says so when hiding fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")))
    render(<OnboardingChecklist steps={steps} />)
    fireEvent.click(screen.getByRole("button", { name: "Masquer ces étapes" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Impossible de masquer la liste"))
  })
})
