// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { ownSentryDsns, SENTRY_TUNNEL_MAX_BYTES, sentryTunnelTarget } from "@/lib/sentry-tunnel"
import { errorLogLine } from "@/lib/report-error-log"

/** Headers of Sentry's answer the browser SDK reads to back off. */
const RELAYED_HEADERS = ["x-sentry-rate-limits", "retry-after"]

/** The body, or null past the cap (read in chunks: a lying Content-Length changes nothing). */
async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > max) return null
  if (!req.body) return new Uint8Array()
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function answer(status: number): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } })
}

/** Relays a browser error report to this project's Sentry (src/lib/sentry-tunnel.ts). */
export async function POST(req: Request) {
  // The browser SDK never compresses an envelope as a whole (a replay compresses its own item).
  const encoding = req.headers.get("content-encoding")
  if (encoding && encoding !== "identity") return answer(415)
  const envelope = await readCapped(req, SENTRY_TUNNEL_MAX_BYTES)
  if (!envelope) return answer(413)
  // Member accesses: the browser DSN is inlined at build time (a build argument of the image).
  const target = sentryTunnelTarget(envelope, ownSentryDsns({ NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN, SENTRY_DSN: process.env.SENTRY_DSN }))
  if (!target) return answer(400)
  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope as BodyInit,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    })
    const headers = new Headers({ "Cache-Control": "no-store" })
    for (const name of RELAYED_HEADERS) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    await upstream.body?.cancel()
    return new Response(null, { status: upstream.status, headers })
  } catch (error) {
    // Logged only: reporting Sentry being unreachable to Sentry would add to the failures.
    console.error(errorLogLine("sentry-tunnel", error))
    return answer(502)
  }
}
