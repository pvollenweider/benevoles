import { describe, it, expect } from "vitest"
import { ownSentryDsns, sentryTunnelTarget } from "../sentry-tunnel"

const OWN = "https://abc123@o4500000000000001.ingest.de.sentry.io/4500000000000002"
const enc = (text: string) => new TextEncoder().encode(text)
const envelope = (header: unknown, rest = '\n{"type":"event"}\n{"message":"x"}\n') => enc(JSON.stringify(header) + rest)

// The /monitoring relay forwards to this project only (it used to relay to any Sentry project).
describe("sentryTunnelTarget", () => {
  it("forwards an envelope of this project to its ingest URL", () => {
    expect(sentryTunnelTarget(envelope({ dsn: OWN, sent_at: "2026-11-01T00:00:00Z" }), [OWN]))
      .toBe("https://o4500000000000001.ingest.de.sentry.io/api/4500000000000002/envelope/")
  })

  it("keeps binary items after the header untouched (only the header is read)", () => {
    const bytes = new Uint8Array([...envelope({ dsn: OWN }, "\n"), 0xff, 0x00, 0x0a, 0x1f, 0x8b])
    expect(sentryTunnelTarget(bytes, [OWN])).not.toBeNull()
  })

  it.each([
    ["another project", "https://abc123@o4500000000000001.ingest.de.sentry.io/999"],
    ["another organisation", "https://abc123@o1.ingest.sentry.io/4500000000000002"],
    ["another key", "https://zzz@o4500000000000001.ingest.de.sentry.io/4500000000000002"],
    ["another host", "https://abc123@evil.example/4500000000000002"],
    ["plain http", "http://abc123@o4500000000000001.ingest.de.sentry.io/4500000000000002"],
    ["a port", "https://abc123@o4500000000000001.ingest.de.sentry.io:8443/4500000000000002"],
    ["a path", "https://abc123@o4500000000000001.ingest.de.sentry.io/x/4500000000000002"],
  ])("refuses %s", (_label, dsn) => {
    expect(sentryTunnelTarget(envelope({ dsn }), [OWN])).toBeNull()
  })

  it("refuses an envelope without a DSN, with a broken header, or when Sentry is off", () => {
    expect(sentryTunnelTarget(envelope({ sent_at: "x" }), [OWN])).toBeNull()
    expect(sentryTunnelTarget(enc("not json\n{}"), [OWN])).toBeNull()
    expect(sentryTunnelTarget(enc(""), [OWN])).toBeNull()
    expect(sentryTunnelTarget(enc("null\n"), [OWN])).toBeNull()
    expect(sentryTunnelTarget(envelope({ dsn: OWN }), [])).toBeNull()
  })

  it("refuses an oversized header line", () => {
    expect(sentryTunnelTarget(envelope({ dsn: OWN, pad: "x".repeat(5000) }), [OWN])).toBeNull()
  })

  it("takes the browser and server DSNs, skipping empty ones", () => {
    expect(ownSentryDsns({ NEXT_PUBLIC_SENTRY_DSN: OWN, SENTRY_DSN: "" })).toEqual([OWN])
    expect(ownSentryDsns({})).toEqual([])
  })
})
