// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import dns from "node:dns"
import net from "node:net"

/**
 * Where the server may POST a Web Push message (#1041). Browsers pick their push service (FCM,
 * Mozilla, WNS, Apple, or any UnifiedPush distributor on its own domain), so the host itself is
 * not restricted, nor is the port: every legitimate provider keeps working. What is refused is
 * plain http, credentials, and anything that would make the server talk to a non-public
 * address: IP literals outside the public internet, local-only names, and (at connection time,
 * see `safePushLookup`) names that resolve to such an address, which also covers DNS rebinding.
 *
 * Accepted residual: a subscription is a browser's own choice, so a person holding a personal link
 * can make the server send an encrypted POST to a public HTTPS host of their choosing. An
 * allow-list of push services would break browsers whose service is not on it. What such a host
 * can do in return is bounded per connection (`boundPushSocket`): it is closed at the send
 * deadline, and once its answer passes a size cap.
 */

/** A sanity bound only: real endpoints are a few hundred characters. */
const MAX_ENDPOINT_LENGTH = 8192

/** Addresses never reachable for a push: loopback, private, link-local, CGNAT, documentation, multicast… */
const blocked = new net.BlockList()
for (const [prefix, bits] of [
  ["0.0.0.0", 8], // "this network", unspecified
  ["10.0.0.0", 8], // private (RFC 1918)
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private (RFC 1918)
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private (RFC 1918)
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. broadcast
] as const) blocked.addSubnet(prefix, bits, "ipv4")
for (const [prefix, bits] of [
  ["64:ff9b:1::", 48], // local-use NAT64 (site-specific mapping)
  ["2001::", 23], // IETF protocol assignments, incl. Teredo
  ["2001:db8::", 32], // documentation
  ["3fff::", 20], // documentation
] as const) blocked.addSubnet(prefix, bits, "ipv6")
/** Global unicast IPv6: everything else (::1, ::, fc00::/7, fe80::/10, ff00::/8, ::ffff:0:0/96…) is outside it. */
const globalIpv6 = new net.BlockList()
globalIpv6.addSubnet("2000::", 3, "ipv6")

/** The eight 16-bit groups of an IPv6 address (with an optional dotted IPv4 tail), or null. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase()
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) {
    const o = dotted[2].split(".").map(Number)
    text = `${dotted[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`
  }
  const [head, tail, extra] = text.split("::")
  if (extra !== undefined) return null
  const left = head ? head.split(":") : []
  const right = tail ? tail.split(":") : []
  const missing = 8 - left.length - right.length
  if (tail === undefined ? missing !== 0 : missing < 1) return null
  const groups = [...left, ...Array(tail === undefined ? 0 : missing).fill("0"), ...right].map((g) => parseInt(g, 16))
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null
}

const ipv4FromGroups = (hi: number, lo: number) => `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`

/**
 * The IPv4 address an IPv6 address stands for when it only translates to one: NAT64 well-known
 * prefix 64:ff9b::/96 (RFC 6052) and 6to4 2002::/16 (RFC 3056). Those reach the IPv4 internet, so
 * they are as public as the IPv4 address they embed.
 */
function embeddedIpv4(address: string): string | null {
  const g = ipv6Groups(address)
  if (!g) return null
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return ipv4FromGroups(g[6], g[7])
  if (g[0] === 0x2002) return ipv4FromGroups(g[1], g[2])
  return null
}

/** Whether an IP address is on the public internet (false for anything else, including non-IPs). */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address)
  if (family === 4) return !blocked.check(address, "ipv4")
  if (family !== 6) return false
  const v4 = embeddedIpv4(address)
  if (v4) return !blocked.check(v4, "ipv4")
  return globalIpv6.check(address, "ipv6") && !blocked.check(address, "ipv6")
}

/** Names that only make sense inside a machine or a private network. */
function isLocalName(host: string): boolean {
  if (!host.includes(".")) return true // single label: "localhost", a cluster service name…
  return /\.(localhost|local|localdomain|internal|intranet|lan|home|corp|private|home\.arpa|svc|cluster\.local)$/.test(host)
}

/**
 * Whether a push subscription endpoint may be stored and sent to: https, no credentials, a
 * bounded length, and a public host (a public IP literal or a DNS name that is not
 * local-only). Anything unparsable is refused. The DNS answer is checked when connecting.
 */
export function isAllowedPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== "string" || endpoint.length > MAX_ENDPOINT_LENGTH) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== "https:") return false
  if (url.username || url.password) return false
  // URL also normalises numeric hosts ("2130706433", "0x7f.1") to dotted IPv4.
  // A fully qualified name may end with a dot ("fcm.googleapis.com."): same host.
  const host = url.hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1").replace(/\.$/, "")
  if (!host) return false
  if (net.isIP(host)) return isPublicAddress(host)
  return !isLocalName(host)
}

type LookupAddress = { address: string; family: number }
type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void
type Resolver = (hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void

/**
 * A `lookup` for the push connections: resolves the name and keeps only the public answers, so
 * a name pointing (or re-pointed) to an internal host is never reached; with no public answer
 * left, the connection is refused. Same contract as `dns.lookup` (single address or `all`).
 */
export function createSafeLookup(resolve: Resolver = dns.lookup as unknown as Resolver) {
  return (hostname: string, options: dns.LookupOptions | number | undefined, callback: LookupCallback) => {
    const opts: dns.LookupOptions = typeof options === "number" ? { family: options } : (options ?? {})
    resolve(hostname, { ...opts, all: true }, (err, addresses) => {
      if (err) return callback(err, [])
      const usable = (addresses ?? []).filter((a) => isPublicAddress(a.address))
      if (usable.length === 0) {
        const e: NodeJS.ErrnoException = new Error(`Push endpoint host ${hostname} does not resolve to a public address`)
        e.code = "EPUSHNONPUBLIC"
        return callback(e, [])
      }
      if (opts.all) return callback(null, usable)
      callback(null, usable[0].address, usable[0].family)
    })
  }
}

export const safePushLookup = createSafeLookup()

/** Far above a push service's answer (a status line and a few headers, after the TLS handshake). */
export const PUSH_RESPONSE_MAX_BYTES = 256 * 1024

type BoundableSocket = {
  on(event: "data", listener: (chunk: Buffer) => void): unknown
  once(event: "close", listener: () => void): unknown
  destroy(error?: Error): unknown
}

/**
 * Closes a push connection at its deadline or once the peer has sent more than `maxBytes`. A
 * rejected send otherwise leaves its socket open (web-push has no cancel), and web-push buffers
 * the answer with no size limit: a hostile endpoint could keep connections and memory busy.
 */
export function boundPushSocket(socket: BoundableSocket, limits: { deadlineMs: number; maxBytes: number }): void {
  const timer = setTimeout(() => socket.destroy(new Error("Push send deadline exceeded")), limits.deadlineMs)
  timer.unref?.()
  let received = 0
  socket.on("data", (chunk) => {
    received += chunk.length
    if (received > limits.maxBytes) socket.destroy(new Error("Push service answer too large"))
  })
  socket.once("close", () => clearTimeout(timer))
}
