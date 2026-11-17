// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest"
import { superAdminOrgCookie } from "../super-admin-org-cookie"

describe("superAdminOrgCookie", () => {
  it("over https (production), a __Host- cookie: Secure, the whole site, no domain", () => {
    expect(superAdminOrgCookie({ AUTH_URL: "https://www.benevol.app", NODE_ENV: "production" })).toEqual({ name: "__Host-sa-org-id", secure: true })
    expect(superAdminOrgCookie({ NEXTAUTH_URL: "https://benevoles.example.org" })).toEqual({ name: "__Host-sa-org-id", secure: true })
  })

  it("over plain http (local, tests), the plain name", () => {
    expect(superAdminOrgCookie({ AUTH_URL: "http://localhost:3000" })).toEqual({ name: "sa-org-id", secure: false })
    expect(superAdminOrgCookie({})).toEqual({ name: "sa-org-id", secure: false })
  })

  it("a production build served over http keeps the Secure flag it had, under the plain name", () => {
    expect(superAdminOrgCookie({ AUTH_URL: "http://localhost:3000", NODE_ENV: "production" })).toEqual({ name: "sa-org-id", secure: true })
  })
})
