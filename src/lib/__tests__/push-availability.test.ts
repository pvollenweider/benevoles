import { describe, it, expect } from "vitest"
import {
  PUSH_FAILURE_TEXT,
  PUSH_UNAVAILABLE_TEXT,
  pushRendersNothing,
  pushStateFromEnvironment,
  pushStateFromKey,
  pushStatusText,
  type PushState,
} from "../push-availability"

// Push reminder button without VAPID keys, and its failure text (#534).
describe("pushStateFromEnvironment", () => {
  it("checks the server's key when the browser can do push", () => {
    expect(pushStateFromEnvironment({ serviceWorker: true, pushManager: true })).toBe("checking")
  })

  it("is unsupported without a service worker or the Push API", () => {
    expect(pushStateFromEnvironment({ serviceWorker: false, pushManager: true })).toBe("unsupported")
    expect(pushStateFromEnvironment({ serviceWorker: true, pushManager: false })).toBe("unsupported")
    expect(pushStateFromEnvironment({ serviceWorker: false, pushManager: false })).toBe("unsupported")
  })
})

describe("pushStateFromKey", () => {
  it("offers the button when the server has a key", () => {
    expect(pushStateFromKey("BEl62iUYgUivxIkv69yViEuiBIa")).toBe("idle")
  })

  it("renders nothing when the server has no key (null, empty, missing, not a string)", () => {
    for (const key of [null, "", undefined, 42, {}]) expect(pushStateFromKey(key)).toBe("no-vapid")
  })
})

describe("pushRendersNothing", () => {
  it("is true only for an unsupported browser and a site without push", () => {
    const all: PushState[] = ["checking", "idle", "loading", "subscribed", "denied", "unsupported", "no-vapid", "unavailable"]
    expect(all.filter(pushRendersNothing)).toEqual(["unsupported", "no-vapid"])
  })
})

describe("pushStatusText", () => {
  it("says the outcome of a press, nothing while checking or idle", () => {
    expect(pushStatusText("subscribed")).toBe("Rappels push activés")
    expect(pushStatusText("denied")).toBe("Notifications bloquées dans les paramètres du navigateur.")
    expect(pushStatusText("unavailable")).toBe("Les rappels push ne sont pas disponibles pour le moment.")
    for (const s of ["checking", "idle", "loading"] as PushState[]) expect(pushStatusText(s)).toBe("")
  })

  it("addresses the volunteer with « tu », without middle dot or em-dash", () => {
    expect(PUSH_FAILURE_TEXT).toBe("Les rappels n'ont pas pu être activés. Réessaie dans un moment.")
    for (const text of [PUSH_FAILURE_TEXT, PUSH_UNAVAILABLE_TEXT]) {
      expect(text).not.toMatch(/·|—|\bvous\b|\bvotre\b/)
    }
  })
})
