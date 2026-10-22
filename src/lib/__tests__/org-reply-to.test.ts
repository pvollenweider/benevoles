import { describe, it, expect } from "vitest"
import { initialReplyToEmail, replyToOnActivation } from "@/lib/org-reply-to"
import { OWNER_ROLE, ORGANIZER_ROLE } from "@/lib/permissions"
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

describe("replyToOnActivation (#1077)", () => {
  it("offers an owner's address, normalized, when the owner activates their account", () => {
    expect(replyToOnActivation(OWNER_ROLE, " Julie@Asso.CH ", false)).toBe("julie@asso.ch")
  })

  it("never offers an organiser's address", () => {
    expect(replyToOnActivation(ORGANIZER_ROLE, "marc@asso.ch", false)).toBeNull()
  })

  it("offers nothing for an unknown role or an unusable address", () => {
    expect(replyToOnActivation(null, "julie@asso.ch", false)).toBeNull()
    expect(replyToOnActivation("super_admin", "julie@asso.ch", false)).toBeNull()
    expect(replyToOnActivation(OWNER_ROLE, "not-an-email", false)).toBeNull()
    expect(replyToOnActivation(OWNER_ROLE, null, false)).toBeNull()
  })

  it("keeps a reply-to an owner cleared on purpose in the settings empty", () => {
    expect(replyToOnActivation(OWNER_ROLE, "julie@asso.ch", true)).toBeNull()
  })
})
