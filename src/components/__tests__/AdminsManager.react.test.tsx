/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

import AdminsManager from "../admin/AdminsManager"

// Admin levels (#469) in the team list.
const admins = [
  { id: "a1", name: "Alice", email: "alice@x.ch", role: "admin", isActive: true, createdAt: "2026-01-01T00:00:00.000Z", pending: false },
  { id: "a2", name: "Bob", email: "bob@x.ch", role: "organizer", isActive: true, createdAt: "2026-01-02T00:00:00.000Z", pending: false },
]

describe("AdminsManager — roles", () => {
  const fetchMock = vi.fn()
  beforeEach(() => { fetchMock.mockReset(); refresh.mockReset(); vi.stubGlobal("fetch", fetchMock) })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("changes a role only when the owner applies it", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "a2", role: "admin" }) })
    render(<AdminsManager initialAdmins={admins} currentEmail="alice@x.ch" canManage />)
    fireEvent.change(screen.getByLabelText("Rôle de Bob"), { target: { value: "admin" } })
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Appliquer le rôle de Bob" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/admins/a2", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ role: "admin" }) })))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Bob : propriétaire."))
    expect(screen.queryByRole("button", { name: /Appliquer/ })).toBeNull()
  })

  it("warns before an owner demotes themself, then refreshes the page", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "a1", role: "organizer" }) })
    render(<AdminsManager initialAdmins={admins} currentEmail="alice@x.ch" canManage />)
    fireEvent.change(screen.getByLabelText("Rôle de Alice"), { target: { value: "organizer" } })
    const apply = screen.getByRole("button", { name: "Appliquer le rôle de Alice" })
    expect(apply).toHaveAccessibleDescription(/seul un autre propriétaire pourra vous rendre ce rôle/)
    fireEvent.click(apply)
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(screen.getByRole("status")).toHaveTextContent("Votre rôle : organisateur.")
  })

  it("shows organisers the team without any control", () => {
    render(<AdminsManager initialAdmins={admins} currentEmail="bob@x.ch" canManage={false} />)
    expect(screen.queryByRole("button", { name: /Inviter/ })).toBeNull()
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(screen.queryByRole("button", { name: /Retirer/ })).toBeNull()
    expect(screen.getByText(/Seuls les propriétaires invitent/)).toBeInTheDocument()
    expect(screen.getByText("Rôle : Propriétaire")).toBeInTheDocument()
  })
})
