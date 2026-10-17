import { describe, it, expect } from "vitest"
import { isAllowedPushEndpoint, MAX_PUSH_SUBSCRIPTIONS_PER_VOLUNTEER } from "../push-endpoint"

// Web Push endpoints (#1041): only the browsers' push services, over https on the default port.
describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:APA91b",
    "https://FCM.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:443/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://wns2-par02p.notify.windows.com/w/?id=BQYAAA",
    "https://web.push.apple.com/QGuQyavXutnMH",
  ])("accepts %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true)
  })

  it.each([
    ["plain http", "http://fcm.googleapis.com/fcm/send/abc"],
    ["another host", "https://push.example.com/abc"],
    ["credentials", "https://user:pass@fcm.googleapis.com/fcm/send/abc"],
    ["a username only", "https://user@web.push.apple.com/abc"],
    ["a non-default port", "https://fcm.googleapis.com:8443/fcm/send/abc"],
    ["an IPv4 literal", "https://142.250.0.1/fcm/send/abc"],
    ["an IPv6 literal", "https://[::1]/abc"],
    ["a lookalike suffix", "https://fcm.googleapis.com.evil.tld/fcm/send/abc"],
    ["a lookalike prefix", "https://evilfcm.googleapis.com/abc"],
    ["a lookalike wildcard", "https://push.services.mozilla.com.evil.tld/abc"],
    ["the bare wildcard parent", "https://push.services.mozilla.com/abc"],
    ["a dash lookalike", "https://evil-notify.windows.com/abc"],
    ["a subdomain of an exact host", "https://x.fcm.googleapis.com/abc"],
    ["the bare Apple parent", "https://push.apple.com/abc"],
    ["an Apple lookalike", "https://web.push.apple.com.evil.tld/abc"],
    ["a trailing dot", "https://fcm.googleapis.com./fcm/send/abc"],
    ["the shut-down GCM host", "https://android.googleapis.com/gcm/send/abc"],
    ["another scheme", "wss://fcm.googleapis.com/abc"],
    ["garbage", "not a url"],
    ["an overlong value", `https://fcm.googleapis.com/${"a".repeat(2100)}`],
  ])("refuses %s", (_label, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false)
  })

  it("refuses non-strings", () => {
    expect(isAllowedPushEndpoint(undefined)).toBe(false)
    expect(isAllowedPushEndpoint(42)).toBe(false)
  })

  it("keeps the per-volunteer cap small", () => {
    expect(MAX_PUSH_SUBSCRIPTIONS_PER_VOLUNTEER).toBe(5)
  })
})
