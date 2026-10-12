import { describe, it, expect } from "vitest"
import {
  EVENT_PUBLIC_STATUS_LOG_LABELS,
  REGISTRATION_SOURCE_LOG_LABELS,
  REGISTRATION_STATUS_LOG_LABELS,
  SHIFT_STATUS_LOG_LABELS,
  logValueLabel,
} from "../log-value-labels"
import { EVENT_PUBLIC_STATUSES, REGISTRATION_SOURCES, REGISTRATION_STATUSES, SHIFT_STATUSES } from "../statuses"

describe("logValueLabel (#929)", () => {
  it("has a label for every stored status, source and publication status", () => {
    for (const s of REGISTRATION_STATUSES) expect(REGISTRATION_STATUS_LOG_LABELS[s]).toBeTruthy()
    for (const s of SHIFT_STATUSES) expect(SHIFT_STATUS_LOG_LABELS[s]).toBeTruthy()
    for (const s of REGISTRATION_SOURCES) expect(REGISTRATION_SOURCE_LOG_LABELS[s]).toBeTruthy()
    for (const s of EVENT_PUBLIC_STATUSES) expect(EVENT_PUBLIC_STATUS_LOG_LABELS[s]).toBeTruthy()
  })

  it("reads a registration status with the admin UI's wording", () => {
    expect(logValueLabel("status", "waiting", "Registration")).toBe("liste d'attente")
    expect(logValueLabel("status", "offered", "Registration")).toBe("place proposée")
    expect(logValueLabel("status", "requested", "Registration")).toBe("demande à traiter")
    expect(logValueLabel("status", "refused", "Registration")).toBe("refusée")
  })

  it("picks the shift or registration list from the entity type", () => {
    expect(logValueLabel("status", "cancelled", "Shift")).toBe("annulé")
    expect(logValueLabel("status", "cancelled", "Registration")).toBe("annulée")
    expect(logValueLabel("status", "open", "Registration")).toBeUndefined()
  })

  it("falls back on both lists without an entity type", () => {
    expect(logValueLabel("status", "full")).toBe("complet")
    expect(logValueLabel("status", "waiting")).toBe("liste d'attente")
  })

  it("labels the source and the publication status", () => {
    expect(logValueLabel("source", "public_form")).toBe("formulaire")
    expect(logValueLabel("source", "admin_manual")).toBe("manuel")
    expect(logValueLabel("publicStatus", "archived")).toBe("archivé")
  })

  it("returns undefined for an unknown value, an unknown field or a non-string", () => {
    expect(logValueLabel("status", "mystery", "Shift")).toBeUndefined()
    expect(logValueLabel("title", "draft")).toBeUndefined()
    expect(logValueLabel("status", 3)).toBeUndefined()
    expect(logValueLabel("status", null)).toBeUndefined()
    expect(logValueLabel("status", "toString")).toBeUndefined()
  })
})
