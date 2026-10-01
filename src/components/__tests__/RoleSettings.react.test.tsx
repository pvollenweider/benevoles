/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

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
    const setup = (colorKey: string | null = null) => {
      const cb = callbacks()
      render(<RoleColorPicker eventId="evt-1" role="Bar" colorKey={colorKey} onClose={cb.onClose} onBusyRoleChange={cb.onBusyRoleChange} onActionError={cb.onActionError} setShifts={cb.setShifts} onAnnounce={cb.onAnnounce} />)
      return cb
    }

    it("shows the current colour and sets another one", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
      const cb = setup("blue")
      expect(screen.getByRole("button", { name: "Bleu" })).toHaveAttribute("aria-pressed", "true")
      fireEvent.click(screen.getByRole("button", { name: "Rose" }))
      expect(cb.onClose).toHaveBeenCalledOnce()

      await waitFor(() => expect(cb.onAnnounce).toHaveBeenCalledWith("Couleur du poste « Bar » : Rose."))
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ colorKey: "pink" })
      expect(applied(cb.setShifts, [shift({})])[0].colorKey).toBe("pink")
    })

    it("reports the server's error", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })
      const cb = setup()
      fireEvent.click(screen.getByRole("button", { name: "Automatique" }))
      await waitFor(() => expect(cb.onActionError).toHaveBeenLastCalledWith("Erreur lors du changement de couleur."))
      expect(cb.setShifts).not.toHaveBeenCalled()
    })
  })
})
