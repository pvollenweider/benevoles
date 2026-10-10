// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import SiteBrandLink from "../SiteBrandLink"
import { SITE_NAME } from "@/lib/seo-metadata"

describe("SiteBrandLink, the site's name with its logo at the top of the public pages", () => {
  afterEach(cleanup)

  it("links to the home page, named by the site's name only", () => {
    render(<SiteBrandLink />)
    const link = screen.getByRole("link", { name: SITE_NAME })
    expect(link.getAttribute("href")).toBe("/")
  })

  it("puts the logo before the name, hidden from assistive technologies", () => {
    render(<SiteBrandLink />)
    const link = screen.getByRole("link", { name: SITE_NAME })
    const logo = link.querySelector("svg")!
    expect(link.firstElementChild).toBe(logo)
    expect(logo.getAttribute("aria-hidden")).toBe("true")
    expect(logo.getAttribute("focusable")).toBe("false")
  })
})
