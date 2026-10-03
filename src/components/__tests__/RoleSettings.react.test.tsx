/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react"
import { useState } from "react"

import { RoleColorPicker, RoleLimitForm, RoleReserveForm } from "../admin/shifts/RoleSettings"
import type { RawShift } from "../admin/shifts/types"

// Inline editors of a role in « Gérer les postes »: limit per person (#466), reserved tags (#470), colour.

const fetchMock = vi.fn()

const shift = (over: Partial<RawShift>): RawShift => ({
  id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00",
  capacity: 2, status: "open", registrationCount: 0, displayOrder: 0, ...over,
})

/** Applies the updater a component gave to setShifts. */
const applied = (setShifts: ReturnType<typeof vi.fn>, prev: RawShift[]) => setShifts.mock.calls[0][0](prev) as RawShift[]

const callbacks = () => ({
  onBusyRoleChange: vi.fn(),
  onActionError: vi.fn(),
  onClose: vi.fn(),
  setShifts: vi.fn(),
  onAnnounce: vi.fn(),
})

describe("RoleSettings", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  describe("RoleLimitForm", () => {
    const setup = (value: string, limit: number | null = null) => {
      const cb = { ...callbacks(), onValueChange: vi.fn(), onErrorChange: vi.fn() }
      render(<RoleLimitForm eventId="evt-1" role="Bar" index={0} limit={limit} value={value} error={null} busyRole={null} {...cb} />)
      return cb
    }

    it("rejects a value out of range without sending it", () => {
      const cb = setup("0")
      fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
      expect(fetchMock).not.toHaveBeenCalled()
      expect(cb.onErrorChange).toHaveBeenLastCalledWith("Entrez un nombre entier de 1 à 100, ou laissez vide pour ne pas limiter.")
      expect(screen.getByLabelText("Nombre maximal de créneaux « Bar » par personne")).toHaveFocus()
    })

    it("saves the limit, updates the role's shifts, closes and announces", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
      const cb = setup("3")
      fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))

      await waitFor(() => expect(cb.onClose).toHaveBeenCalledWith("Bar"))
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe("/api/admin/events/evt-1/roles/Bar")
      expect(init.method).toBe("PATCH")
      expect(JSON.parse(init.body)).toEqual({ maxPerVolunteer: 3 })
      expect(cb.onBusyRoleChange.mock.calls).toEqual([["Bar"], [null]])
      expect(applied(cb.setShifts, [shift({}), shift({ id: "s2", roleName: "Accueil" })]).map(s => s.maxPerVolunteer)).toEqual([3, undefined])
      expect(cb.onAnnounce).toHaveBeenCalledWith("Poste « Bar » : au plus 3 créneaux par personne.")
    })

    it("reports the server's error and stays open", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Poste introuvable" }) })
      const cb = setup("", 2)
      fireEvent.click(screen.getByRole("button", { name: "Retirer la limite" }))
      await waitFor(() => expect(cb.onActionError).toHaveBeenLastCalledWith("Poste introuvable"))
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ maxPerVolunteer: null })
      expect(cb.onClose).not.toHaveBeenCalled()
      expect(cb.setShifts).not.toHaveBeenCalled()
    })

    it("Escape closes it", () => {
      const cb = setup("")
      fireEvent.keyDown(screen.getByLabelText("Nombre maximal de créneaux « Bar » par personne"), { key: "Escape" })
      expect(cb.onClose).toHaveBeenCalledWith("Bar")
    })

    /** Holds the value and the error like RoleManagerPanel does. */
    function LimitHarness({ initial }: { initial: string }) {
      const [value, setValue] = useState(initial)
      const [error, setError] = useState<string | null>(null)
      return <RoleLimitForm eventId="evt-1" role="Bar" index={0} limit={null} value={value} onValueChange={setValue} error={error} onErrorChange={setError} busyRole={null} {...callbacks()} />
    }
    const limitInput = () => screen.getByLabelText("Nombre maximal de créneaux « Bar » par personne")
    const spokenAlerts = () => screen.queryAllByRole("alert").filter((e) => e.textContent?.trim())

    it("an invalid value sent with Enter from the focused input is one alert (focusing it again would say nothing)", () => {
      render(<LimitHarness initial="0" />)
      expect(limitInput()).toHaveFocus()
      fireEvent.submit(limitInput().closest("form")!)
      expect(spokenAlerts()).toHaveLength(1)
      expect(spokenAlerts()[0]).toHaveTextContent("Entrez un nombre entier de 1 à 100")
      expect(limitInput()).toHaveFocus()
      expect(limitInput()).toHaveAttribute("aria-invalid", "true")
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("an invalid value sent with « Enregistrer » is not an alert: focus moves to the input, which it describes", () => {
      render(<LimitHarness initial="0" />)
      const save = screen.getByRole("button", { name: "Enregistrer" })
      save.focus()
      fireEvent.click(save)
      expect(spokenAlerts()).toHaveLength(0)
      expect(limitInput()).toHaveFocus()
      expect(limitInput()).toHaveAccessibleDescription(/Entrez un nombre entier de 1 à 100/)
    })
  })

  describe("RoleReserveForm", () => {
    const setup = (value: string, reservedTags: string[] = []) => {
      const cb = { ...callbacks(), onValueChange: vi.fn() }
      render(<RoleReserveForm eventId="evt-1" role="Bar" index={0} reservedTags={reservedTags} value={value} busyRole={null} {...cb} />)
      return cb
    }

    it("saves the parsed tags and says how many were dropped", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
      const cb = setup("sécurité, Sécurité, secouriste")
      fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))

      await waitFor(() => expect(cb.onAnnounce).toHaveBeenCalledOnce())
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ reservedTags: ["sécurité", "secouriste"] })
      expect(applied(cb.setShifts, [shift({})])[0].reservedTags).toEqual(["sécurité", "secouriste"])
      expect(cb.onClose).toHaveBeenCalledWith("Bar")
      expect(cb.onAnnounce).toHaveBeenCalledWith("Poste « Bar » : réservé aux membres avec l'étiquette sécurité ou secouriste. 1 étiquette ignorée (doublons, ou 10 au maximum).")
    })

    it("does nothing while another role action runs", () => {
      const cb = { ...callbacks(), onValueChange: vi.fn() }
      render(<RoleReserveForm eventId="evt-1" role="Bar" index={0} reservedTags={["a"]} value="a" busyRole="Accueil" {...cb} />)
      fireEvent.click(screen.getByRole("button", { name: "Ouvrir à tous" }))
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("reports the server's error and stays open", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })
      const cb = setup("a", ["a"])
      fireEvent.click(screen.getByRole("button", { name: "Ouvrir à tous" }))
      await waitFor(() => expect(cb.onActionError).toHaveBeenLastCalledWith("Erreur lors de l'enregistrement."))
      expect(cb.onClose).not.toHaveBeenCalled()
    })
  })

  describe("RoleColorPicker", () => {
    /** Holds the busy role like RoleManagerPanel does, so that `busy` follows the request. */
    function ColorHarness({ colorKey, cb }: { colorKey: string | null; cb: ReturnType<typeof callbacks> }) {
      const [busyRole, setBusyRole] = useState<string | null>(null)
      return (
        <RoleColorPicker
          eventId="evt-1" role="Bar" index={0} colorKey={colorKey} busy={busyRole === "Bar"}
          onClose={cb.onClose}
          onBusyRoleChange={(r) => { cb.onBusyRoleChange(r); setBusyRole(r) }}
          onActionError={cb.onActionError} setShifts={cb.setShifts} onAnnounce={cb.onAnnounce}
        />
      )
    }
    const setup = (colorKey: string | null = null) => {
      const cb = callbacks()
      render(<ColorHarness colorKey={colorKey} cb={cb} />)
      return cb
    }

    it("is a group named after the role, with the id its colour button controls", () => {
      setup()
      expect(screen.getByRole("group", { name: "Couleur du poste « Bar »" })).toHaveAttribute("id", "color-picker-0")
    })

    it("shows the current colour; « Automatique » is a toggle button too", () => {
      setup("blue")
      expect(screen.getByRole("button", { name: "Bleu" })).toHaveAttribute("aria-pressed", "true")
      expect(screen.getByRole("button", { name: "Automatique" })).toHaveAttribute("aria-pressed", "false")
      cleanup()
      setup(null)
      expect(screen.getByRole("button", { name: "Automatique" })).toHaveAttribute("aria-pressed", "true")
    })

    it("sets another colour, then closes with the role and announces once, after the request", async () => {
      let resolve!: (v: unknown) => void
      fetchMock.mockReturnValue(new Promise((r) => { resolve = r }))
      const cb = setup("blue")
      fireEvent.click(screen.getByRole("button", { name: "Rose" }))
      // Still open during the request: the picked swatch keeps focus.
      expect(cb.onClose).not.toHaveBeenCalled()

      await act(async () => resolve({ ok: true, json: async () => ({}) }))
      await waitFor(() => expect(cb.onClose).toHaveBeenCalledWith("Bar"))
      expect(cb.onAnnounce).toHaveBeenCalledOnce()
      expect(cb.onAnnounce).toHaveBeenCalledWith("Couleur du poste « Bar » : Rose.")
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ colorKey: "pink" })
      expect(applied(cb.setShifts, [shift({})])[0].colorKey).toBe("pink")
    })

    it("reports the server's error and stays open", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })
      const cb = setup()
      fireEvent.click(screen.getByRole("button", { name: "Automatique" }))
      await waitFor(() => expect(cb.onActionError).toHaveBeenLastCalledWith("Erreur lors du changement de couleur."))
      expect(cb.setShifts).not.toHaveBeenCalled()
      expect(cb.onClose).not.toHaveBeenCalled()
      expect(cb.onAnnounce).not.toHaveBeenCalled()
    })

    it("while a colour is being saved, the swatches are aria-disabled (not disabled) and a second pick sends nothing", async () => {
      let resolve!: (v: unknown) => void
      fetchMock.mockReturnValue(new Promise((r) => { resolve = r }))
      setup()
      const pink = screen.getByRole("button", { name: "Rose" })
      pink.focus()
      fireEvent.click(pink)
      expect(pink).toHaveAttribute("aria-disabled", "true")
      expect(pink).not.toBeDisabled()
      expect(pink).toHaveFocus()
      expect(screen.getByRole("button", { name: "Automatique" })).toHaveAttribute("aria-disabled", "true")
      fireEvent.click(screen.getByRole("button", { name: "Bleu" }))
      expect(fetchMock).toHaveBeenCalledOnce()
      await act(async () => resolve({ ok: true, json: async () => ({}) }))
    })

    // #587: a ring (box-shadow) was the only mark of the chosen colour, and forced colours drop it.
    it("marks the chosen swatch with a check and a border, the others with neither; no title", () => {
      setup("teal")
      const chosen = screen.getByRole("button", { name: "Sarcelle" })
      expect(chosen.querySelectorAll("svg")).toHaveLength(1)
      expect(chosen.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
      expect(chosen).toHaveClass("border-2", "border-gray-900")
      expect(chosen.className).not.toMatch(/\bring-/)
      for (const other of ["Bleu", "Rose", "Jaune"]) {
        const b = screen.getByRole("button", { name: other })
        expect(b.querySelector("svg")).toBeNull()
        expect(b).toHaveClass("border-0")
      }
      expect(document.querySelector("[title]")).toBeNull()
    })

    it("keeps the swatch colours in forced colours on the inner, non-focusable children only", () => {
      setup("teal")
      for (const b of screen.getAllByRole("button")) expect(b.className).not.toContain("forced-color-adjust-none")
      const chosen = screen.getByRole("button", { name: "Sarcelle" })
      expect(chosen.querySelector("span")).toHaveClass("forced-color-adjust-none", "bg-teal-700")
      expect(chosen.querySelector("span")).toHaveAttribute("aria-hidden", "true")
      // At least 24 px (2.5.8): the button is 32 px.
      expect(chosen).toHaveClass("w-8", "h-8")
    })

    it("« Automatique » pressed shows « ✓ », hidden from screen readers, and a border; not pressed, readable text", () => {
      setup(null)
      const auto = screen.getByRole("button", { name: "Automatique" })
      expect(auto).toHaveTextContent("✓ Automatique")
      expect(screen.getByText("✓")).toHaveAttribute("aria-hidden", "true")
      expect(auto).toHaveClass("border-2")
      cleanup()
      setup("blue")
      const off = screen.getByRole("button", { name: "Automatique" })
      expect(off).not.toHaveTextContent("✓")
      expect(off).toHaveClass("text-gray-700")
      expect(off).not.toHaveClass("text-gray-500")
    })

    it("Escape closes it with the role", () => {
      const cb = setup()
      fireEvent.keyDown(screen.getByRole("button", { name: "Rose" }), { key: "Escape" })
      expect(cb.onClose).toHaveBeenCalledWith("Bar")
    })

    it("Escape waits while a colour is being saved: the success then closes it once", async () => {
      let resolve!: (v: unknown) => void
      fetchMock.mockReturnValue(new Promise((r) => { resolve = r }))
      const cb = setup()
      const pink = screen.getByRole("button", { name: "Rose" })
      fireEvent.click(pink)
      fireEvent.keyDown(pink, { key: "Escape" })
      expect(cb.onClose).not.toHaveBeenCalled()

      await act(async () => resolve({ ok: true, json: async () => ({}) }))
      await waitFor(() => expect(cb.onClose).toHaveBeenCalledOnce())
    })
  })
})
