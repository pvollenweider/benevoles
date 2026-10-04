// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { formatSavedAt, saveErrorText, shouldAnnounceSaved, visibleSaveText } from "../event-autosave"

describe("visibleSaveText", () => {
  it("is empty when idle", () => {
    expect(visibleSaveText({ kind: "idle" })).toBe("")
  })

  it("says Enregistrement… while saving", () => {
    expect(visibleSaveText({ kind: "saving" })).toBe("Enregistrement…")
  })

  it("says the saved time", () => {
    expect(visibleSaveText({ kind: "saved", at: "14h32" })).toBe("Modifications enregistrées à 14h32.")
  })

  it("says the modifications were not saved on error, without the reason", () => {
    expect(visibleSaveText({ kind: "error", reason: "server" })).toBe("Modifications non enregistrées.")
    expect(visibleSaveText({ kind: "error", reason: "network" })).toBe("Modifications non enregistrées.")
  })
})

describe("saveErrorText", () => {
  it("distinguishes a server refusal from a network failure", () => {
    expect(saveErrorText("server")).toBe("Les modifications n'ont pas été enregistrées.")
    expect(saveErrorText("network")).toBe("Connexion impossible : les modifications n'ont pas été enregistrées.")
  })
})

describe("formatSavedAt", () => {
  it("drops the minutes when they are round", () => {
    expect(formatSavedAt(new Date(2026, 0, 1, 9, 0))).toBe("9h")
  })

  it("pads the minutes otherwise", () => {
    expect(formatSavedAt(new Date(2026, 0, 1, 14, 32))).toBe("14h32")
    expect(formatSavedAt(new Date(2026, 0, 1, 14, 5))).toBe("14h05")
  })
})

// D11 (b): announce the first save after load, and the first after an error; later saves stay silent.
describe("shouldAnnounceSaved", () => {
  it("announces the first save ever, after load", () => {
    expect(shouldAnnounceSaved("idle", false)).toBe(true)
  })

  it("does not announce a later save following a silent one", () => {
    expect(shouldAnnounceSaved("saved", true)).toBe(false)
  })

  it("announces again after an error, even once a save has already been announced", () => {
    expect(shouldAnnounceSaved("error", true)).toBe(true)
  })

  it("would still announce a save coming right after an error even before any announcement", () => {
    expect(shouldAnnounceSaved("error", false)).toBe(true)
  })
})
