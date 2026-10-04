/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import MemberMergeFlow from "@/components/admin/MemberMergeFlow"

// MemberMergeFlow (#600): the state machine from picking a duplicate through the preview,
// resolving a blocking conflict, confirming in the ModalShell, to the result. Accessibility
// review follow-up: the search results and preview loads are announced once through the single
// persistent live region, focus moves to the preview heading then the result heading, and a
// blocking conflict keeps the merge button non-actionable (aria-disabled, not removed from the
// tab order) until it's resolved.

const KEEP = { id: "keep-1", firstName: "Jean", lastName: "Dupont", email: "jean.keep@example.com" }
const ABSORB = { id: "absorb-1", firstName: "Jean", lastName: "Dupont", email: "jean.wrong@example.com", active: true }

const basePreview = {
  fieldDiffs: [{ field: "email", keepValue: KEEP.email, absorbValue: ABSORB.email, differs: true }],
  conflicts: [],
  blocking: [],
  counts: {
    registrationsByStatus: { active: 1 },
    invites: 0,
    answers: 0,
    pushSubscriptionsDropped: 0,
    deliveryOutcomesReassigned: 0,
    deliveryOutcomesLeft: 0,
    sectorLeadersToReview: 0,
  },
}

const questionConflict = { kind: "same_question" as const, questionId: "q1", eventId: "evt-1", blocking: true }

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body }
}

function mockFetch(overrides: { preview?: unknown; mergeOk?: boolean; mergeBody?: unknown } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/admin/members?q=")) {
      return jsonResponse([ABSORB])
    }
    if (url.endsWith("/merge-preview")) {
      return jsonResponse({ keep: KEEP, absorb: ABSORB, preview: overrides.preview ?? basePreview })
    }
    if (url.endsWith("/merge") && init?.method === "POST") {
      if (overrides.mergeOk === false) {
        return jsonResponse(overrides.mergeBody ?? { error: "Conflit de fusion." }, false, 409)
      }
      return jsonResponse(overrides.mergeBody ?? { counts: { registrationsMoved: 2, invitesMoved: 1 }, resend: null })
    }
    throw new Error(`Unexpected fetch: ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

async function searchAndPick() {
  const search = screen.getByLabelText("Rechercher un membre par nom ou email")
  fireEvent.change(search, { target: { value: "Dupont" } })
  fireEvent.click(screen.getByRole("button", { name: "Chercher" }))
  const pickButton = await screen.findByRole("button", { name: /Fusionner avec cette fiche/ })
  fireEvent.click(pickButton)
}

describe("MemberMergeFlow", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })
  afterEach(cleanup)

  it("announces the search results, then loads the preview, focuses its heading and announces once", async () => {
    mockFetch()
    render(<MemberMergeFlow member={KEEP} />)

    const search = screen.getByLabelText("Rechercher un membre par nom ou email")
    fireEvent.change(search, { target: { value: "Dupont" } })
    fireEvent.click(screen.getByRole("button", { name: "Chercher" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 résultat trouvé."))

    const pickButton = await screen.findByRole("button", { name: /Fusionner avec cette fiche/ })
    fireEvent.click(pickButton)

    const heading = await screen.findByRole("heading", { name: "Aperçu de la fusion avec Jean Dupont" })
    await waitFor(() => expect(heading).toHaveFocus())
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Aperçu de la fusion avec Jean Dupont."))
  })

  it("starts directly at the preview when an initialOther is passed (#601, from a Doublons possibles pair), same focus and a single announcement", async () => {
    mockFetch()
    render(<MemberMergeFlow member={KEEP} initialOther={{ id: ABSORB.id, firstName: ABSORB.firstName, lastName: ABSORB.lastName, email: ABSORB.email }} />)

    // No manual search/pick: the preview step is reached straight away.
    const heading = await screen.findByRole("heading", { name: "Aperçu de la fusion avec Jean Dupont" })
    expect(screen.queryByRole("heading", { name: "Choisir la fiche à absorber" })).not.toBeInTheDocument()
    await waitFor(() => expect(heading).toHaveFocus())
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Aperçu de la fusion avec Jean Dupont."))
  })

  it("announces zero results distinctly", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("/api/admin/members?q=")) return jsonResponse([])
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<MemberMergeFlow member={KEEP} />)

    fireEvent.change(screen.getByLabelText("Rechercher un membre par nom ou email"), { target: { value: "Personne" } })
    fireEvent.click(screen.getByRole("button", { name: "Chercher" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Aucun autre membre trouvé."))
  })

  it("keeps the merge button non-actionable until a blocking conflict is resolved, then lets it open the dialog", async () => {
    mockFetch({ preview: { ...basePreview, conflicts: [questionConflict], blocking: [questionConflict] } })
    render(<MemberMergeFlow member={KEEP} />)
    await searchAndPick()
    await screen.findByRole("heading", { name: /Aperçu de la fusion/ })

    const mergeButton = screen.getByRole("button", { name: "Fusionner les deux fiches" })
    expect(mergeButton).toHaveAttribute("aria-disabled", "true")
    expect(mergeButton).toHaveAccessibleDescription(/1 choix restant/)
    fireEvent.click(mergeButton)
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()

    // Resolving the conflict re-fetches the preview without it, dropping the block.
    mockFetch({ preview: basePreview })
    fireEvent.click(screen.getByRole("radio", { name: "Garder la réponse actuelle" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Fusionner les deux fiches" })).not.toHaveAttribute("aria-disabled"))

    fireEvent.click(screen.getByRole("button", { name: "Fusionner les deux fiches" }))
    expect(await screen.findByRole("alertdialog", { name: "Confirmer la fusion" })).toBeInTheDocument()
  })

  it("confirms the merge, moves focus to the result heading and announces once", async () => {
    mockFetch()
    render(<MemberMergeFlow member={KEEP} />)
    await searchAndPick()
    await screen.findByRole("heading", { name: /Aperçu de la fusion/ })

    fireEvent.click(screen.getByRole("button", { name: "Fusionner les deux fiches" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Confirmer la fusion" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmer la fusion" }))

    const resultHeading = await screen.findByRole("heading", { name: "Fusion effectuée" })
    await waitFor(() => expect(resultHeading).toHaveFocus())
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Fusion effectuée/))
    expect(screen.getByText(/2 inscriptions déplacées/)).toBeInTheDocument()
  })

  it("shows an API error tied to the form instead of silently failing", async () => {
    mockFetch({ mergeOk: false, mergeBody: { error: "Cette fiche a déjà été fusionnée dans une autre." } })
    render(<MemberMergeFlow member={KEEP} />)
    await searchAndPick()
    await screen.findByRole("heading", { name: /Aperçu de la fusion/ })

    fireEvent.click(screen.getByRole("button", { name: "Fusionner les deux fiches" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Confirmer la fusion" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmer la fusion" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(screen.getByRole("alert")).toHaveTextContent("Cette fiche a déjà été fusionnée dans une autre.")
    // Still on the preview step, not silently reset or stuck.
    expect(screen.getByRole("heading", { name: /Aperçu de la fusion/ })).toBeInTheDocument()
  })

  it("ignores a second click on the confirm button while busy (guarded handler, not just disabled)", async () => {
    let resolveMerge!: (v: unknown) => void
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/admin/members?q=")) return jsonResponse([ABSORB])
      if (url.endsWith("/merge-preview")) return jsonResponse({ keep: KEEP, absorb: ABSORB, preview: basePreview })
      if (url.endsWith("/merge") && init?.method === "POST") {
        return new Promise((resolve) => { resolveMerge = () => resolve(jsonResponse({ counts: { registrationsMoved: 0, invitesMoved: 0 }, resend: null })) })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<MemberMergeFlow member={KEEP} />)
    await searchAndPick()
    await screen.findByRole("heading", { name: /Aperçu de la fusion/ })

    fireEvent.click(screen.getByRole("button", { name: "Fusionner les deux fiches" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Confirmer la fusion" })
    const confirmButton = within(dialog).getByRole("button", { name: "Confirmer la fusion" })
    fireEvent.click(confirmButton)
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /Fusion en cours/ })).toHaveAttribute("aria-disabled", "true"))
    // A click while busy must not fire a second request (the handler itself guards, not just `disabled`).
    fireEvent.click(within(dialog).getByRole("button", { name: /Fusion en cours/ }))
    const mergeCalls = fetchMock.mock.calls.filter(([u, init]) => typeof u === "string" && u.endsWith("/merge") && (init as RequestInit | undefined)?.method === "POST")
    expect(mergeCalls).toHaveLength(1)

    resolveMerge(undefined)
    await screen.findByRole("heading", { name: "Fusion effectuée" })
  })
})
