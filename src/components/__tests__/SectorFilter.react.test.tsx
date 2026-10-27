/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react"

// The « Secteur » filter (#1170): a labelled native select; a choice replaces the URL's param,
// the select keeps the focus and the choice, and the server's count is said once, after the view.

const replace = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => "/admin/events/e1/registrations" }))

import SectorFilter from "@/components/admin/SectorFilter"

const options = [
  { value: "", label: "Tous les secteurs" },
  { value: "sec-park", label: "Parking" },
  { value: "autres", label: "Autres postes" },
]
const frame = () => act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))))

afterEach(() => { cleanup(); replace.mockReset(); window.history.replaceState(null, "", "/") })

describe("SectorFilter", () => {
  it("is a labelled select with its hint, and says nothing on first load", async () => {
    render(<SectorFilter options={options} value="" announcement="40 inscriptions, tous secteurs." hint="S'applique aussi à l'export des présences." />)
    const select = screen.getByRole("combobox", { name: "Secteur" })
    expect(select).toHaveValue("")
    expect(select).toHaveAccessibleDescription("S'applique aussi à l'export des présences.")
    await frame()
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
  })

  it("replaces the URL's secteur param, the page's other params kept, without scrolling", () => {
    window.history.replaceState(null, "", "/admin/events/e1/registrations?q=marie&secteur=autres")
    render(<SectorFilter options={options} value="autres" announcement="" />)
    fireEvent.change(screen.getByRole("combobox", { name: "Secteur" }), { target: { value: "sec-park" } })
    expect(replace).toHaveBeenCalledWith("/admin/events/e1/registrations?q=marie&secteur=sec-park", { scroll: false })
    fireEvent.change(screen.getByRole("combobox", { name: "Secteur" }), { target: { value: "" } })
    expect(replace).toHaveBeenLastCalledWith("/admin/events/e1/registrations?q=marie", { scroll: false })
  })

  it("keeps the choice and the focus until the server answers, then announces its count once", async () => {
    const { rerender } = render(<SectorFilter options={options} value="" announcement="40 inscriptions, tous secteurs." />)
    const select = screen.getByRole("combobox", { name: "Secteur" })
    select.focus()
    fireEvent.change(select, { target: { value: "sec-park" } })
    await frame()
    // The server has not re-rendered yet: no snapping back, nothing said.
    expect(select).toHaveValue("sec-park")
    expect(screen.getByRole("status")).toBeEmptyDOMElement()

    rerender(<SectorFilter options={options} value="sec-park" announcement="12 inscriptions dans le secteur « Parking »." />)
    await frame()
    expect(screen.getByRole("status")).toHaveTextContent("12 inscriptions dans le secteur « Parking ».")
    expect(document.activeElement).toBe(select)

    // A later re-render with the same view says nothing more.
    rerender(<SectorFilter options={options} value="sec-park" announcement="12 inscriptions dans le secteur « Parking »." />)
    await frame()
    expect(screen.getByRole("status")).toHaveTextContent("12 inscriptions dans le secteur « Parking ».")
  })

  it("settles on the server's view when the chosen sector is gone (archived meanwhile)", async () => {
    const { rerender } = render(<SectorFilter options={options} value="" announcement="40 inscriptions, tous secteurs." />)
    fireEvent.change(screen.getByRole("combobox", { name: "Secteur" }), { target: { value: "sec-park" } })
    rerender(<SectorFilter options={options.filter((o) => o.value !== "sec-park")} value="" announcement="40 inscriptions, tous secteurs." />)
    await frame()
    expect(screen.getByRole("combobox", { name: "Secteur" })).toHaveValue("")
    expect(screen.getByRole("status")).toHaveTextContent("40 inscriptions, tous secteurs.")
  })

  it("drops the params the page asks to clear", () => {
    window.history.replaceState(null, "", "/admin/events/e1/registrations?shift=s1&q=marie")
    render(<SectorFilter options={options} value="" announcement="" clear={["shift"]} />)
    fireEvent.change(screen.getByRole("combobox", { name: "Secteur" }), { target: { value: "autres" } })
    expect(replace).toHaveBeenCalledWith("/admin/events/e1/registrations?q=marie&secteur=autres", { scroll: false })
  })

  it("follows back/forward silently", async () => {
    const { rerender } = render(<SectorFilter options={options} value="sec-park" announcement="12 inscriptions dans le secteur « Parking »." />)
    rerender(<SectorFilter options={options} value="" announcement="40 inscriptions, tous secteurs." />)
    await frame()
    expect(screen.getByRole("combobox", { name: "Secteur" })).toHaveValue("")
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
  })
})
