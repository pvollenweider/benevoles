import { describe, it, expect } from "vitest"
import { initialReplyToEmail } from "@/lib/org-reply-to"
import { notificationSettingsPatchSchema } from "@/lib/notification-settings"

describe("initialReplyToEmail (#1067)", () => {
  it("uses the first administrator's address, normalized", () => {
    expect(initialReplyToEmail("  Camille@Example.ORG ")).toBe("camille@example.org")
  })

  it("sets nothing for an empty or unusable address", () => {
    expect(initialReplyToEmail("")).toBeNull()
    expect(initialReplyToEmail("   ")).toBeNull()
    expect(initialReplyToEmail(null)).toBeNull()
    expect(initialReplyToEmail(undefined)).toBeNull()
    expect(initialReplyToEmail("not-an-email")).toBeNull()
    expect(initialReplyToEmail(`${"a".repeat(195)}@x.org`)).toBeNull()
  })

  it("is a value the settings form accepts as is", () => {
    const value = initialReplyToEmail("Owner@Asso.ch")
    const parsed = notificationSettingsPatchSchema.safeParse({ replyToEmail: value })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.replyToEmail).toBe(value)
  })
})
