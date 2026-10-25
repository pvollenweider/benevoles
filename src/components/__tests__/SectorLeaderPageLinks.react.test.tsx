/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup } from "@testing-library/react"

// The sector leader's page: the link's token goes into the request as one encoded segment (or no
// request at all), and the contact links carry one address and a dialable number, nothing more.

let routeToken = "lead-buvette-0001"
vi.mock("next/navigation", () => ({ useParams: () => ({ token: routeToken }) }))

import SectorLeaderPage from "@/app/leader/[token]/page"

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

const reg = (id: string, email: string | null, phone: string) => ({
  id, status: "active", comment: null,
  volunteer: { firstName: "Léa", lastName: id, email, phone },
  shift: { label: "Bar", date: "2030-07-06T00:00:00.000Z", startTime: "10:00", endTime: "12:00" },
})

function stubFetch(registrations: ReturnType<typeof reg>[]) {
  const fetchMock = vi.fn(() => Promise.resolve(json({ event: { title: "Fête", slug: "fete" }, roleName: "Bar", leaderName: "Sam", registrations })))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("SectorLeaderPage links", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); routeToken = "lead-buvette-0001" })

  it("reads the roster through the encoded token path", async () => {
    const fetchMock = stubFetch([])
    render(<SectorLeaderPage />)
    await screen.findByRole("heading", { level: 1, name: "Responsable · Bar" })
    expect(fetchMock).toHaveBeenCalledWith("/api/public/leader/lead-buvette-0001")
  })

  it("makes no request for a route value that is not a token, and says the link is invalid", async () => {
    routeToken = "../registrations/x"
    const fetchMock = stubFetch([])
    render(<SectorLeaderPage />)
    expect(await screen.findByRole("heading", { level: 1, name: "Lien introuvable" })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("links one valid address and a dialable number", async () => {
    stubFetch([reg("A", "Lea@Example.com", "079 123 45 67")])
    render(<SectorLeaderPage />)
    const mail = await screen.findByRole("link", { name: "Lea@Example.com" })
    expect(mail).toHaveAttribute("href", "mailto:lea@example.com")
    expect(screen.getByRole("link", { name: "079 123 45 67" })).toHaveAttribute("href", "tel:0791234567")
  })

  it("shows a stored value that is not one address as text, without a mailto link", async () => {
    const odd = "lea@example.com?bcc=other@example.net"
    stubFetch([reg("B", odd, "")])
    render(<SectorLeaderPage />)
    expect(await screen.findByText(odd)).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: odd })).not.toBeInTheDocument()
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull()
  })
})
