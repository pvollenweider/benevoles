import { describe, it, expect } from "vitest"
import type { ErrorEvent } from "@sentry/nextjs"
import { scrubUrl, scrubBreadcrumb, scrubEvent } from "../sentry-scrub"

const TOKEN = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4"

describe("scrubUrl", () => {
  it.each([
    [`https://benevol.app/my/${TOKEN}`, "https://benevol.app/my/[token]"],
    [`/my/${TOKEN}?x=1`, "/my/[token]?x=1"],
    [`/waitlist/${TOKEN}/confirm`, "/waitlist/[token]/confirm"],
    [`/api/public/registrations/${TOKEN}`, "/api/public/registrations/[token]"],
    [`/api/public/member-invite/${TOKEN}`, "/api/public/member-invite/[token]"],
    [`/admin/accept-invite?token=${TOKEN}`, "/admin/accept-invite?token=[token]"],
    [`/admin/reset-password?foo=1&token=${TOKEN}&bar=2`, "/admin/reset-password?foo=1&token=[token]&bar=2"],
    [`/festival?org=x&token=${TOKEN}#top`, "/festival?org=x&token=[token]#top"],
  ])("masks the token in %s", (input, expected) => {
    expect(scrubUrl(input)).toBe(expected)
  })

  it("leaves URLs without a token untouched", () => {
    for (const url of ["https://benevol.app/", "/legal/terms", "/api/public/events", "/api/public/registrations", "/admin/events?deleted=1"]) {
      expect(scrubUrl(url)).toBe(url)
    }
  })
})

describe("scrubBreadcrumb", () => {
  it("masks tokens in the message and in the data urls", () => {
    const out = scrubBreadcrumb({
      category: "navigation",
      message: `GET /my/${TOKEN}`,
      data: { from: "/", to: `/my/${TOKEN}`, nested: { url: `/waitlist/${TOKEN}/confirm` } },
    })
    expect(JSON.stringify(out)).not.toContain(TOKEN)
    expect(out.data?.to).toBe("/my/[token]")
  })
})

describe("scrubEvent", () => {
  it("removes tokens and cookies from an error event", () => {
    const event = {
      type: undefined,
      transaction: `/my/${TOKEN}`,
      request: {
        url: `https://benevol.app/my/${TOKEN}`,
        query_string: `token=${TOKEN}`,
        headers: { Referer: `https://benevol.app/admin/accept-invite?token=${TOKEN}` },
        cookies: { "authjs.session-token": "secret-session" },
      },
      tags: { url: `https://benevol.app/my/${TOKEN}` },
      breadcrumbs: [{ category: "fetch", data: { url: `/api/public/registrations/${TOKEN}` } }],
    } as unknown as ErrorEvent

    const out = scrubEvent(event)
    const json = JSON.stringify(out)
    expect(json).not.toContain(TOKEN)
    expect(json).not.toContain("secret-session")
    expect(out.request?.cookies).toBeUndefined()
    expect(out.request?.url).toBe("https://benevol.app/my/[token]")
  })

  it("masks tokens in transaction spans", () => {
    const event = {
      type: "transaction",
      transaction: "/my/[token]",
      spans: [{ description: `GET /api/public/registrations/${TOKEN}`, data: { "http.url": `https://benevol.app/api/public/registrations/${TOKEN}` } }],
    } as unknown as ErrorEvent

    expect(JSON.stringify(scrubEvent(event))).not.toContain(TOKEN)
  })
})
