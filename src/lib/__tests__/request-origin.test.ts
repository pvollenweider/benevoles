// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { checkAdminMutation, CONTENT_TYPE_REFUSED, isProtectedApiPath, ORIGIN_REFUSED, type OriginCheckInput } from "../request-origin"

const PROD = "https://www.benevol.app"

function input(over: Partial<Omit<OriginCheckInput, "headers">> & { headers?: Record<string, string> } = {}): OriginCheckInput {
  const { headers, ...rest } = over
  return {
    method: "POST",
    pathname: "/api/admin/events",
    configuredAppUrl: PROD,
    nodeEnv: "production",
    ...rest,
    headers: new Headers({ host: "lausanne.benevol.app", "content-type": "application/json", "content-length": "12", ...headers }),
  }
}

const refusedOrigin = { status: 403, error: ORIGIN_REFUSED }
const refusedType = { status: 415, error: CONTENT_TYPE_REFUSED }

describe("isProtectedApiPath", () => {
  it("covers the admin and super-admin APIs only", () => {
    expect(isProtectedApiPath("/api/admin/events")).toBe(true)
    expect(isProtectedApiPath("/api/super-admin/use-org/x")).toBe(true)
    for (const p of ["/api/public/registrations", "/api/cron/outbox", "/api/auth/callback/credentials", "/api/health", "/api/administrator", "/admin/events"]) {
      expect(isProtectedApiPath(p)).toBe(false)
    }
  })
})

describe("checkAdminMutation: Origin present (#1048)", () => {
  it("accepts the request's own origin", () => {
    expect(checkAdminMutation(input({ headers: { origin: "https://lausanne.benevol.app" } }))).toBeNull()
  })

  it("accepts the configured site address", () => {
    expect(checkAdminMutation(input({ headers: { origin: PROD } }))).toBeNull()
  })

  it("refuses another organization's address, the same site but another origin", () => {
    expect(checkAdminMutation(input({ headers: { origin: "https://geneve.benevol.app" } }))).toEqual(refusedOrigin)
  })

  it("refuses another site, a null origin and malformed values", () => {
    for (const origin of ["https://evil.example", "null", "not a url", "https://lausanne.benevol.app/path", "ftp://lausanne.benevol.app"]) {
      expect(checkAdminMutation(input({ headers: { origin } }))).toEqual(refusedOrigin)
    }
  })

  it("compares the scheme and port too", () => {
    expect(checkAdminMutation(input({ headers: { origin: "http://lausanne.benevol.app" } }))).toEqual(refusedOrigin)
    expect(checkAdminMutation(input({ headers: { origin: "https://lausanne.benevol.app:8443" } }))).toEqual(refusedOrigin)
  })

  it("does not let Fetch Metadata override a refused origin", () => {
    expect(checkAdminMutation(input({ headers: { origin: "https://geneve.benevol.app", "sec-fetch-site": "same-origin" } }))).toEqual(refusedOrigin)
  })

  it("accepts http on localhost when the configured address is http", () => {
    const local = input({ configuredAppUrl: "http://localhost:3100", nodeEnv: "development", headers: { host: "localhost:3100", origin: "http://localhost:3100" } })
    expect(checkAdminMutation(local)).toBeNull()
  })

  it("accepts either scheme in development without a configured address, none in production", () => {
    const dev = input({ configuredAppUrl: undefined, nodeEnv: "development", headers: { host: "localhost:3000", origin: "http://localhost:3000" } })
    expect(checkAdminMutation(dev)).toBeNull()
    const prod = input({ configuredAppUrl: undefined, nodeEnv: "production", headers: { host: "localhost:3000", origin: "http://localhost:3000" } })
    expect(checkAdminMutation(prod)).toEqual(refusedOrigin)
  })
})

describe("checkAdminMutation: Origin missing (#1048)", () => {
  it("accepts a tool's request without any browser signal (curl, end-to-end tests)", () => {
    expect(checkAdminMutation(input())).toBeNull()
  })

  it("accepts Sec-Fetch-Site same-origin", () => {
    expect(checkAdminMutation(input({ headers: { "sec-fetch-site": "same-origin" } }))).toBeNull()
  })

  it("refuses a browser request marked same-site, cross-site or none", () => {
    for (const site of ["same-site", "cross-site", "none"]) {
      expect(checkAdminMutation(input({ headers: { "sec-fetch-site": site } }))).toEqual(refusedOrigin)
    }
  })

  it("checks a Referer when there is one", () => {
    expect(checkAdminMutation(input({ headers: { referer: "https://lausanne.benevol.app/admin/events" } }))).toBeNull()
    expect(checkAdminMutation(input({ headers: { referer: "https://geneve.benevol.app/page" } }))).toEqual(refusedOrigin)
    expect(checkAdminMutation(input({ headers: { referer: "garbage" } }))).toEqual(refusedOrigin)
  })
})

describe("checkAdminMutation: body type (#1048)", () => {
  const ok = { origin: "https://lausanne.benevol.app" }

  it("refuses what a plain HTML form can send to a JSON route", () => {
    for (const type of ["text/plain", "text/plain;charset=UTF-8", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
      expect(checkAdminMutation(input({ headers: { ...ok, "content-type": type } }))).toEqual(refusedType)
    }
  })

  it("accepts JSON with parameters and in any case", () => {
    expect(checkAdminMutation(input({ headers: { ...ok, "content-type": "Application/JSON; charset=utf-8" } }))).toBeNull()
  })

  it("refuses a body without a declared type, accepts a request without body", () => {
    const noType = new Headers({ host: "lausanne.benevol.app", ...ok, "content-length": "12" })
    expect(checkAdminMutation({ ...input(), headers: noType })).toEqual(refusedType)
    const chunked = new Headers({ host: "lausanne.benevol.app", ...ok, "transfer-encoding": "chunked" })
    expect(checkAdminMutation({ ...input(), headers: chunked })).toEqual(refusedType)
    for (const headers of [new Headers({ host: "lausanne.benevol.app", ...ok }), new Headers({ host: "lausanne.benevol.app", ...ok, "content-length": "0" })]) {
      expect(checkAdminMutation({ ...input({ method: "DELETE" }), headers })).toBeNull()
    }
  })

  it("lets the members import and its preview take a multipart form, only there", () => {
    const multipart = { ...ok, "content-type": "multipart/form-data; boundary=----x" }
    expect(checkAdminMutation(input({ pathname: "/api/admin/members/import", headers: multipart }))).toBeNull()
    expect(checkAdminMutation(input({ pathname: "/api/admin/members/import/preview", headers: multipart }))).toBeNull()
    expect(checkAdminMutation(input({ pathname: "/api/admin/members/import/other", headers: multipart }))).toEqual(refusedType)
    expect(checkAdminMutation(input({ method: "PUT", pathname: "/api/admin/members/import", headers: multipart }))).toEqual(refusedType)
  })

  it("lets the logo upload take image bytes with PUT only", () => {
    const png = { ...ok, "content-type": "image/png" }
    expect(checkAdminMutation(input({ method: "PUT", pathname: "/api/admin/settings/organization/logo", headers: png }))).toBeNull()
    expect(checkAdminMutation(input({ method: "PUT", pathname: "/api/admin/settings/organization/logo", headers: { ...ok, "content-type": "application/octet-stream" } }))).toBeNull()
    expect(checkAdminMutation(input({ method: "POST", pathname: "/api/admin/settings/organization/logo", headers: png }))).toEqual(refusedType)
  })

  it("lets the super admin's organization switch take its HTML form", () => {
    const form = { origin: "https://www.benevol.app", host: "www.benevol.app", "content-type": "application/x-www-form-urlencoded" }
    expect(checkAdminMutation(input({ pathname: "/api/super-admin/use-org/org-1", headers: form }))).toBeNull()
    // Still behind the origin check.
    expect(checkAdminMutation(input({ pathname: "/api/super-admin/use-org/org-1", headers: { ...form, origin: "https://lausanne.benevol.app" } }))).toEqual(refusedOrigin)
  })
})

describe("checkAdminMutation: out of scope", () => {
  it("leaves safe methods alone", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(checkAdminMutation(input({ method, headers: { origin: "https://evil.example", "content-type": "text/plain" } }))).toBeNull()
    }
  })

  it("leaves the public, embed, cron and sign-in endpoints alone", () => {
    for (const pathname of ["/api/public/registrations", "/api/public/embed/x", "/api/cron/outbox", "/api/auth/callback/credentials"]) {
      expect(checkAdminMutation(input({ pathname, headers: { origin: "https://evil.example", "content-type": "text/plain" } }))).toBeNull()
    }
  })
})
