// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What the videos show as addresses: benevol.app, never localhost.
 *
 * The product builds its share links, QR codes, email links and event addresses from
 * NEXT_PUBLIC_APP_URL, read at run time (src/lib/urls.ts). The capture server is served with
 * PUBLIC_APP_URL, so those read https://<org>.benevol.app/… on screen. Every video browser maps
 * benevol.app and its subdomains to a local TLS proxy in front of the capture server: a link the
 * scenario follows stays on this machine. Without that proxy the mapped port is closed and the
 * navigation fails; it never reaches the real site (.app is HSTS preloaded, so only https works).
 *
 * The browser itself keeps talking to http://localhost:<port> (cookies, ?org=, Node-side checks):
 * pages that print the request's own host (the space address on Paramètres, Administrateurs)
 * still show localhost:<port>.
 */

import { execFile } from "node:child_process"
import { mkdir, readFile, access } from "node:fs/promises"
import http from "node:http"
import https from "node:https"
import type { AddressInfo } from "node:net"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import type { Browser, BrowserType, LaunchOptions } from "playwright"

export const PUBLIC_APP_URL = "https://www.benevol.app"
const PUBLIC_DOMAIN = "benevol.app"

/** The organizer the default organization's videos show (« Élodie Rochat » in the demo seed). */
export const VIDEO_ADMIN_EMAIL = "elodie.rochat@example.org"
export const LEGACY_VIDEO_ADMIN_EMAIL = "org-admin@localhost"

/** The default organization's admin email for the videos: the legacy localhost one is replaced. */
export function videoAdminEmail(configured: string | undefined = process.env.ORG_ADMIN_EMAIL): string {
  return !configured || configured === LEGACY_VIDEO_ADMIN_EMAIL ? VIDEO_ADMIN_EMAIL : configured
}

/**
 * Chromium host mapping of benevol.app and every subdomain to the local proxy. The host patterns
 * must stay without a port: « MAP *.benevol.app:443 … » is silently ignored and resolves to the
 * real site (checked 2026-10-11).
 */
export function hostResolverRules(proxyPort: number): string {
  if (!Number.isInteger(proxyPort) || proxyPort <= 0 || proxyPort > 65535) throw new Error("Invalid public host proxy port")
  return `--host-resolver-rules=MAP *.${PUBLIC_DOMAIN} 127.0.0.1:${proxyPort},MAP ${PUBLIC_DOMAIN} 127.0.0.1:${proxyPort}`
}

/** The local capture server a public-host request is forwarded to; never a remote one. */
export function localTarget(appBase: string): URL {
  const target = new URL(appBase)
  if (target.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) throw new Error("The public host proxy only forwards to a local http capture server")
  return target
}

export const HOST_CHECK_PATH = "/__video_public_host_check"
const HOST_CHECK_BODY = "benevol-video-local-proxy"

async function certificate(): Promise<{ key: Buffer; cert: Buffer }> {
  const dir = path.join(os.tmpdir(), "benevol-video-tls")
  const keyFile = path.join(dir, "key.pem")
  const certFile = path.join(dir, "cert.pem")
  try {
    await access(certFile)
  } catch {
    await mkdir(dir, { recursive: true })
    await promisify(execFile)("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certFile, "-days", "3650",
      "-subj", `/CN=${PUBLIC_DOMAIN}`, "-addext", `subjectAltName=DNS:${PUBLIC_DOMAIN},DNS:*.${PUBLIC_DOMAIN}`])
  }
  return { key: await readFile(keyFile), cert: await readFile(certFile) }
}

/** A TLS proxy on a free local port that forwards benevol.app requests, Host kept, to the capture server. */
export async function startPublicHostProxy(appBase: string): Promise<{ port: number; close: () => Promise<void> }> {
  const target = localTarget(appBase)
  const server = https.createServer(await certificate(), (request, response) => {
    if (request.url === HOST_CHECK_PATH) {
      response.writeHead(200, { "Content-Type": "text/plain" }).end(HOST_CHECK_BODY)
      return
    }
    const upstream = http.request({
      hostname: target.hostname.replace(/^\[|\]$/g, ""), port: target.port || 80, method: request.method, path: request.url,
      headers: { ...request.headers, "x-forwarded-proto": "https", "x-forwarded-host": request.headers.host ?? "" },
    }, (reply) => {
      response.writeHead(reply.statusCode ?? 502, reply.headers)
      reply.pipe(response)
    })
    upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end() })
    request.pipe(upstream)
  })
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

/**
 * Launches a video browser whose benevol.app hosts resolve to this machine, and proves it before
 * returning: a page of the real site would fail the check and stop the tool.
 */
export async function launchVideoBrowser(chromium: BrowserType, options: LaunchOptions = {}, appBase = process.env.VIDEO_BASE_URL ?? "http://localhost:43100"): Promise<Browser> {
  const proxy = await startPublicHostProxy(appBase)
  const browser = await chromium.launch({ ...options, args: [...(options.args ?? []), hostResolverRules(proxy.port), "--ignore-certificate-errors"] })
  browser.on("disconnected", () => { void proxy.close() })
  const probe = await browser.newPage()
  try {
    await probe.goto(`https://check.${PUBLIC_DOMAIN}${HOST_CHECK_PATH}`)
    if ((await probe.textContent("body"))?.trim() !== HOST_CHECK_BODY) throw new Error("benevol.app is not mapped to the local proxy")
  } catch (error) {
    await browser.close()
    throw error
  } finally {
    if (browser.isConnected()) await probe.close()
  }
  return browser
}

/** The page whose canonical link shows the server's public address. */
export const PUBLIC_URL_PROBE_PATH = "/doc"

/** Whether the probe page was rendered by a server whose public address is PUBLIC_APP_URL. */
export function servedWithPublicUrl(probePageHtml: string): boolean {
  return probePageHtml.includes(`<link rel="canonical" href="${PUBLIC_APP_URL}${PUBLIC_URL_PROBE_PATH}"`)
}
