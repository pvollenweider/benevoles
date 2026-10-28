/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"

import SignupRecap from "../public/SignupRecap"
import { buildPolicy } from "@/lib/workload-policy"

// Workload warning in the sign-up recap (#465): text, non-blocking, firm places only.
const shift = (id: string, startTime: string, endTime: string, status = "open") => ({
  id, roleName: "Bar", label: "Bar", date: "2026-07-04", startTime, endTime, status, waitlistEnabled: true, minAge: null,
})
const props = { requirePhone: false, phoneGiven: false, commentGiven: false, timeZone: "Europe/Zurich", variant: "card" as const }

describe("SignupRecap — workload", () => {
  afterEach(cleanup)

  it("says it before confirming, counting shifts already held", () => {
    render(<SignupRecap {...props} shifts={[shift("a", "12:00", "16:00")]} heldShifts={[{ id: "h", date: "2026-07-04", startTime: "08:00", endTime: "11:50" }]} />)
    expect(screen.getByText("Journée chargée").parentElement).toHaveTextContent("8 h d'affilée, de 8 h à 16 h")
    expect(screen.getByText(/tu peux confirmer/)).toBeInTheDocument()
  })

  it("ignores a waitlist entry and stays silent under the limits", () => {
    render(<SignupRecap {...props} shifts={[shift("a", "08:00", "12:00"), shift("b", "12:00", "16:00", "full")]} />)
    expect(screen.queryByText("Journée chargée")).toBeNull()
  })
})

// #1171: on a protected event, the limits the server enforces, said before confirming.
describe("SignupRecap — workload protection", () => {
  afterEach(cleanup)
  const policy = buildPolicy({ serviceDayStart: "08:00", maxContinuousMinutes: 360, minBreakMinutes: 30, maxDailyMinutes: 600, maxEventMinutes: 2400, minRestMinutes: 600, maxIdleGapMinutes: 120 }, "Europe/Zurich")
  const mode = { kind: "policy" as const, policy }

  it("says the sign-up will be refused, with the limit, instead of the #465 warning", () => {
    render(<SignupRecap {...props} workload={mode} shifts={[shift("a", "14:00", "20:00"), { ...shift("b", "01:00", "03:00"), date: "2026-07-05" }]} />)
    const box = screen.getByText("Ces créneaux dépassent les limites de l'événement").parentElement!
    expect(box).toHaveTextContent("laissent 5 h entre elles, de 20 h à 1 h")
    expect(box).toHaveTextContent("Retire ou change un créneau pour pouvoir confirmer.")
    expect(screen.queryByText("Journée chargée")).toBeNull()
  })

  it("never blocks on what is already held and unchanged, only on what the selection adds", () => {
    const held = [{ id: "h1", date: "2026-07-04", startTime: "08:00", endTime: "10:00" }, { id: "h2", date: "2026-07-04", startTime: "16:00", endTime: "18:00" }]
    render(<SignupRecap {...props} workload={mode} heldShifts={held} shifts={[{ ...shift("x", "10:00", "11:00"), date: "2026-07-06" }]} />)
    expect(screen.queryByText("Ces créneaux dépassent les limites de l'événement")).toBeNull()
  })

  it("an unreadable protection says nothing can be booked", () => {
    render(<SignupRecap {...props} workload={{ kind: "incomplete" }} shifts={[shift("a", "10:00", "11:00")]} />)
    expect(screen.getByText(/est incomplète/)).toBeInTheDocument()
  })
})
