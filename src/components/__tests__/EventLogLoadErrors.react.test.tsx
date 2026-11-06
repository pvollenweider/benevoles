/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import StoryView from "../admin/event-log/StoryView"
import ReplayView from "../admin/event-log/ReplayView"
import { REPLAY_LOAD_ERROR, STORY_LOAD_ERROR } from "@/lib/event-log-explorer"

// #1272: a refused or failed read of the event log used to end in the empty state, as if there
// were nothing to show, with the error swallowed. It is now said in the status element.
describe("event log views when the request fails", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const scope = { entityType: "shift", entityId: "s1" }

  it("story: says it could not load on a refused answer, not « Rien à raconter »", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: "Accès refusé" }) })
    render(<StoryView eventId="evt-1" rootId="log-1" onClear={() => {}} />)
    const status = await screen.findByText(STORY_LOAD_ERROR)
    expect(status).toHaveAttribute("role", "status")
    expect(status).toHaveClass("text-red-700")
    expect(screen.queryByText("Rien à raconter pour cette entrée.")).toBeNull()
  })

  it("story: says it could not load on a network error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    render(<StoryView eventId="evt-1" rootId="log-1" onClear={() => {}} />)
    expect(await screen.findByText(STORY_LOAD_ERROR)).toBeInTheDocument()
  })

  it("story: an empty chain still says there is nothing to tell", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ entries: [], shiftLabels: {}, timeZone: "Europe/Zurich" }) })
    render(<StoryView eventId="evt-1" rootId="log-1" onClear={() => {}} />)
    expect(await screen.findByText("Rien à raconter pour cette entrée.")).toBeInTheDocument()
  })

  it("replay: says it could not load, in the status element, with the way to another element", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new SyntaxError("Unexpected token <") } })
    const onClear = vi.fn()
    render(<ReplayView eventId="evt-1" scope={scope} onClear={onClear} />)
    const status = await screen.findByText(REPLAY_LOAD_ERROR)
    expect(status).toHaveAttribute("role", "status")
    expect(screen.queryByText("Aucun historique pour cet élément.")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Changer d'élément" }))
    expect(onClear).toHaveBeenCalled()
  })

  it("replay: says it could not load on a network error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    render(<ReplayView eventId="evt-1" scope={scope} onClear={() => {}} />)
    expect(await screen.findByText(REPLAY_LOAD_ERROR)).toBeInTheDocument()
  })

  it("replay: no history is still the empty state", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ entries: [], shiftLabels: {} }) })
    render(<ReplayView eventId="evt-1" scope={scope} onClear={() => {}} />)
    expect(await screen.findByText("Aucun historique pour cet élément.")).toBeInTheDocument()
  })
})
