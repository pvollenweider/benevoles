// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import dns from "node:dns"
import net from "node:net"

/**
 * Where the server may POST a Web Push message (#1041). Browsers pick their push service (FCM,
 * Mozilla, WNS, Apple, or any UnifiedPush distributor on its own domain), so the host itself is
 * not restricted: every legitimate provider keeps working. What is refused is anything that
 * would make the server talk to a non-public address: plain http, credentials, a non-default
 * port, IP literals outside the public internet, local-only names, and (at connection time,
 * see `safePushLookup`) names that resolve to such an address, which also covers DNS rebinding.
 */

const MAX_ENDPOINT_LENGTH = 2048

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
  ["64:ff9b::", 96], // NAT64: would reach an IPv4 address through a translator
  ["64:ff9b:1::", 48], // local-use NAT64
  ["2001::", 23], // IETF protocol assignments, incl. Teredo
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4: embeds an arbitrary IPv4 address
  ["3fff::", 20], // documentation
] as const) blocked.addSubnet(prefix, bits, "ipv6")
/** Global unicast IPv6: everything else (::1, ::, fc00::/7, fe80::/10, ff00::/8, ::ffff:0:0/96…) is outside it. */
const globalIpv6 = new net.BlockList()
globalIpv6.addSubnet("2000::", 3, "ipv6")

/** Whether an IP address is on the public internet (false for anything else, including non-IPs). */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address)
  if (family === 4) return !blocked.check(address, "ipv4")
  if (family === 6) return globalIpv6.check(address, "ipv6") && !blocked.check(address, "ipv6")
  return false
}

/** Names that only make sense inside a machine or a private network. */
function isLocalName(host: string): boolean {
  if (!host.includes(".")) return true // single label: "localhost", a cluster service name…
  return /\.(localhost|local|localdomain|internal|intranet|lan|home|corp|private|home\.arpa|svc|cluster\.local)$/.test(host)
}

/**
 * Whether a push subscription endpoint may be stored and sent to: https on the default port, no
 * credentials, a bounded length, and a public host (a public IP literal or a DNS name that is not
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
  // URL normalises ":443" to "" for https, so any port left is a non-default one.
  if (url.port !== "") return false
  // URL also normalises numeric hosts ("2130706433", "0x7f.1") to dotted IPv4.
  const host = url.hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1")
  if (!host || host.endsWith(".")) return false
  if (net.isIP(host)) return isPublicAddress(host)
  return !isLocalName(host)
}

type LookupAddress = { address: string; family: number }
type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void
type Resolver = (hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void

/**
 * A `lookup` for the push connections: resolves the name, and refuses the connection when any
 * answer is not a public address, so a public name pointing (or re-pointed) to an internal host
 * is never reached. Same contract as `dns.lookup` (single address or `all`).
 */
export function createSafeLookup(resolve: Resolver = dns.lookup as unknown as Resolver) {
  return (hostname: string, options: dns.LookupOptions | number | undefined, callback: LookupCallback) => {
    const opts: dns.LookupOptions = typeof options === "number" ? { family: options } : (options ?? {})
    resolve(hostname, { ...opts, all: true }, (err, addresses) => {
      if (err) return callback(err, [])
      if (!addresses?.length || addresses.some((a) => !isPublicAddress(a.address))) {
        const e: NodeJS.ErrnoException = new Error(`Push endpoint host ${hostname} does not resolve to a public address`)
        e.code = "EPUSHNONPUBLIC"
        return callback(e, [])
      }
      if (opts.all) return callback(null, addresses)
      callback(null, addresses[0].address, addresses[0].family)
    })
  }
}

export const safePushLookup = createSafeLookup()
