/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import RegistrationRow from "../admin/registrations/RegistrationRow"
import type { Registration } from "../admin/registrations/types"

// One row of the registrations table, on its own.
const shift = { id: "s1", roleName: "Bar", label: "Soir", date: "2026-07-04", startTime: "18:00", endTime: "20:00", capacity: 3, registrationCount: 1 }
const reg = (over: Partial<Registration> = {}): Registration => ({
  id: "r1", status: "active", source: "public_form", comment: null, phone: null, createdAt: "2026-06-01T00:00:00.000Z", waitingPosition: null,
  volunteer: { id: "v1", firstName: "Alice", lastName: "Martin", email: "alice@x.ch", phone: null },
  shift, isLeader: false, checkedInAt: null, ...over,
})
const renderRow = (props: Partial<Parameters<typeof RegistrationRow>[0]> = {}) => render(
  <table><tbody><RegistrationRow reg={reg()} selected={false} onToggleSelected={() => {}} onDecision={() => {}} answers={[]} workload={[]} {...props} /></tbody></table>,
)

describe("RegistrationRow", () => {
  afterEach(cleanup)

  it("shows the person, the shift and the source, and toggles the selection", () => {
    const onToggleSelected = vi.fn()
    renderRow({ onToggleSelected, answers: [{ label: "Taille", text: "M" }], reg: reg({ isLeader: true, comment: "Par téléphone" }) })
    expect(screen.getByText("Alice Martin")).toBeInTheDocument()
    expect(screen.getByText("Responsable")).toHaveAttribute("title", "Responsable de Bar")
    expect(screen.getByText("Formulaire")).toBeInTheDocument()
    expect(screen.getByRole("listitem")).toHaveTextContent("Taille : M")
    expect(screen.getByText("\"Par téléphone\"")).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText("Sélectionner l'inscription de Alice Martin"))
    expect(onToggleSelected).toHaveBeenCalledTimes(1)
  })

  it("offers the decision on a request, named for screen readers", () => {
    const onDecision = vi.fn()
    renderRow({ onDecision, reg: reg({ status: "requested" }) })
    fireEvent.click(screen.getByRole("button", { name: "Accepter la demande de Alice Martin pour Bar · Soir" }))
    expect(onDecision).toHaveBeenLastCalledWith("accept")
    fireEvent.click(screen.getByRole("button", { name: "Refuser la demande de Alice Martin pour Bar · Soir" }))
    expect(onDecision).toHaveBeenLastCalledWith("refuse")
  })

  it("shows only the workload warnings that involve this row's shift, and the waiting position", () => {
    const { unmount } = renderRow({
      workload: [
        { kind: "daily", day: "2026-07-04", minutes: 600, shiftIds: ["s1"] },
        { kind: "daily", day: "2026-07-05", minutes: 600, shiftIds: ["s9"] },
      ],
    })
    expect(screen.getAllByText(/Charge élevée/)).toHaveLength(1)
    unmount()
    renderRow({ reg: reg({ status: "waiting", waitingPosition: 2 }), workload: [{ kind: "daily", day: "2026-07-04", minutes: 600, shiftIds: ["s1"] }] })
    expect(screen.queryByText(/Charge élevée/)).toBeNull()
    expect(screen.getByText("#2")).toBeInTheDocument()
  })
})
