import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * #1190: the volunteer's withdrawal confirmation is grouped per volunteer and event, like the
 * organisers' notice (#869). The queue itself is covered on Postgres in
 * src/__integration__/withdrawal-confirmation-digest.int.test.ts.
 */

const queueDigestItem = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/digest", () => ({ queueDigestItem, digestDelayMs: (ms: number) => ms }))
vi.mock("@/lib/withdrawal-notifications", () => ({ WITHDRAWAL_DIGEST_DELAY_MS: 300_000 }))

import { queueWithdrawalConfirmation, withdrawalConfirmationGroupKey, withdrawalConfirmationParts, type WithdrawalConfirmationInput } from "@/lib/withdrawal-confirmation"
import { render } from "@/lib/notifications/templates"

const input = (over: Partial<WithdrawalConfirmationInput> = {}): WithdrawalConfirmationInput => ({
  registrationId: "r1",
  previousStatus: "active",
  event: { id: "e1", title: "Fête", organizationId: "org-1" },
  shift: { roleName: "Bar", label: "Bar", date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00" },
  volunteer: { id: "v1", firstName: "Chloé", lastName: "Roy", email: "chloe@example.com" },
  timeZone: "Europe/Zurich",
  ...over,
})

// 9 October, 14:05 in Zurich.
const now = new Date("2026-10-09T12:05:00Z")

describe("withdrawalConfirmationParts", () => {
  it.each([
    ["active", "Ton inscription a été annulée"],
    ["requested", "Ta demande d'inscription a été retirée"],
    ["waiting", "Tu as quitté la liste d'attente"],
    ["offered", "Tu as refusé la place qui t'était proposée"],
  ])("says what was done for a %s registration, when, and on which shift", (status, what) => {
    expect(withdrawalConfirmationParts(input({ previousStatus: status }), now)).toEqual({
      base: { volunteerName: "Chloé Roy", eventTitle: "Fête" },
      item: { what, when: "le 9 octobre à 14:05", shift: { roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00" } },
    })
  })
})

describe("queueWithdrawalConfirmation", () => {
  beforeEach(() => queueDigestItem.mockReset())

  it("queues the line in the volunteer's email for this event, keyed by the registration", async () => {
    queueDigestItem.mockResolvedValue(null)
    expect(await queueWithdrawalConfirmation(input(), now)).toEqual([])
    expect(queueDigestItem).toHaveBeenCalledWith({
      kind: "registration_withdrawn",
      groupKey: "registration_withdrawn:e1:v1",
      recipient: { email: "chloe@example.com", name: "Chloé Roy" },
      organizationId: "org-1",
      volunteerId: "v1",
      base: { volunteerName: "Chloé Roy", eventTitle: "Fête" },
      item: expect.objectContaining({ what: "Ton inscription a été annulée" }),
      itemKey: "r1",
      now,
      delayMs: 300_000,
    })
    // No merge rule: a re-registration never removes a withdrawal's line (see the module).
    expect(queueDigestItem.mock.calls[0][0].merge).toBeUndefined()
  })

  it("returns the row to deliver when it is due at once (no delay)", async () => {
    queueDigestItem.mockResolvedValue("row-1")
    expect(await queueWithdrawalConfirmation(input(), now)).toEqual(["row-1"])
  })

  it("groups per volunteer and event: two events, two groups; two volunteers, two groups", () => {
    const keys = new Set([
      withdrawalConfirmationGroupKey("e1", "v1"),
      withdrawalConfirmationGroupKey("e2", "v1"),
      withdrawalConfirmationGroupKey("e1", "v2"),
    ])
    expect(keys.size).toBe(3)
  })
})

describe("renderRegistrationWithdrawn", () => {
  const recipient = { email: "chloe@example.com", name: "Chloé Roy" }
  const parts = (status: string, label: string, at: Date) => withdrawalConfirmationParts(input({ previousStatus: status, shift: { ...input().shift, label } }), at)

  it("renders a single grouped withdrawal exactly like the email before grouping", () => {
    const { base, item } = parts("active", "Bar", now)
    const legacy = render({ kind: "registration_withdrawn", recipient, data: { ...base, ...item } })
    const grouped = render({ kind: "registration_withdrawn", recipient, data: { ...base, items: [{ key: "r1", value: item }] } })
    expect(grouped).toEqual(legacy)
    expect(grouped.subject).toBe("Ton inscription a été annulée : Fête")
  })

  it("lists six withdrawals in one email, oldest first, none left out", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ key: `r${i}`, value: parts(i % 2 ? "waiting" : "active", `Bar ${i}`, new Date(now.getTime() + i * 3000)).item }))
    const email = render({ kind: "registration_withdrawn", recipient, data: { volunteerName: "Chloé Roy", eventTitle: "Fête", items } })
    expect(email.subject).toBe("6 retraits effectués depuis ton lien personnel : Fête")
    const lines = email.text.split("\n").filter((l) => l.startsWith("- "))
    expect(lines).toHaveLength(6)
    expect(lines.map((l) => l.match(/Bar \d/)?.[0])).toEqual(["Bar 0", "Bar 1", "Bar 2", "Bar 3", "Bar 4", "Bar 5"])
    expect(lines[1]).toMatch(/^- Tu as quitté la liste d'attente, le 9 octobre à 14:05 : /)
    expect(email.text).toContain("Ce n'était pas toi ? Réponds à cet email pour prévenir l'organisation.")
    // No link in the email (#809): the one used may be in someone else's hands.
    expect(email.html).not.toMatch(/\/my\//)
  })
})
