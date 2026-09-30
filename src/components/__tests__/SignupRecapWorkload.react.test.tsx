/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"

import SignupRecap from "../public/SignupRecap"

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
    expect(screen.getByText(/vous pouvez confirmer/)).toBeInTheDocument()
  })

  it("ignores a waitlist entry and stays silent under the limits", () => {
    render(<SignupRecap {...props} shifts={[shift("a", "08:00", "12:00"), shift("b", "12:00", "16:00", "full")]} />)
    expect(screen.queryByText("Journée chargée")).toBeNull()
  })
})
