// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { pgAdapter, UTC_SESSION_OPTIONS, withUtcSession } from "../prisma-adapter"

// Every Prisma client's connections run in UTC, whatever the server's time zone (#1172): raw now()
// must agree with the UTC clock time Prisma writes into TIMESTAMP columns.
describe("UTC database sessions", () => {
  it("sends the TimeZone startup option on every connection of the pool", () => {
    expect(UTC_SESSION_OPTIONS).toBe("-c TimeZone=UTC")
    const adapter = pgAdapter("postgresql://u:p@db:5432/benevoles?schema=public") as unknown as { config: { options?: string; connectionString?: string } }
    expect(adapter.config.options).toBe("-c TimeZone=UTC")
    expect(adapter.config.connectionString).toBe("postgresql://u:p@db:5432/benevoles?schema=public")
  })

  it("leaves a connection string without options as it is", () => {
    expect(withUtcSession("postgresql://u:p@db/benevoles")).toBe("postgresql://u:p@db/benevoles")
    expect(withUtcSession(undefined)).toBeUndefined()
    expect(withUtcSession("")).toBe("")
    expect(withUtcSession("not a url")).toBe("not a url")
  })

  it("appends UTC after the connection string's own options, which pg would otherwise prefer", () => {
    const out = new URL(withUtcSession("postgresql://u:p@db/benevoles?options=-c%20TimeZone%3DEurope%2FZurich&schema=public")!)
    expect(out.searchParams.get("options")).toBe("-c TimeZone=Europe/Zurich -c TimeZone=UTC")
    expect(out.searchParams.get("schema")).toBe("public")
    expect(new URL(withUtcSession("postgresql://db/b?options=")!).searchParams.get("options")).toBe("-c TimeZone=UTC")
  })
})
