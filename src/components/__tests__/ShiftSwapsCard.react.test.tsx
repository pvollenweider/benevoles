/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import ShiftSwapsCard from "@/components/public/ShiftSwapsCard"
import type { VolunteerSwapView } from "@/lib/shift-swap-view"

// « Échanger un créneau » on the personal page (#1174): headings and buttons name their shift, the
// other person is said « Jean, initiale D », accepting asks first with « Non, garder mon créneau »
// focused, every POST carries the revision the page showed, a changed proposal is said after the
// refreshed item took focus, and an offer with several possible shifts needs a choice.

const bar = { id: "s-bar", roleName: "Bar", label: "Bar", date: "2030-07-04", startTime: "10:00", endTime: "12:00", locationDetails: null, instructions: null }
const barSun = { ...bar, id: "s-bar-sun", date: "2030-07-05", startTime: "14:00", endTime: "16:00", locationDetails: "Entrée nord" }
const barMon = { ...bar, id: "s-bar-mon", date: "2030-07-06", startTime: "18:00", endTime: "20:00" }

const offeredToMe = {
  requestId: "q1", side: "requester" as const, status: "offered" as const, revision: 3, deadline: "2030-07-04T08:00:00.000Z",
  needsApproval: false, gives: bar, receives: barSun, endMessage: null, otherName: "Jean D.",
}

function view(over: Partial<VolunteerSwapView> = {}): VolunteerSwapView {
  return { enabled: true, scope: "poste", publishable: [], mine: [], offers: [], ownShifts: {}, ...over }
}

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

function stub(views: VolunteerSwapView[], post: (body: Record<string, unknown>) => { body: unknown; status?: number }) {
  let i = 0
  const posts: Record<string, unknown>[] = []
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body))
      posts.push(body)
      const r = post(body)
      return json(r.body, r.status ?? 200)
    }
    const v = views[Math.min(i, views.length - 1)]
    i++
    return json(v)
  })
  vi.stubGlobal("fetch", fetchMock)
  return { posts }
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const renderCard = (onShiftsChanged = vi.fn()) => render(<ShiftSwapsCard token="tok-abcdefghij" timeZone="Europe/Zurich" onShiftsChanged={onShiftsChanged} />)

describe("ShiftSwapsCard (#1174)", () => {
  it("renders nothing while the event has no swaps and the person no request", async () => {
    stub([view({ enabled: false })], () => ({ body: {} }))
    renderCard()
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Échanger un créneau" })).not.toBeInTheDocument())
  })

  it("names each item by its state and the shift given, and says the other person's initial in words", async () => {
    stub([view({ mine: [offeredToMe] })], () => ({ body: {} }))
    renderCard()
    const heading = await screen.findByRole("heading", { level: 4 })
    expect(heading).toHaveTextContent("Jean, initiale D")
    expect(heading).toHaveTextContent("te propose un échange : Bar, jeudi 4 juillet")
    expect(screen.getByRole("button", { name: /^Accepter l'échange, Bar, jeudi 4 juillet/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Refuser, Bar/ })).toBeInTheDocument()
    expect(screen.getByText("Tu cèdes")).toBeInTheDocument()
    expect(screen.getByText("Tu reçois")).toBeInTheDocument()
  })

  it("asks before accepting, focus on « Non, garder mon créneau », and Escape gives focus back", async () => {
    stub([view({ mine: [offeredToMe] })], () => ({ body: {} }))
    renderCard()
    const accept = await screen.findByRole("button", { name: /^Accepter l'échange/ })
    fireEvent.click(accept)
    const dialog = await screen.findByRole("alertdialog", { name: "Faire l'échange ?" })
    expect(dialog).toHaveAccessibleDescription(/Tu cèdes Bar, jeudi 4 juillet.*Tu reçois Bar, vendredi 5 juillet.*Entrée nord/)
    await waitFor(() => expect(screen.getByRole("button", { name: "Non, garder mon créneau" })).toHaveFocus())
    fireEvent.keyDown(dialog, { key: "Escape" })
    await waitFor(() => expect(accept).toHaveFocus())
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("confirms with the revision shown, reloads the page's shifts and says the new shift", async () => {
    const applied = { ...offeredToMe, status: "applied" as const }
    const { posts } = stub([view({ mine: [offeredToMe] }), view({ mine: [applied] })], () => ({ body: { ok: true, requestId: "q1", status: "applied" } }))
    const changed = vi.fn()
    renderCard(changed)
    fireEvent.click(await screen.findByRole("button", { name: /^Accepter l'échange/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Oui, échanger" }))
    await waitFor(() => expect(posts).toEqual([{ action: "confirm", requestId: "q1", revision: 3 }]))
    await waitFor(() => expect(changed).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Échange effectué : ton créneau est maintenant Bar, vendredi 5 juillet"))
    // Seen too, not only heard; the ended item says what was received, and takes the focus's place.
    expect(screen.getByRole("status")).not.toHaveClass("sr-only")
    expect(screen.getByText(/Tu reçois Bar, vendredi 5 juillet/)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Échanges terminés" })).toHaveFocus()
  })

  it("a changed proposal: the refreshed item takes focus, then the alert says to read again", async () => {
    stub([view({ mine: [offeredToMe] }), view({ mine: [{ ...offeredToMe, revision: 4 }] })], () => ({ body: { error: "x", code: "revision", status: "offered" }, status: 409 }))
    renderCard()
    fireEvent.click(await screen.findByRole("button", { name: /^Accepter l'échange/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Oui, échanger" }))
    await waitFor(() => expect(screen.getByText("La proposition a changé : relis les deux créneaux avant de confirmer.")).toBeInTheDocument())
    expect(screen.getByRole("heading", { level: 4 })).toHaveFocus()
    // Under the item that took the focus, and tied to its first action.
    expect(screen.getByRole("button", { name: /^Accepter l'échange/ })).toHaveAccessibleDescription(/La proposition a changé/)
  })

  it("publishes a shift by its named button", async () => {
    const { posts } = stub([view({ publishable: [{ registrationId: "r-bar", deadline: "2030-07-04T08:00:00.000Z", shift: bar }] })], () => ({ body: { ok: true, requestId: "q9", status: "open" } }))
    renderCard()
    fireEvent.click(await screen.findByRole("button", { name: /^Je cherche à échanger ce créneau, Bar, jeudi 4 juillet/ }))
    await waitFor(() => expect(posts).toEqual([{ action: "publish", registrationId: "r-bar" }]))
  })

  it("shows the mission of others' requests only, and needs a choice when several shifts could be given", async () => {
    const offer = { requestId: "q2", shift: barMon, deadline: "2030-07-04T08:00:00.000Z", registrationIds: ["r-bar", "r-sun"] }
    const { posts } = stub([view({ offers: [offer], ownShifts: { "r-bar": bar, "r-sun": barSun } })], () => ({ body: { ok: true, requestId: "q2", status: "offered" } }))
    renderCard()
    const button = await screen.findByRole("button", { name: /^Proposer cet échange, Bar, samedi 6 juillet/ })
    expect(screen.getByRole("group", { name: "Tu cèdes :" })).toBeInTheDocument()
    expect(screen.getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true)
    fireEvent.click(button)
    expect(await screen.findByText("Choisis le créneau que tu cèdes.")).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Tu cèdes :" })).toHaveAccessibleDescription("Choisis le créneau que tu cèdes.")
    expect(screen.getAllByRole("radio")[0]).toHaveFocus()
    expect(posts).toEqual([])
    fireEvent.click(screen.getByRole("radio", { name: /vendredi 5 juillet/ }))
    fireEvent.click(button)
    await waitFor(() => expect(posts).toEqual([{ action: "offer", requestId: "q2", registrationId: "r-sun" }]))
    expect(button).toHaveAccessibleDescription(/l'échange se fait/)
  })
})
