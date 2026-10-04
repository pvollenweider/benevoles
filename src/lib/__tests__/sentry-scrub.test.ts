import { describe, it, expect } from "vitest"
import type { ErrorEvent } from "@sentry/nextjs"
import { scrubUrl, scrubBreadcrumb, scrubEvent, scrubSpan, NO_PII_DATA_COLLECTION, BROWSER_NOISE_ERRORS } from "../sentry-scrub"

const TOKEN = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4"

describe("scrubUrl", () => {
  it.each([
    [`https://benevol.app/my/${TOKEN}`, "https://benevol.app/my/[token]"],
    [`/my/${TOKEN}?x=1`, "/my/[token]?x=1"],
    [`/waitlist/${TOKEN}/confirm`, "/waitlist/[token]/confirm"],
    [`/api/public/registrations/${TOKEN}`, "/api/public/registrations/[token]"],
    [`/api/public/member-invite/${TOKEN}`, "/api/public/member-invite/[token]"],
    // Regression: a sector leader's link was sent to Sentry in clear.
    [`/leader/${TOKEN}`, "/leader/[token]"],
    [`/api/public/leader/${TOKEN}`, "/api/public/leader/[token]"],
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

  // #598: a defensive scrub so an email address can never reach Sentry, whatever string it's in.
  it("masks an email address wherever it appears", () => {
    expect(scrubUrl("delivery failed for jane.doe@example.com")).toBe("delivery failed for [email]")
    expect(scrubUrl("no email here")).toBe("no email here")
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

describe("scrubSpan (@sentry/nextjs 11 streamed spans)", () => {
  it("strips tokens from the span name and its attributes", () => {
    const span = scrubSpan({
      trace_id: "t", span_id: "s", name: `GET /my/${TOKEN}`, start_timestamp: 0, status: "ok", is_segment: true,
      attributes: { "url.full": `https://x.benevol.app/waitlist/${TOKEN}/confirm?token=${TOKEN}`, "http.method": "GET" },
    })
    expect(span.name).toBe("GET /my/[token]")
    expect(span.attributes["url.full"]).toBe("https://x.benevol.app/waitlist/[token]/confirm?token=[token]")
    expect(span.attributes["http.method"]).toBe("GET")
    expect(JSON.stringify(span)).not.toContain(TOKEN)
  })
})

describe("NO_PII_DATA_COLLECTION", () => {
  // Every field of @sentry/nextjs 11's dataCollection defaults to *on*: each one must be set.
  it("turns off every personal-data category explicitly", () => {
    expect(NO_PII_DATA_COLLECTION).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    })
  })
})

describe("BROWSER_NOISE_ERRORS", () => {
  const ignored = (message: string) => BROWSER_NOISE_ERRORS.some((r) => r.test(message))

  // Regression: an Outlook Safe Links scan of a personal link raised this on /my/[token].
  it("drops the rejection raised by Microsoft's link scanners", () => {
    expect(ignored("Non-Error promise rejection captured with value: Object Not Found Matching Id:2, MethodName:update, ParamCount:4")).toBe(true)
    expect(ignored("Object Not Found Matching Id:17, MethodName:simulateEvent, ParamCount:1")).toBe(true)
  })

  it("keeps the earlier extension filters", () => {
    for (const m of ["ReferenceError: __firefox__ is not defined", "DarkReader is not defined", "window.ethereum.selectedAddress", "MetaMask - RPC Error"]) {
      expect(ignored(m)).toBe(true)
    }
  })

  it("keeps real application errors", () => {
    for (const m of ["Object not found", "TypeError: Cannot read properties of undefined (reading 'update')", "Error: Not Found", "Lien invalide"]) {
      expect(ignored(m)).toBe(false)
    }
  })
})
