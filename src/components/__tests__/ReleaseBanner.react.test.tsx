/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

const refresh = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

import ReleaseBanner from "@/components/super-admin/ReleaseBanner"

// « Une nouvelle version est disponible » (#612): shown only for a newer version, dismissible
// per version, reappears for the next one.

describe("ReleaseBanner", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

  it("hidden when the current version is already the latest", () => {
    render(<ReleaseBanner currentVersion="2.0.2" latestVersion="2.0.2" releaseUrl="https://x/releases/tag/v2.0.2" dismissedVersion={null} />)
    expect(screen.queryByRole("region", { name: "Nouvelle version disponible" })).not.toBeInTheDocument()
  })

  it("hidden when there's no known latest version yet", () => {
    render(<ReleaseBanner currentVersion="2.0.2" latestVersion={null} releaseUrl={null} dismissedVersion={null} />)
    expect(screen.queryByRole("region")).not.toBeInTheDocument()
  })

  it("shown with the version, current version and a link to the release notes, with an accessible dismiss button name", () => {
    render(<ReleaseBanner currentVersion="2.0.2" latestVersion="2.1.0" releaseUrl="https://x/releases/tag/v2.1.0" dismissedVersion={null} />)
    const region = screen.getByRole("region", { name: "Nouvelle version disponible" })
    expect(region).toHaveTextContent("Une nouvelle version est disponible : 2.1.0 (vous utilisez 2.0.2).")
    const link = screen.getByRole("link", { name: /Voir les notes de version/ })
    expect(link).toHaveAttribute("href", "https://x/releases/tag/v2.1.0")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    expect(screen.getByRole("button", { name: /Masquer jusqu'à la prochaine version \(2\.1\.0\)/ })).toBeInTheDocument()
  })

  it("hidden when this super admin already dismissed exactly this version", () => {
    render(<ReleaseBanner currentVersion="2.0.2" latestVersion="2.1.0" releaseUrl="https://x" dismissedVersion="2.1.0" />)
    expect(screen.queryByRole("region")).not.toBeInTheDocument()
  })

  it("shown again when a newer version supersedes the dismissed one", () => {
    render(<ReleaseBanner currentVersion="2.0.2" latestVersion="2.2.0" releaseUrl="https://x" dismissedVersion="2.1.0" />)
    expect(screen.getByRole("region")).toHaveTextContent("2.2.0")
  })

  it("disappears right after a successful dismiss, without waiting for the server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
    render(<ReleaseBanner currentVersion="2.0.2" latestVersion="2.1.0" releaseUrl="https://x" dismissedVersion={null} />)
    fireEvent.click(screen.getByRole("button", { name: /Masquer/ }))
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith("/api/super-admin/release-banner", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ version: "2.1.0" }),
    }))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("reports an error and keeps the banner when the dismiss request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))
    render(<ReleaseBanner currentVersion="2.0.2" latestVersion="2.1.0" releaseUrl="https://x" dismissedVersion={null} />)
    fireEvent.click(screen.getByRole("button", { name: /Masquer/ }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Impossible de masquer"))
    expect(screen.getByRole("region")).toBeInTheDocument()
  })
})
