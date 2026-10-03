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
    // The role is said in words, not in a title only a mouse can show (#582).
    expect(screen.getByText(/^Responsable/)).toHaveTextContent("Responsable du poste Bar")
    expect(screen.getByText(/^Responsable/)).not.toHaveAttribute("title")
    expect(screen.getByText("Formulaire")).toBeInTheDocument()
    expect(screen.getByRole("listitem")).toHaveTextContent("Taille : M")
    expect(screen.getByText("\"Par téléphone\"")).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText("Sélectionner l'inscription de Alice Martin, Bar, Soir, samedi 4 juillet, de 18h à 20h"))
    expect(onToggleSelected).toHaveBeenCalledTimes(1)
  })

  // Review of #555: the volunteer cell holds the email, decisions, answers and warnings; as a row
  // header, screen readers re-read all of it on every vertical move. Column headers suffice.
  it("keeps the volunteer cell a plain cell", () => {
    renderRow()
    expect(screen.queryByRole("rowheader")).toBeNull()
    expect(screen.getAllByText(/Alice Martin/)[0].closest("td")).not.toBeNull()
  })

  it("offers the decision on a request, named for screen readers", () => {
    const onDecision = vi.fn()
    renderRow({ onDecision, reg: reg({ status: "requested" }) })
    fireEvent.click(screen.getByRole("button", { name: "Accepter la demande de Alice Martin pour Bar, Soir, samedi 4 juillet, de 18h à 20h" }))
    expect(onDecision).toHaveBeenLastCalledWith("accept")
    fireEvent.click(screen.getByRole("button", { name: "Refuser la demande de Alice Martin pour Bar, Soir, samedi 4 juillet, de 18h à 20h" }))
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
    expect(screen.getByText("position 2")).toBeInTheDocument()
  })

  // #582: everything a screen reader reads in the row is in words.
  it("reads the shift in words: no « · », dash or « # », and no title", () => {
    const { container } = renderRow({ reg: reg({ status: "waiting", waitingPosition: 3, isLeader: true }) })
    expect(screen.getByText("Bar, Soir")).toBeInTheDocument()
    expect(screen.getByText("sam. 4 juil., de 18h à 20h")).toBeInTheDocument()
    expect(screen.getByText("position 3")).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/[·–—#]/)
    expect(container.querySelector("[title]")).toBeNull()
  })

  it("names the decisions with the shift and its time in words", () => {
    renderRow({ reg: reg({ status: "requested", shift: { ...shift, startTime: "10:00", endTime: "12:00" } }) })
    for (const action of ["Accepter", "Refuser"]) {
      const name = screen.getByRole("button", { name: new RegExp(`^${action} `) }).textContent ?? ""
      expect(name).toContain(", de 10h à 12h")
      expect(name).not.toMatch(/[·–—]/)
    }
  })

  it("tells apart two rows of the same person by their checkbox names", () => {
    render(
      <table><tbody>
        <RegistrationRow reg={reg()} selected={false} onToggleSelected={() => {}} onDecision={() => {}} answers={[]} workload={[]} />
        <RegistrationRow reg={reg({ id: "r2", shift: { ...shift, id: "s2", label: "Bar", startTime: "22:00", endTime: "02:00" } })} selected={false} onToggleSelected={() => {}} onDecision={() => {}} answers={[]} workload={[]} />
      </tbody></table>,
    )
    const names = screen.getAllByRole("checkbox").map((c) => c.getAttribute("id")).map((id) => document.querySelector(`label[for="${id}"]`)?.textContent?.trim())
    expect(names).toEqual([
      "Sélectionner l'inscription de Alice Martin, Bar, Soir, samedi 4 juillet, de 18h à 20h",
      "Sélectionner l'inscription de Alice Martin, Bar, samedi 4 juillet, de 22h à 2h, jusqu'au lendemain",
    ])
    expect(screen.getByRole("checkbox", { name: /de 22h à 2h, jusqu'au lendemain$/ })).toBeInTheDocument()
  })
})
