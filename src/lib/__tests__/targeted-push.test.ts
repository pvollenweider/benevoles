import { describe, it, expect } from "vitest"
import { messagePushPayload, PUSH_BODY_MAX, PUSH_TITLE_MAX } from "../targeted-message"
import { pushLabel } from "../message-history"

// Push with a targeted message (#468).
describe("messagePushPayload", () => {
  it("uses the subject and the first non-empty line, short", () => {
    expect(messagePushPayload(" Point de rendez-vous ", "\n  Parking nord à cause de la pluie.\nDétails dans l'email.")).toEqual({
      title: "Point de rendez-vous",
      body: "Parking nord à cause de la pluie.",
    })
    const long = messagePushPayload("x".repeat(100), "y".repeat(300))
    expect(long.title).toHaveLength(PUSH_TITLE_MAX)
    expect(long.title.endsWith("…")).toBe(true)
    expect(long.body).toHaveLength(PUSH_BODY_MAX)
  })
})

describe("pushLabel", () => {
  const base = { pushRequested: true, pushDevices: 5, pushSent: 0, pushFailed: 0 }
  it("says the push outcome apart from the emails, in words", () => {
    expect(pushLabel({ ...base, pushRequested: false })).toBeNull()
    expect(pushLabel({ ...base, pushDevices: 0 })).toBe("Notification demandée, mais aucun appareil abonné.")
    expect(pushLabel({ ...base, pushSent: 4, pushFailed: 1 })).toBe("5 appareils : notification 4 envoyées, 1 en échec")
    expect(pushLabel({ ...base, pushSent: 1 })).toBe("5 appareils : notification 1 envoyée, 4 en cours")
  })
})
