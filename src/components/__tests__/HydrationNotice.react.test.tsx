/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { readFileSync } from "node:fs"
import { renderToString } from "react-dom/server"
import { cleanup, render, screen } from "@testing-library/react"
import HydrationNotice from "@/components/HydrationNotice"
import SignupForm from "@/components/public/signup/SignupForm"
import { HYDRATION_NOTICE_LEAD, hydrationNoticeId, hydrationNoticeText } from "@/lib/hydration-notice"

afterEach(() => cleanup())

describe("HydrationNotice (#1343)", () => {
  it("is in the server HTML, as a status hidden by its class", () => {
    const html = renderToString(<HydrationNotice kind="signup" id="n" />)
    expect(html).toContain('id="n"')
    expect(html).toContain('role="status"')
    expect(html).toContain('class="hydration-notice')
    expect(html).toContain(HYDRATION_NOTICE_LEAD.replace("'", "&#x27;"))
    // With scripts turned off, the rule in <noscript> shows it at once.
    expect(html).toMatch(/<noscript><style>\.hydration-notice\{[^}]*visibility:visible/)
  })

  it("is gone once the page has started", () => {
    render(<HydrationNotice kind="event" id="n" />)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("speaks to the organiser in « vous » and to the volunteer in « tu »", () => {
    expect(hydrationNoticeText("signup")).toContain("votre navigateur")
    expect(hydrationNoticeText("signup")).not.toMatch(/\b(tu|ton)\b/i)
    expect(hydrationNoticeText("event")).toContain("ton navigateur")
    expect(hydrationNoticeText("event")).toContain("demande à l'organisation de t'inscrire")
    for (const kind of ["signup", "event"] as const) expect(hydrationNoticeText(kind)).not.toMatch(/javascript/i)
  })

  it("gives the control its description only until the page has started", () => {
    expect(hydrationNoticeId(false, "n")).toBe("n")
    expect(hydrationNoticeId(true, "n")).toBeUndefined()
  })

  // The reveal is a visibility step: gated behind motion-safe it would never show under
  // « Réduire les animations ». A delay, and no room taken while hidden.
  it("is revealed by a CSS delay that does not depend on a motion preference", () => {
    const css = readFileSync("src/app/globals.css", "utf8")
    const rule = /\.hydration-notice \{[^}]*\}/.exec(css)?.[0] ?? ""
    expect(rule).toContain("visibility: hidden")
    expect(rule).toContain("max-height: 0")
    expect(rule).toMatch(/animation: hydration-notice-reveal [^;]* 4s forwards/)
    expect(css).not.toMatch(/prefers-reduced-motion[^{]*\{[^}]*hydration-notice/)
  })
})

describe("SignupForm before the page has started (#1343)", () => {
  const form = <SignupForm open siteName="benevol.app" />

  it("shows the notice before the first field and ties the submit button to it", () => {
    const html = renderToString(form)
    const notice = html.indexOf('class="hydration-notice')
    expect(notice).toBeGreaterThan(-1)
    expect(notice).toBeLessThan(html.indexOf("<input"))
    const id = /<div id="([^"]+)" role="status" class="hydration-notice/.exec(html)?.[1]
    expect(html).toMatch(new RegExp(`<button type="submit"[^>]*aria-describedby="${id}"`))
  })

  it("drops the notice and the description once started", () => {
    render(form)
    expect(screen.queryByText(HYDRATION_NOTICE_LEAD)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Créer mon espace" })).not.toHaveAttribute("aria-describedby")
  })

  it("does not show it when sign-up is closed", () => {
    expect(renderToString(<SignupForm open={false} siteName="benevol.app" />)).not.toContain("hydration-notice")
  })
})
