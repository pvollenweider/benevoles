/**
 * @vitest-environment jsdom
 */
// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("@/lib/sentry-client-loader", () => ({ captureClientException: vi.fn() }))

import GlobalError from "@/app/global-error"
import { captureClientException } from "@/lib/sentry-client-loader"

const heading = () => screen.getByRole("heading", { level: 1, name: "La page n'a pas pu se charger" })

describe("GlobalError (#1442)", () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.mocked(captureClientException).mockClear()
  })
  afterEach(cleanup)

  it("renders a French page, focuses the heading and links to the home page", () => {
    const { container } = render(<GlobalError error={new Error("boom")} reload={vi.fn()} />)

    expect(heading()).toHaveFocus()
    expect(screen.getByRole("button", { name: "Recharger la page" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toHaveAttribute("href", "/")
    // No technical text, no error digest, no English fallback.
    expect(container).not.toHaveTextContent(/Application error|client-side exception|digest/i)
    // A code error: no promise that reloading fixes it, a way out instead.
    expect(container).toHaveTextContent("Une erreur inattendue est survenue.")
    expect(container).not.toHaveTextContent("La connexion a été interrompue")
  })

  it("declares the document in French, as it replaces the root layout", () => {
    const markup = renderToStaticMarkup(<GlobalError error={new Error("boom")} reload={vi.fn()} />)
    expect(markup).toContain('<html lang="fr">')
    expect(markup).toContain("<body")
    expect(markup).toContain("<title>La page n&#x27;a pas pu se charger</title>")
    expect(markup).toContain('name="viewport"')
  })

  it("reloads once for a network failure and does not report it", () => {
    const reload = vi.fn()
    render(<GlobalError error={new TypeError("Load failed")} reload={reload} />)

    expect(reload).toHaveBeenCalledTimes(1)
    expect(captureClientException).not.toHaveBeenCalled()
    // The recovery page is rendered during the reload, never the English Next error, but focus
    // stays put: no failure is announced just before the page comes back.
    expect(heading()).toBeInTheDocument()
    expect(heading()).not.toHaveFocus()
    expect(screen.getByText(/La connexion a été interrompue/)).toBeInTheDocument()
  })

  it("reports any other error and does not reload", () => {
    const reload = vi.fn()
    const error = new Error("boom")
    render(<GlobalError error={error} reload={reload} />)

    expect(captureClientException).toHaveBeenCalledTimes(1)
    expect(captureClientException).toHaveBeenCalledWith(error)
    expect(reload).not.toHaveBeenCalled()
  })

  it("shows the page instead of reloading again for a second failure within 30 s", () => {
    const reload = vi.fn()
    const first = render(<GlobalError error={new TypeError("Failed to fetch")} reload={reload} />)
    expect(reload).toHaveBeenCalledTimes(1)
    first.unmount()

    render(<GlobalError error={new TypeError("Failed to fetch")} reload={reload} />)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(heading()).toHaveFocus()
    expect(captureClientException).not.toHaveBeenCalled()
  })

  it("reloads from the button when the visitor asks for it", () => {
    const reload = vi.fn()
    render(<GlobalError error={new Error("boom")} reload={reload} />)
    fireEvent.click(screen.getByRole("button", { name: "Recharger la page" }))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
