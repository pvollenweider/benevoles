/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import RegistrationsManager from "../admin/RegistrationsManager"

// Lightweight check-in (#399) in the registrations list.
const shift = { id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 3, registrationCount: 2 }
const reg = (id: string, over: Record<string, unknown> = {}) => ({
  id, status: "active", source: "public_form", comment: null, phone: null, createdAt: "2026-06-01T00:00:00.000Z", waitingPosition: null,
  volunteer: { id: `v-${id}`, firstName: id === "r1" ? "Alice" : "Bob", lastName: id === "r1" ? "Martin" : "Durand", email: `${id}@x.ch`, phone: null },
  shift, isLeader: false, checkedInAt: null, ...over,
})

describe("RegistrationsManager — presence", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("shows who is present and offers to mark the selected people", async () => {
    render(<RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[shift]} initialRegistrations={[reg("r1", { checkedInAt: "2026-07-04T08:05:00.000Z" }), reg("r2")]} />)
    expect(screen.getByText(/1 présent/)).toBeInTheDocument()
    const aliceRow = screen.getByText("Alice Martin").closest("tr")!
    expect(within(aliceRow).getByText(/Présent/)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Bob Durand, /))
    expect(screen.getByRole("button", { name: "Marquer présent (1)" })).toHaveAttribute("aria-disabled", "false")
    expect(screen.queryByRole("button", { name: /Annuler la présence/ })).toBeNull()

    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Alice Martin, /))
    expect(screen.getByRole("button", { name: "Annuler la présence (1)" })).toBeInTheDocument()
  })

  it("marks the selection present through the bulk route and updates the rows", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ done: 1, changedIds: ["r2"], skipped: 0 }) })
    render(<RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[shift]} initialRegistrations={[reg("r1"), reg("r2")]} />)
    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Bob Durand, /))
    fireEvent.click(screen.getByRole("button", { name: "Marquer présent (1)" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/admin/events/evt-1/registrations/bulk")
    expect(JSON.parse(init.body)).toEqual({ action: "check_in", registrationIds: ["r2"], observedShifts: { r2: "s1" } })
    const bobRow = await screen.findByText("Bob Durand").then((el) => el.closest("tr")!)
    await waitFor(() => expect(within(bobRow).getByText(/Présent/)).toBeInTheDocument())
    await waitFor(() => expect(screen.getAllByRole("status").some((el) => el.textContent?.includes("1 personne marquée présente."))).toBe(true))
    const summary = screen.getByText("1 présent").closest("p")!
    expect(summary).toHaveTextContent("1 présent sur 2 inscrits.")
    expect(summary).toHaveFocus()
  })

  // The « absent » state (#1141).
  it("shows who is absent, counts them in the summary line and offers the two absence actions", () => {
    render(<RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[shift]} initialRegistrations={[reg("r1", { attendanceStatus: "absent" }), reg("r2")]} />)
    const aliceRow = screen.getByText("Alice Martin").closest("tr")!
    const badge = within(aliceRow).getByText("Absent")
    // Amber with a sign of its own, never the red pair nor the « ✓ » of « Présent ».
    expect(badge.className).toMatch(/bg-amber-100/)
    expect(badge.className).toMatch(/text-amber-900/)
    expect(badge.className).not.toMatch(/dark:|red-/)
    expect(within(badge).getByText(/✗/)).toHaveAttribute("aria-hidden", "true")
    expect(within(aliceRow).queryByText(/Présent/)).toBeNull()
    // Nobody present yet: the line is visible all the same, because someone is absent.
    const summary = screen.getByText(/personne encore marqué présent/).closest("p")!
    expect(summary).toHaveTextContent("2 inscrits, personne encore marqué présent, 1 absent.")
    expect(summary).not.toHaveClass("sr-only")

    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Bob Durand, /))
    expect(screen.getByRole("button", { name: "Marquer absent (1)" })).toHaveAttribute("aria-disabled", "false")
    expect(screen.queryByRole("button", { name: /Annuler l'absence/ })).toBeNull()
    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Alice Martin, /))
    expect(screen.getByRole("button", { name: "Annuler l'absence (1)" })).toBeInTheDocument()
    // An absent person is not offered « Marquer présent »: the absence is undone first.
    expect(screen.getByRole("button", { name: "Marquer présent (1)" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Annuler la présence/ })).toBeNull()
  })

  it("the summary line is hidden only while nobody is present nor absent", () => {
    render(<RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[shift]} initialRegistrations={[reg("r1"), reg("r2")]} />)
    expect(screen.getByText("2 inscrits, personne encore marqué présent.")).toHaveClass("sr-only")
  })

  it("marks the selection absent through the bulk route, says it and moves the focus to the summary line", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({
      done: 2, changedIds: ["r1", "r2"], skipped: 0,
      results: [{ id: "r1", changed: true, state: "absent", checkedInAt: null }, { id: "r2", changed: true, state: "absent", checkedInAt: null }],
    }) })
    render(<RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[shift]} initialRegistrations={[reg("r1"), reg("r2")]} />)
    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Alice Martin, /))
    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Bob Durand, /))
    fireEvent.click(screen.getByRole("button", { name: "Marquer absents (2)" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: "mark_absent", registrationIds: ["r1", "r2"], observedShifts: { r1: "s1", r2: "s1" } })
    await waitFor(() => expect(screen.getAllByText("Absent")).toHaveLength(2))
    await waitFor(() => expect(screen.getAllByRole("status").some((el) => el.textContent?.includes("2 personnes marquées absentes."))).toBe(true))
    const summary = screen.getByText(/personne encore marqué présent/).closest("p")!
    expect(summary).toHaveTextContent("2 inscrits, personne encore marqué présent, 2 absents.")
    expect(summary).toHaveFocus()
  })

  it("undoes the absence of the selection, with its own status sentence", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ done: 1, changedIds: ["r1"], skipped: 0, results: [{ id: "r1", changed: true, state: "expected", checkedInAt: null }] }) })
    render(<RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[shift]} initialRegistrations={[reg("r1", { attendanceStatus: "absent" }), reg("r2", { checkedInAt: "2026-07-04T08:05:00.000Z" })]} />)
    expect(screen.getByText("1 présent").closest("p")).toHaveTextContent("1 présent sur 2 inscrits, 1 absent.")
    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Alice Martin, /))
    fireEvent.click(screen.getByRole("button", { name: "Annuler l'absence (1)" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: "undo_absent", registrationIds: ["r1"], observedShifts: { r1: "s1" } })
    await waitFor(() => expect(screen.queryByText("Absent")).toBeNull())
    await waitFor(() => expect(screen.getAllByRole("status").some((el) => el.textContent?.includes("Absence annulée pour 1 personne."))).toBe(true))
    expect(screen.getByText("1 présent").closest("p")).toHaveTextContent("1 présent sur 2 inscrits.")
  })

  it("a row changed meanwhile on another device shows what the server returned, not what was asked", async () => {
    // Bob was marked present elsewhere after this page was read: « Marquer absents » changes Alice only.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({
      done: 1, changedIds: ["r1"], skipped: 1,
      results: [{ id: "r1", changed: true, state: "absent", checkedInAt: null }, { id: "r2", changed: false, state: "present", checkedInAt: "2026-07-04T08:01:00.000Z" }],
    }) })
    render(<RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[shift]} initialRegistrations={[reg("r1"), reg("r2")]} />)
    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Alice Martin, /))
    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Bob Durand, /))
    fireEvent.click(screen.getByRole("button", { name: "Marquer absents (2)" }))
    const bobRow = screen.getByText("Bob Durand").closest("tr")!
    await waitFor(() => expect(within(bobRow).getByText(/Présent/)).toBeInTheDocument())
    expect(within(bobRow).queryByText("Absent")).toBeNull()
    expect(within(screen.getByText("Alice Martin").closest("tr")!).getByText("Absent")).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole("status").some((el) => el.textContent?.includes("1 personne marquée absente."))).toBe(true))
    expect(screen.getByText("1 présent").closest("p")).toHaveTextContent("1 présent sur 2 inscrits, 1 absent.")
  })

  it("names the action in the error when the request fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("network"))
    render(<RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[shift]} initialRegistrations={[reg("r1"), reg("r2")]} />)
    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Bob Durand, /))
    fireEvent.click(screen.getByRole("button", { name: "Marquer absent (1)" }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/Absence/)
    expect(screen.queryByText("Absent")).toBeNull()
  })

  it("nothing changed (everyone already marked elsewhere): says so instead of « 0 personne … », for the four actions", async () => {
    const cases = [
      { rows: [reg("r1"), reg("r2")], pick: "Bob Durand", button: "Marquer absent (1)", state: "present", checkedInAt: "2026-07-04T08:01:00.000Z" },
      { rows: [reg("r1"), reg("r2")], pick: "Bob Durand", button: "Marquer présent (1)", state: "absent", checkedInAt: null },
      { rows: [reg("r1"), reg("r2", { checkedInAt: "2026-07-04T08:01:00.000Z" })], pick: "Bob Durand", button: "Annuler la présence (1)", state: "expected", checkedInAt: null },
      { rows: [reg("r1"), reg("r2", { attendanceStatus: "absent" })], pick: "Bob Durand", button: "Annuler l'absence (1)", state: "expected", checkedInAt: null },
    ]
    for (const c of cases) {
      fetchMock.mockReset()
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ done: 0, changedIds: [], skipped: 1, results: [{ id: "r2", changed: false, state: c.state, checkedInAt: c.checkedInAt }] }) })
      render(<RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[shift]} initialRegistrations={c.rows} />)
      fireEvent.click(screen.getByLabelText(new RegExp(`^Sélectionner l'inscription de ${c.pick}, `)))
      fireEvent.click(screen.getByRole("button", { name: c.button }))
      await waitFor(() => expect(screen.getAllByRole("status").some((el) => el.textContent?.includes("Rien n'a changé : ces personnes ont déjà été marquées sur un autre appareil."))).toBe(true))
      expect(screen.getAllByRole("status").some((el) => /\b0 personne/.test(el.textContent ?? ""))).toBe(false)
      cleanup()
    }
  })

  it("the same sentence twice in a row is set again (cleared first)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ done: 0, changedIds: [], skipped: 1, results: [{ id: "r2", changed: false, state: "expected", checkedInAt: null }] }) })
    render(<RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[shift]} initialRegistrations={[reg("r1"), reg("r2")]} />)
    const sentence = "Rien n'a changé : ces personnes ont déjà été marquées sur un autre appareil."
    const said = () => screen.getAllByRole("status").some((el) => el.textContent?.includes(sentence))
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Bob Durand, /))
      fireEvent.click(screen.getByRole("button", { name: "Marquer absent (1)" }))
      // Emptied when the action ends, then filled on the next frame.
      if (i === 1) await waitFor(() => expect(said()).toBe(false))
      await waitFor(() => expect(said()).toBe(true))
    }
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("a row the server no longer finds (« gone ») is left as shown, and a moved one takes the state returned", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({
      done: 0, changedIds: [], skipped: 2,
      results: [{ id: "r1", changed: false, state: null, checkedInAt: null, gone: true }, { id: "r2", changed: false, state: "present", checkedInAt: "2026-07-04T08:01:00.000Z", moved: true }],
    }) })
    render(<RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[shift]} initialRegistrations={[reg("r1"), reg("r2")]} />)
    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Alice Martin, /))
    fireEvent.click(screen.getByLabelText(/^Sélectionner l'inscription de Bob Durand, /))
    fireEvent.click(screen.getByRole("button", { name: "Marquer absents (2)" }))
    const bobRow = screen.getByText("Bob Durand").closest("tr")!
    await waitFor(() => expect(within(bobRow).getByText(/Présent/)).toBeInTheDocument())
    const aliceRow = screen.getByText("Alice Martin").closest("tr")!
    expect(within(aliceRow).queryByText("Absent")).toBeNull()
    expect(within(aliceRow).queryByText(/Présent/)).toBeNull()
  })
})
