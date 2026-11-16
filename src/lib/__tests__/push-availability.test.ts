import { describe, it, expect } from "vitest"
import {
  PUSH_FAILURE_TEXT,
  PUSH_UNAVAILABLE_TEXT,
  isAppleMobileDevice,
  iosVersionFromUserAgent,
  needsHomeScreenInstall,
  PUSH_BUTTON_LABEL,
  PUSH_INSTALL_INTRO,
  PUSH_INSTALL_STEPS,
  PUSH_INSTALL_TITLE,
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
    const all: PushState[] = ["checking", "idle", "loading", "subscribed", "denied", "unsupported", "no-vapid", "unavailable", "install-needed"]
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

// iPhone and iPad: push only once the page is on the Home Screen (#593).
describe("needsHomeScreenInstall", () => {
  const iosTab = { pushManager: false, appleMobile: true, standalone: false, iosVersion: [18, 5] as const }

  it("gives the steps to an iPhone or iPad in a tab, from iOS 16.4 or an unknown version", () => {
    expect(needsHomeScreenInstall(iosTab)).toBe(true)
    expect(needsHomeScreenInstall({ ...iosTab, iosVersion: [16, 4] })).toBe(true)
    expect(needsHomeScreenInstall({ ...iosTab, iosVersion: null })).toBe(true)
  })

  it("not before iOS 16.4: no Web Push there even on the Home Screen", () => {
    expect(needsHomeScreenInstall({ ...iosTab, iosVersion: [16, 3] })).toBe(false)
    expect(needsHomeScreenInstall({ ...iosTab, iosVersion: [15, 8] })).toBe(false)
  })

  it("not for an app already on the Home Screen, nor where push works, nor off iOS", () => {
    expect(needsHomeScreenInstall({ ...iosTab, standalone: true })).toBe(false)
    expect(needsHomeScreenInstall({ ...iosTab, pushManager: true })).toBe(false)
    expect(needsHomeScreenInstall({ ...iosTab, appleMobile: false })).toBe(false)
  })

  it("is rendered (not one of the silent states), with no status text", () => {
    expect(pushRendersNothing("install-needed")).toBe(false)
    expect(pushStatusText("install-needed")).toBe("")
  })

  it("names the button by its own label in the last step, in « tu », without middle dot or em-dash", () => {
    expect(PUSH_INSTALL_STEPS.at(-1)).toContain(`«\u00a0${PUSH_BUTTON_LABEL}\u00a0»`)
    for (const text of [PUSH_INSTALL_TITLE, PUSH_INSTALL_INTRO, ...PUSH_INSTALL_STEPS]) {
      expect(text).not.toMatch(/·|—|\bvous\b|\bvotre\b/)
    }
  })
})

describe("iosVersionFromUserAgent", () => {
  it("reads iPhone and iPad versions, and Safari's version on an iPad that says Macintosh", () => {
    expect(iosVersionFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1")).toEqual([18, 5])
    expect(iosVersionFromUserAgent("Mozilla/5.0 (iPad; CPU OS 16_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1")).toEqual([16, 3])
    expect(iosVersionFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15")).toEqual([17, 2])
  })

  it("is null when nothing tells", () => {
    expect(iosVersionFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15")).toBeNull()
  })
})

describe("isAppleMobileDevice", () => {
  const ua = {
    iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
    iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1",
    ipadOld: "Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1",
    ipadDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
    android: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
    windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  }

  it("recognises iPhone (Safari or another iOS browser) and iPad, old and desktop-class", () => {
    expect(isAppleMobileDevice({ userAgent: ua.iphone, maxTouchPoints: 5 })).toBe(true)
    expect(isAppleMobileDevice({ userAgent: ua.iphoneChrome, maxTouchPoints: 5 })).toBe(true)
    expect(isAppleMobileDevice({ userAgent: ua.ipadOld, maxTouchPoints: 5 })).toBe(true)
    expect(isAppleMobileDevice({ userAgent: ua.ipadDesktop, maxTouchPoints: 5 })).toBe(true)
  })

  it("does not take a Mac, Android or Windows for one", () => {
    expect(isAppleMobileDevice({ userAgent: ua.ipadDesktop, maxTouchPoints: 0 })).toBe(false)
    expect(isAppleMobileDevice({ userAgent: ua.android, maxTouchPoints: 5 })).toBe(false)
    expect(isAppleMobileDevice({ userAgent: ua.windows, maxTouchPoints: 10 })).toBe(false)
  })
})
