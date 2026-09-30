/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import RegistrationsManager from "../admin/RegistrationsManager"

// Workload warnings (#465) in the organiser's registrations list and manual addition.
const shift = (id: string, startTime: string, endTime: string) => ({ id, roleName: "Bar", label: "Bar", date: "2026-07-04", startTime, endTime, capacity: 3, registrationCount: 1 })
const morning = shift("s1", "08:00", "12:00")
const afternoon = shift("s2", "12:15", "15:00")
const evening = shift("s3", "18:00", "20:00")
const reg = (id: string, s: ReturnType<typeof shift>, who: "alice" | "bob", status = "active") => ({
  id, status, source: "public_form", comment: null, phone: null, createdAt: "2026-06-01T00:00:00.000Z", waitingPosition: null,
  volunteer: who === "alice"
    ? { id: "v-alice", firstName: "Alice", lastName: "Martin", email: "alice@x.ch", phone: null }
    : { id: "v-bob", firstName: "Bob", lastName: "Durand", email: "bob@x.ch", phone: null },
  shift: s, isLeader: false, checkedInAt: null,
})

describe("RegistrationsManager — workload", () => {
  afterEach(cleanup)

  it("marks the rows of a volunteer chaining shifts, in words", () => {
    render(<RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[morning, afternoon, evening]}
      initialRegistrations={[reg("r1", morning, "alice"), reg("r2", afternoon, "alice"), reg("r3", evening, "bob"), reg("r4", morning, "bob", "waiting")]} />)
    const rows = screen.getAllByText("Alice Martin").map((el) => el.closest("tr")!)
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(within(row).getByText(/Charge élevée/).closest("p")).toHaveTextContent("7 h d'affilée, de 8 h à 15 h")
    for (const el of screen.getAllByText("Bob Durand")) expect(within(el.closest("tr")!).queryByText(/Charge élevée/)).toBeNull()
  })

  it("warns before a manual addition that would overload a registered volunteer, without blocking it", () => {
    render(<RegistrationsManager eventId="evt-1" timeZone="Europe/Zurich" shifts={[morning, afternoon, evening]} initialShiftFilter="s2"
      initialRegistrations={[reg("r1", morning, "alice")]} />)
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter manuellement" }))
    expect(screen.queryByText(/Si vous ajoutez ce créneau/)).toBeNull()
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "Alice@x.ch" } })
    const region = document.getElementById("add-workload")!
    expect(region).toHaveAttribute("role", "status")
    expect(region).toHaveTextContent("Si vous ajoutez ce créneau, cette personne aura :")
    expect(region).toHaveTextContent("7 h d'affilée")
    expect(screen.getByRole("button", { name: "Ajouter" })).toHaveAccessibleDescription(/7 h d'affilée/)
    expect(screen.getByRole("button", { name: "Ajouter" })).toBeEnabled()
  })
})
