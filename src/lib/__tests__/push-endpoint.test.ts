import { describe, it, expect, vi } from "vitest"
import { createSafeLookup, isAllowedPushEndpoint, isPublicAddress } from "../push-endpoint"

// Web Push endpoints (#1041): any public push provider, never a non-public address.
describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:APA91b",
    "https://FCM.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:443/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://wns2-par02p.notify.windows.com/w/?id=BQYAAA",
    "https://web.push.apple.com/QGuQyavXutnMH",
    // UnifiedPush distributors live on any public domain (ntfy, self-hosted servers...).
    "https://ntfy.sh/upAbCdEf?up=1",
    "https://push.example-distributor.org/UP/abc",
    "https://8.8.8.8/push",
    "https://[2001:4860:4860::8888]/push",
    "https://fcm.googleapis.com./fcm/send/abc",
    // Any port on a public host: a self-hosted provider may not use 443.
    "https://push.example-distributor.org:8443/UP/abc",
    `https://fcm.googleapis.com/${"a".repeat(4000)}`,
  ])("accepts %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true)
  })

  it.each([
    ["plain http", "http://fcm.googleapis.com/fcm/send/abc"],
    ["credentials", "https://user:pass@fcm.googleapis.com/fcm/send/abc"],
    ["a username only", "https://user@web.push.apple.com/abc"],
    ["loopback on another port", "https://127.0.0.1:8443/abc"],
    ["localhost on another port", "https://localhost:6379/abc"],
    ["loopback IPv4", "https://127.0.0.1/abc"],
    ["loopback in decimal", "https://2130706433/abc"],
    ["loopback in hex", "https://0x7f.1/abc"],
    ["loopback IPv6", "https://[::1]/abc"],
    ["IPv4-mapped loopback", "https://[::ffff:127.0.0.1]/abc"],
    ["unspecified", "https://0.0.0.0/abc"],
    ["private 10/8", "https://10.0.0.1/abc"],
    ["private 172.16/12", "https://172.20.1.1/abc"],
    ["private 192.168/16", "https://192.168.1.10/abc"],
    ["cloud metadata", "https://169.254.169.254/latest/meta-data"],
    ["CGNAT", "https://100.64.0.1/abc"],
    ["ULA IPv6", "https://[fd00::1]/abc"],
    ["link-local IPv6", "https://[fe80::1]/abc"],
    ["multicast", "https://224.0.0.1/abc"],
    ["localhost", "https://localhost/abc"],
    ["a localhost subdomain", "https://push.localhost/abc"],
    ["a single-label name", "https://postgres/abc"],
    ["a cluster service name", "https://db.benevoles.svc.cluster.local/abc"],
    ["an .internal name", "https://metadata.google.internal/abc"],
    ["a trailing-dot local name", "https://localhost./abc"],
    ["a trailing-dot private literal", "https://10.0.0.1./abc"],
    ["another scheme", "wss://fcm.googleapis.com/abc"],
    ["garbage", "not a url"],
    ["an overlong value", `https://fcm.googleapis.com/${"a".repeat(8200)}`],
  ])("refuses %s", (_label, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false)
  })

  it("refuses non-strings", () => {
    expect(isAllowedPushEndpoint(undefined)).toBe(false)
    expect(isAllowedPushEndpoint(42)).toBe(false)
  })
})

describe("isPublicAddress", () => {
  it.each(["8.8.8.8", "142.250.180.10", "2a00:1450:4007:80e::200a", "2001:4860:4860::8888"])("public: %s", (a) => {
    expect(isPublicAddress(a)).toBe(true)
  })
  it.each([
    "127.0.0.1", "10.1.2.3", "172.31.255.255", "192.168.0.1", "169.254.169.254", "100.100.100.100",
    "0.0.0.0", "255.255.255.255", "224.0.0.251", "198.18.0.1", "192.0.2.1",
    "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:10.0.0.1",
    "64:ff9b::a00:1", "2002:a00:1::1", "2001:db8::1", "not-an-ip",
  ])("not public: %s", (a) => {
    expect(isPublicAddress(a)).toBe(false)
  })
})

// The connection-time guard: a public name whose DNS answer is internal (or re-pointed to it,
// DNS rebinding) is refused before any socket opens.
describe("createSafeLookup", () => {
  type Addr = { address: string; family: number }
  type Cb = (e: NodeJS.ErrnoException | null, a: Addr[]) => void
  const resolverFor = (addresses: Addr[]) => vi.fn((_h: string, _o: unknown, cb: Cb) => cb(null, addresses))
  const run = (lookup: ReturnType<typeof createSafeLookup>, options: object) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown; family?: number }>((resolve) =>
      lookup("push.example-distributor.org", options, (err, address, family) => resolve({ err, address, family })))

  it("passes public answers through, single and all", async () => {
    const lookup = createSafeLookup(resolverFor([{ address: "93.184.216.34", family: 4 }, { address: "2606:2800:220:1::1", family: 6 }]))
    expect(await run(lookup, {})).toEqual({ err: null, address: "93.184.216.34", family: 4 })
    expect((await run(lookup, { all: true })).address).toEqual([{ address: "93.184.216.34", family: 4 }, { address: "2606:2800:220:1::1", family: 6 }])
  })

  it.each([
    ["loopback", "127.0.0.1", 4],
    ["metadata", "169.254.169.254", 4],
    ["private", "10.0.0.5", 4],
    ["CGNAT", "100.64.1.1", 4],
    ["ULA", "fd00::5", 6],
    ["IPv6 loopback", "::1", 6],
  ])("refuses a name resolving only to %s", async (_label, address, family) => {
    const lookup = createSafeLookup(resolverFor([{ address, family }]))
    expect((await run(lookup, { all: true })).err?.code).toBe("EPUSHNONPUBLIC")
    expect((await run(lookup, {})).err?.code).toBe("EPUSHNONPUBLIC")
  })

  it("never hands out the internal answers of a mixed reply", async () => {
    const lookup = createSafeLookup(resolverFor([{ address: "10.0.0.5", family: 4 }, { address: "93.184.216.34", family: 4 }, { address: "::1", family: 6 }]))
    expect((await run(lookup, { all: true })).address).toEqual([{ address: "93.184.216.34", family: 4 }])
    expect(await run(lookup, {})).toEqual({ err: null, address: "93.184.216.34", family: 4 })
  })

  it("refuses an empty answer and forwards resolver errors", async () => {
    expect((await run(createSafeLookup(resolverFor([])), {})).err?.code).toBe("EPUSHNONPUBLIC")
    const failing = createSafeLookup(vi.fn((_h: string, _o: unknown, cb: Cb) => cb(Object.assign(new Error("nx"), { code: "ENOTFOUND" }), [])))
    expect((await run(failing, {})).err?.code).toBe("ENOTFOUND")
  })
})
