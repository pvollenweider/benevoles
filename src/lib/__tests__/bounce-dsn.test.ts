// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import {
  isPermanentFailure,
  outboxIdFromMessageId,
  parseBounceDsn,
  responseCodeOfDiagnostic,
  type DsnRecipient,
} from "../bounce-dsn"

const fixture = (name: string) => readFileSync(join(process.cwd(), "src/lib/__tests__/fixtures/bounces", name))
const HOST = "www.benevol.app"

const recipient = (over: Partial<DsnRecipient> = {}): DsnRecipient => ({
  finalRecipient: "someone@example.org",
  action: "failed",
  status: "5.1.1",
  diagnosticCode: "smtp; 550 5.1.1 User unknown",
  ...over,
})

describe("parseBounceDsn", () => {
  it("parses a Gandi/Postfix permanent bounce from Microsoft 365", async () => {
    const parsed = await parseBounceDsn(fixture("gandi-550-5.4.1-m365.eml"))
    expect(parsed.isDsn).toBe(true)
    expect(parsed.reportType).toBe("delivery-status")
    expect(parsed.originalMessageId).toBe("<outbox-clx0000000000000000000001@www.benevol.app>")
    expect(parsed.recipients).toEqual([
      {
        finalRecipient: "eleve.test@ecole-exemple.org",
        action: "failed",
        status: "5.4.1",
        diagnosticCode: expect.stringContaining("550 5.4.1 Recipient address rejected: Access denied."),
      },
    ])
    expect(isPermanentFailure(parsed.recipients[0])).toBe(true)
    expect(responseCodeOfDiagnostic(parsed.recipients[0].diagnosticCode)).toBe(550)
  })

  it("parses a 550 5.1.1 user unknown, with folded diagnostic lines", async () => {
    const parsed = await parseBounceDsn(fixture("gandi-550-5.1.1-user-unknown.eml"))
    expect(parsed.isDsn).toBe(true)
    expect(parsed.recipients[0]).toMatchObject({ finalRecipient: "inconnu@exemple.org", action: "failed", status: "5.1.1" })
    expect(parsed.recipients[0].diagnosticCode).toContain("Recipient address rejected: User unknown")
    expect(responseCodeOfDiagnostic(parsed.recipients[0].diagnosticCode)).toBe(550)
  })

  it("keeps a delayed 4.4.1 notice out of the permanent branch", async () => {
    const parsed = await parseBounceDsn(fixture("gandi-4.4.1-delayed.eml"))
    expect(parsed.isDsn).toBe(true)
    expect(parsed.recipients[0]).toMatchObject({ finalRecipient: "retard@exemple.org", action: "delayed", status: "4.4.1" })
    expect(isPermanentFailure(parsed.recipients[0])).toBe(false)
  })

  it("does not treat an out-of-office reply as a DSN", async () => {
    const parsed = await parseBounceDsn(fixture("out-of-office.eml"))
    expect(parsed.isDsn).toBe(false)
    expect(parsed.reportType).toBe("disposition-notification")
    expect(parsed.originalMessageId).toBeNull()
  })

  it("does not treat a read receipt as a DSN, even with a Final-Recipient", async () => {
    const parsed = await parseBounceDsn(fixture("read-receipt.eml"))
    expect(parsed.isDsn).toBe(false)
    expect(parsed.reportType).toBe("disposition-notification")
  })

  it("parses a forged DSN but never correlates a Message-ID that is not ours", async () => {
    const parsed = await parseBounceDsn(fixture("forged-dsn-other-message-id.eml"))
    expect(parsed.isDsn).toBe(true)
    expect(outboxIdFromMessageId(parsed.originalMessageId, HOST)).toBeNull()
  })

  it("parses a DSN whose recipient hash does not match the outbox outcome", async () => {
    const parsed = await parseBounceDsn(fixture("dsn-recipient-hash-mismatch.eml"))
    expect(parsed.isDsn).toBe(true)
    expect(parsed.recipients[0].finalRecipient).toBe("autre.personne@exemple.org")
    expect(outboxIdFromMessageId(parsed.originalMessageId, HOST)).toBe("clx0000000000000000000002")
  })

  it("accepts a common non-standard bounce with a text/rfc822-headers attachment", async () => {
    const parsed = await parseBounceDsn(fixture("non-standard-bounce.eml"))
    expect(parsed.isDsn).toBe(true)
    expect(parsed.reportType).toBeNull()
    expect(parsed.originalMessageId).toBe("<outbox-clx0000000000000000000002@www.benevol.app>")
    expect(parsed.recipients[0]).toMatchObject({ finalRecipient: "inconnu@exemple.org", status: "5.1.1" })
  })
})

describe("outboxIdFromMessageId", () => {
  it("accepts only the exact outbox format for this deployment's host", () => {
    expect(outboxIdFromMessageId("<outbox-abc123@www.benevol.app>", HOST)).toBe("abc123")
    expect(outboxIdFromMessageId("<outbox-abc123@WWW.BENEVOL.APP>", HOST)).toBe("abc123")
    expect(outboxIdFromMessageId("<outbox-abc123@benevol.app>", HOST)).toBeNull()
    expect(outboxIdFromMessageId("<other@www.benevol.app>", HOST)).toBeNull()
    expect(outboxIdFromMessageId("<outbox-abc123@www.benevol.app>", "benevol.app")).toBeNull()
    expect(outboxIdFromMessageId(null, HOST)).toBeNull()
  })
})

describe("isPermanentFailure", () => {
  it("requires Action: failed and a 5.x.x status, or a 5xx diagnostic when Status is absent", () => {
    expect(isPermanentFailure(recipient())).toBe(true)
    expect(isPermanentFailure(recipient({ action: "delayed", status: "4.4.1" }))).toBe(false)
    expect(isPermanentFailure(recipient({ action: "failed", status: "4.4.1" }))).toBe(false)
    expect(isPermanentFailure(recipient({ action: "relayed", status: "5.1.1" }))).toBe(false)
    expect(isPermanentFailure(recipient({ status: null, diagnosticCode: "smtp; 550 5.1.1 User unknown" }))).toBe(true)
    expect(isPermanentFailure(recipient({ status: null, diagnosticCode: "smtp; 450 4.2.1 Try later" }))).toBe(false)
  })

  it("extracts the 3-digit reply code from a Diagnostic-Code, or null", () => {
    expect(responseCodeOfDiagnostic("smtp; 550 5.1.1 nope")).toBe(550)
    expect(responseCodeOfDiagnostic("smtp; 451 4.4.1 timeout")).toBe(451)
    expect(responseCodeOfDiagnostic("X-Whatever; no code")).toBeNull()
    expect(responseCodeOfDiagnostic(null)).toBeNull()
  })
})
