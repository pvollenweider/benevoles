/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import InviteToEventMenu from "../admin/InviteToEventMenu"

// « Inviter à un événement » on the members page (#1098).

const ev = (id: string, title: string) => ({ id, title, dateLabel: "4 juillet 2030" })

describe("InviteToEventMenu", () => {
  afterEach(cleanup)

  it("nothing without an upcoming published event", () => {
    const { container } = render(<InviteToEventMenu events={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("one event: a plain link to its invitations", () => {
    render(<InviteToEventMenu events={[ev("e1", "Fête")]} />)
    expect(screen.getByRole("link", { name: "Inviter à « Fête »" })).toHaveAttribute("href", "/admin/events/e1/invitations")
  })

  it("several: a disclosure listing each event's invitations, closed by Escape with the focus back", () => {
    render(<InviteToEventMenu events={[ev("e1", "Fête"), ev("e2", "Marché")]} />)
    const button = screen.getByRole("button", { name: "Inviter à un événement" })
    expect(button).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("link")).toBeNull()
    fireEvent.click(button)
    expect(button).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("link", { name: /Marché/ })).toHaveAttribute("href", "/admin/events/e2/invitations")
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    fireEvent.keyDown(screen.getByRole("link", { name: /Fête/ }), { key: "Escape" })
    expect(screen.queryByRole("link")).toBeNull()
    expect(button).toHaveFocus()
  })

  it("a tap outside closes it", () => {
    render(<div><p>dehors</p><InviteToEventMenu events={[ev("e1", "Fête"), ev("e2", "Marché")]} /></div>)
    fireEvent.click(screen.getByRole("button", { name: "Inviter à un événement" }))
    fireEvent.pointerDown(screen.getByText("dehors"))
    expect(screen.queryByRole("link")).toBeNull()
  })
})
