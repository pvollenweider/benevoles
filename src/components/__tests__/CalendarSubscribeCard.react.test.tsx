/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

import CalendarSubscribeCard from "../public/CalendarSubscribeCard"
import { CALENDAR_COPIED, CALENDAR_COPY_FAILED } from "@/lib/calendar-card-copy"

// « Mon calendrier » on the personal page (#961).
const HTTPS = "https://fete.benevol.app/api/public/registrations/cmreg0000001-1abc/calendar.ics"
const WEBCAL = HTTPS.replace("https:", "webcal:")

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true, writable: true })
}

describe("CalendarSubscribeCard", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0 })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    setClipboard(undefined)
  })

  it("is a named region with the webcal link, described for the devices it suits, and the address as text", () => {
    render(<CalendarSubscribeCard webcalUrl={WEBCAL} httpsUrl={HTTPS} downloadHref={null} />)
    expect(screen.getByRole("region", { name: "Mon calendrier" })).toBeInTheDocument()
    const link = screen.getByRole("link", { name: "S'abonner avec l'agenda de cet appareil" })
    expect(link).toHaveAttribute("href", WEBCAL)
    expect(link).toHaveAccessibleDescription(/Android/)
    expect(screen.getByText(HTTPS).tagName).toBe("SPAN")
    // One file link only with several shifts.
    expect(screen.queryByRole("link", { name: /Télécharger/ })).toBeNull()
    expect(screen.getByRole("status")).toHaveTextContent("")
  })

  it("copies the https address with a visible and announced confirmation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    render(<CalendarSubscribeCard webcalUrl={WEBCAL} httpsUrl={HTTPS} downloadHref={null} />)
    fireEvent.click(screen.getByRole("button", { name: "Copier l'adresse de l'abonnement" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(CALENDAR_COPIED))
    expect(writeText).toHaveBeenCalledWith(HTTPS)
    expect(screen.getByRole("status")).not.toHaveClass("sr-only")
  })

  it("selects the address and says how to copy it by hand when the clipboard refuses", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) })
    render(<CalendarSubscribeCard webcalUrl={WEBCAL} httpsUrl={HTTPS} downloadHref={null} />)
    fireEvent.click(screen.getByRole("button", { name: "Copier l'adresse de l'abonnement" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(CALENDAR_COPY_FAILED))
    expect(window.getSelection()?.toString()).toBe(HTTPS)
  })

  it("keeps the one-off file of the whole planning, said not to update", () => {
    render(<CalendarSubscribeCard webcalUrl={WEBCAL} httpsUrl={HTTPS} downloadHref="/api/public/registrations/tok/calendar" />)
    const file = screen.getByRole("link", { name: "Télécharger tout mon planning (fichier .ics)" })
    expect(file).toHaveAttribute("href", "/api/public/registrations/tok/calendar")
    expect(file).toHaveAttribute("download")
    expect(file).toHaveAccessibleDescription(/ne se met pas à jour/)
  })
})
