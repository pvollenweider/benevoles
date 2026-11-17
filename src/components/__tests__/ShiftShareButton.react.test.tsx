/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"

import ShiftShareButton from "../admin/ShiftShareButton"
import { COPIED } from "../admin/EventShareLink"

// « Partager ce créneau » (#1386): the admin panel's labels, copy, share, checkbox and counter.

const LINK = {
  id: "link-1",
  shiftId: "s1",
  code: "abcd2345",
  url: "https://club.benevol.app/fete?partage=abcd2345",
  acceptsAfterClose: false,
  registrations: 3,
}

function setNavigator(props: Record<string, unknown>) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true })
  }
}

async function openPanel(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock)
  render(<ShiftShareButton eventId="evt-1" shiftId="s1" shiftName="Bar, sam. 1 juin, 18h–20h" />)
  fireEvent.click(screen.getByRole("button", { name: /^Partager ce créneau/ }))
  const dialog = await screen.findByRole("dialog", { name: "Partager ce créneau" })
  await within(dialog).findByText(LINK.url)
  return dialog
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0 })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  setNavigator({ share: undefined, clipboard: undefined })
})

describe("ShiftShareButton", () => {
  it("loads the link from an idempotent POST and shows the panel's labels, QR code and counter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(LINK), { status: 201 }))
    const dialog = await openPanel(fetchMock)

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/events/evt-1/shift-links", expect.objectContaining({ method: "POST" }))
    expect(within(dialog).getByText(/À coller dans le groupe de discussion ou sur la page de votre association/)).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "Copier le lien" })).toBeInTheDocument()
    expect(within(dialog).getByRole("link", { name: /QR code PNG/ })).toHaveAttribute(
      "href", "/api/admin/events/evt-1/shift-links/link-1/qr?format=png&download=1",
    )
    const box = within(dialog).getByRole("checkbox", { name: /Accepter une inscription même si les inscriptions de l'événement sont fermées/ })
    expect(box).not.toBeChecked()
    expect(box).toHaveAccessibleDescription("Valable pour ce créneau seulement, tant qu'il reste une place et qu'il n'a pas commencé.")
    expect(within(dialog).getByText("3 inscriptions par ce lien")).toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: "Partager" })).toBeNull()
  })

  it("copies the link and shows the confirmation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator({ clipboard: { writeText } })
    const dialog = await openPanel(vi.fn().mockResolvedValue(new Response(JSON.stringify(LINK), { status: 201 })))
    fireEvent.click(within(dialog).getByRole("button", { name: "Copier le lien" }))
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent(COPIED))
    expect(writeText).toHaveBeenCalledWith(LINK.url)
  })

  it("offers « Partager » where the browser has a native share sheet", async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator({ share })
    const dialog = await openPanel(vi.fn().mockResolvedValue(new Response(JSON.stringify(LINK), { status: 201 })))
    fireEvent.click(within(dialog).getByRole("button", { name: "Partager" }))
    await waitFor(() => expect(share).toHaveBeenCalledWith({ url: LINK.url }))
  })

  it("saves the checkbox on change with a PATCH and shows the saved value", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(LINK), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...LINK, acceptsAfterClose: true }), { status: 200 }))
    const dialog = await openPanel(fetchMock)
    const box = within(dialog).getByRole("checkbox", { name: /Accepter une inscription même si/ })
    fireEvent.click(box)
    await waitFor(() => expect(box).toBeChecked())
    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/events/evt-1/shift-links/link-1")
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ acceptsAfterClose: true }) })
    expect(within(dialog).getByRole("status")).toHaveTextContent("Ce lien accepte une inscription même si les inscriptions de l'événement sont fermées.")
  })

  it("keeps the checkbox off and says so when the PATCH fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(LINK), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Enregistrement impossible." }), { status: 500 }))
    const dialog = await openPanel(fetchMock)
    const box = within(dialog).getByRole("checkbox", { name: /Accepter une inscription même si/ })
    fireEvent.click(box)
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("Enregistrement impossible."))
    expect(box).not.toBeChecked()
  })

  it("says the link could not be created", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Créneau introuvable." }), { status: 404 })))
    render(<ShiftShareButton eventId="evt-1" shiftId="s1" shiftName="Bar" />)
    fireEvent.click(screen.getByRole("button", { name: /^Partager ce créneau/ }))
    const dialog = await screen.findByRole("dialog", { name: "Partager ce créneau" })
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("Créneau introuvable."))
  })
})
