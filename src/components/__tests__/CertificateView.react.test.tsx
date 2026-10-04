/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react"
import CertificateView from "../admin/CertificateView"
import type { HourEntry } from "@/lib/volunteer-hours"

// Volunteer certificate (#556): form, on-screen warning and the printable document on one page.
const entry = (over: Partial<HourEntry> = {}): HourEntry => ({
  registrationId: "reg-1",
  eventId: "event-1",
  eventTitle: "Fête du village",
  shiftId: "shift-1",
  roleName: "Bar",
  label: "Bar",
  localDate: "2026-05-02",
  minutes: 240,
  attested: true,
  ...over,
})

const period = { from: "2025-05-01", to: "2026-05-31" }

describe("CertificateView", () => {
  beforeEach(() => vi.stubGlobal("print", vi.fn()))
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("renders a real heading and a table with a caption and th scope for the per-event lines", () => {
    render(<CertificateView memberId="vol-1" memberName="Julie Martin" organizationName="Festival" entries={[entry()]} defaultPeriod={period} generatedAt="4 octobre 2026" />)
    expect(screen.getByRole("heading", { level: 1, name: "Attestation de bénévolat" })).toBeInTheDocument()
    const table = screen.getByRole("table")
    expect(within(table).getByText(/Détail par événement/)).toBeInTheDocument()
    for (const col of ["Événement", "Postes", "Créneaux", "Heures attestées"]) {
      expect(within(table).getByRole("columnheader", { name: col })).toBeInTheDocument()
    }
  })

  it("shows attested hours only by default, and labels planned hours separately once the checkbox is checked", () => {
    const planned = entry({ registrationId: "reg-2", attested: false, shiftId: "shift-2" })
    render(<CertificateView memberId="vol-1" memberName="Julie Martin" organizationName="Festival" entries={[entry(), planned]} defaultPeriod={period} generatedAt="4 octobre 2026" />)
    expect(screen.queryByRole("columnheader", { name: /planifiées/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("checkbox", { name: /Inclure les heures planifiées/ }))
    expect(screen.getByRole("columnheader", { name: /planifiées/ })).toBeInTheDocument()
  })

  it("warns, on screen only, about confirmed shifts without a recorded presence", () => {
    const planned = entry({ registrationId: "reg-2", attested: false, shiftId: "shift-2" })
    render(<CertificateView memberId="vol-1" memberName="Julie Martin" organizationName="Festival" entries={[planned]} defaultPeriod={period} generatedAt="4 octobre 2026" />)
    const warning = screen.getByText(/n'a pas de présence enregistrée/)
    expect(warning.closest("section")).toHaveClass("print:hidden")
  })

  it("says in words when an event has no recorded presence at all, rather than showing zero silently", () => {
    const planned = entry({ attested: false })
    render(<CertificateView memberId="vol-1" memberName="Julie Martin" organizationName="Festival" entries={[planned]} defaultPeriod={period} generatedAt="4 octobre 2026" />)
    expect(screen.getByText("présences non saisies pour cet événement")).toBeInTheDocument()
  })

  it("escapes the free text and preserves line breaks, never via dangerouslySetInnerHTML", () => {
    const { container } = render(<CertificateView memberId="vol-1" memberName="Julie Martin" organizationName="Festival" entries={[entry()]} defaultPeriod={period} generatedAt="4 octobre 2026" />)
    fireEvent.change(screen.getByLabelText("Texte libre (facultatif)"), { target: { value: "<script>alert(1)</script>\nResponsable buvette" } })
    // No script element was injected: the text is rendered as plain content, never via dangerouslySetInnerHTML.
    expect(container.querySelector("script")).toBeNull()
    const note = container.querySelector("p.whitespace-pre-wrap")!
    expect(note.textContent).toContain("<script>alert(1)</script>")
    expect(note.textContent).toContain("Responsable buvette")
    expect(note.children).toHaveLength(0) // no child element was parsed out of the text
  })

  it("filters the preview by the chosen period without a network request", () => {
    const outOfRange = entry({ registrationId: "reg-old", localDate: "2020-01-01", eventTitle: "Vieux gala" })
    render(<CertificateView memberId="vol-1" memberName="Julie Martin" organizationName="Festival" entries={[entry(), outOfRange]} defaultPeriod={period} generatedAt="4 octobre 2026" />)
    expect(screen.getByText("Fête du village")).toBeInTheDocument()
    expect(screen.queryByText("Vieux gala")).not.toBeInTheDocument()
  })

  it("logs generation once, from the explicit button, then opens the print dialog", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    render(<CertificateView memberId="vol-1" memberName="Julie Martin" organizationName="Festival" entries={[entry()]} defaultPeriod={period} generatedAt="4 octobre 2026" />)
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: /Générer et imprimer/ }))
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/members/vol-1/certificate", { method: "POST" })
    expect(window.print).toHaveBeenCalled()
  })

  it("a fast double click logs and prints only once (aria-disabled doesn't block activation)", async () => {
    let resolveFetch!: (v: unknown) => void
    const fetchMock = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve }))
    vi.stubGlobal("fetch", fetchMock)
    render(<CertificateView memberId="vol-1" memberName="Julie Martin" organizationName="Festival" entries={[entry()]} defaultPeriod={period} generatedAt="4 octobre 2026" />)
    const button = screen.getByRole("button", { name: /Générer et imprimer/ })
    // Both clicks fire before the fetch resolves: the second must be a no-op (ref guard, not state).
    fireEvent.click(button)
    fireEvent.click(button)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolveFetch({ ok: true })
    await Promise.resolve()
    await Promise.resolve()
    expect(window.print).toHaveBeenCalledTimes(1)
  })

  it("marks both period fields invalid and describes the error, only while the range is invalid", () => {
    render(<CertificateView memberId="vol-1" memberName="Julie Martin" organizationName="Festival" entries={[entry()]} defaultPeriod={period} generatedAt="4 octobre 2026" />)
    const from = screen.getByLabelText("Du")
    const to = screen.getByLabelText("Au")
    expect(from).not.toHaveAttribute("aria-invalid", "true")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()

    fireEvent.change(to, { target: { value: "2020-01-01" } }) // before "from"
    const alert = screen.getByRole("alert")
    expect(from).toHaveAttribute("aria-invalid", "true")
    expect(to).toHaveAttribute("aria-invalid", "true")
    expect(from.getAttribute("aria-describedby")).toBe(alert.id)
    expect(to.getAttribute("aria-describedby")).toBe(alert.id)

    fireEvent.change(to, { target: { value: "2026-12-31" } }) // valid again
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(from).not.toHaveAttribute("aria-invalid", "true")
    expect(from).not.toHaveAttribute("aria-describedby")
  })

  it("announces the period summary after a change, never on first render", async () => {
    render(<CertificateView memberId="vol-1" memberName="Julie Martin" organizationName="Festival" entries={[entry()]} defaultPeriod={period} generatedAt="4 octobre 2026" />)
    const statusesOnMount = screen.getAllByRole("status").map((el) => el.textContent)
    expect(statusesOnMount.every((t) => !t)).toBe(true)

    fireEvent.click(screen.getByRole("checkbox", { name: /Inclure les heures planifiées/ }))
    await waitFor(() => {
      const announced = screen.getAllByRole("status").map((el) => el.textContent).find((t) => t && /créneau/.test(t))
      expect(announced).toBe("1 créneau confirmé, 4 h attestées, du 1 mai 2025 au 31 mai 2026.")
    })
  })

  it("returns focus to the generate button after the print dialog closes, if focus was dropped", async () => {
    render(<CertificateView memberId="vol-1" memberName="Julie Martin" organizationName="Festival" entries={[entry()]} defaultPeriod={period} generatedAt="4 octobre 2026" />)
    const button = screen.getByRole("button", { name: /Générer et imprimer/ })
    fireEvent.click(button)
    await Promise.resolve()
    await Promise.resolve()
    // Simulate what browsers do while the native print dialog is open: focus leaves the page.
    button.blur()
    expect(document.activeElement).not.toBe(button)
    window.dispatchEvent(new Event("afterprint"))
    await new Promise((r) => requestAnimationFrame(r))
    expect(document.activeElement).toBe(button)
  })
})
