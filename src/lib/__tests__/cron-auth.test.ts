// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { isCronAuthorized } from "../cron-auth"

const req = (headers: Record<string, string>) => new Request("http://localhost/api/cron/outbox", { headers })

describe("isCronAuthorized (#1048)", () => {
  it("accepts the configured bearer secret", () => {
    expect(isCronAuthorized(req({ authorization: "Bearer s3cret", host: "www.example.org" }), "s3cret", "production")).toBe(true)
  })

  it("refuses a wrong, truncated, longer or missing secret", () => {
    for (const authorization of ["Bearer s3creT", "Bearer s3cre", "Bearer s3cret2", "s3cret", "Basic s3cret"]) {
      expect(isCronAuthorized(req({ authorization, host: "www.example.org" }), "s3cret", "production")).toBe(false)
    }
    expect(isCronAuthorized(req({ host: "www.example.org" }), "s3cret", "production")).toBe(false)
  })

  it("does not fall back to localhost once a secret is configured", () => {
    expect(isCronAuthorized(req({ host: "localhost:3000" }), "s3cret", "development")).toBe(false)
  })

  it("refuses everything in production without a secret", () => {
    expect(isCronAuthorized(req({ host: "localhost:3000" }), undefined, "production")).toBe(false)
  })

  it("allows localhost only in development without a secret", () => {
    expect(isCronAuthorized(req({ host: "localhost:3000" }), undefined, "development")).toBe(true)
    expect(isCronAuthorized(req({ host: "127.0.0.1:3000" }), undefined, "development")).toBe(true)
    expect(isCronAuthorized(req({ host: "www.example.org" }), undefined, "development")).toBe(false)
  })
})
