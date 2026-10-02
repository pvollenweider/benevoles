/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest"
import { act } from "react"
import { hydrateRoot } from "react-dom/client"
import "@testing-library/jest-dom/vitest"
import { renderToString } from "react-dom/server"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { useHydrated } from "../use-hydrated"

const signIn = vi.hoisted(() => vi.fn())
vi.mock("next-auth/react", () => ({ signIn }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import LoginPage from "@/app/admin/login/page"

function Probe() {
  return <span>{useHydrated() ? "hydrated" : "server"}</span>
}

describe("useHydrated", () => {
  it("is false in the server HTML and true once rendered on the client", () => {
    expect(renderToString(<Probe />)).toContain("server")
    render(<Probe />)
    expect(screen.getByText("hydrated")).toBeInTheDocument()
  })
})

// Regression (#592): a sign-in submitted before hydration reloaded the empty login page and lost
// what was typed; the button now waits for the submit handler.
describe("login page", () => {
  it("serves « Se connecter » disabled, then enables it on the client", () => {
    const html = renderToString(<LoginPage />)
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/)
    render(<LoginPage />)
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeEnabled()
  })
})

// Review of #596: with controlled inputs, the re-render right after hydration wrote the empty state
// back into the fields, erasing what was typed or autofilled before React took over.
describe("login page hydration", () => {
  it("keeps what was typed before hydration and signs in with it", async () => {
    signIn.mockResolvedValue({ error: null })
    const container = document.createElement("div")
    container.innerHTML = renderToString(<LoginPage />)
    document.body.appendChild(container)
    const email = container.querySelector<HTMLInputElement>('input[type="email"]')!
    const password = container.querySelector<HTMLInputElement>('input[type="password"]')!
    email.value = "alice@example.org"
    password.value = "secret-typed-early"

    await act(async () => { hydrateRoot(container, <LoginPage />) })

    expect(email.value).toBe("alice@example.org")
    expect(password.value).toBe("secret-typed-early")
    const submit = within(container).getByRole("button", { name: "Se connecter" })
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    await waitFor(() => expect(signIn).toHaveBeenCalledWith("credentials", { email: "alice@example.org", password: "secret-typed-early", redirect: false }))
    container.remove()
  })
})

