#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Warms a freshly started server before it takes traffic: every page is rendered per request
// (src/app/layout.tsx, `connection()`), so the first visit of each route after a deploy paid for
// loading its chunks, compiling them and filling the in-process caches. Started in the background
// by docker-entrypoint.sh next to `node server.js`; once it returns (or gives up), the entrypoint
// writes the readiness file that /api/health/ready waits for (src/lib/readiness.ts).
//
// The pages come from the app's own sitemap, asked for on localhost with the site's Host header:
// the public apex pages only (home, features, changelog, legal, documentation, videos). Never an
// admin page, an API route or a token page, and nothing that writes, counts a visit or sends an
// email. Plain Node, no dependency: the production image has no tsx and no dev dependencies.
//
// It never fails the container: every error is logged and skipped, and the whole run is capped.

import http from "node:http"
import { pathToFileURL } from "node:url"

export const WARMUP_USER_AGENT = "benevoles-warmup/1 (+pod readiness)"

/** Path prefixes the warm-up never requests, even if a sitemap ever listed them. */
export const UNSAFE_PREFIXES = ["/admin", "/super-admin", "/api", "/my", "/leader", "/waitlist", "/product-updates", "/monitoring"]

/** Pages warmed at most, so a huge sitemap can't stretch the run past its cap anyway. */
export const MAX_PAGES = 200

/** Whether a path is a public page the warm-up may request: no query, no private area. */
export function isSafeWarmupPath(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/") || pathname.startsWith("//")) return false
  if (pathname.includes("?") || pathname.includes("#")) return false
  return !UNSAFE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

const XML_ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" }

/**
 * The paths to warm, from the sitemap XML: the home page first, then every listed page of the
 * site's own origin in sitemap order, without duplicates, queries or private areas.
 */
export function selectWarmupPaths(sitemapXml, appUrl, max = MAX_PAGES) {
  let origin
  try {
    origin = new URL(appUrl).origin
  } catch {
    return ["/"]
  }
  const paths = ["/"]
  const locs = String(sitemapXml ?? "").matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)
  for (const [, raw] of locs) {
    const loc = raw.replace(/&(amp|lt|gt|quot|apos);/g, (e) => XML_ENTITIES[e])
    let url
    try {
      url = new URL(loc)
    } catch {
      continue
    }
    if (url.origin !== origin || url.search || url.hash) continue
    const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname
    if (!isSafeWarmupPath(pathname) || paths.includes(pathname)) continue
    paths.push(pathname)
    if (paths.length >= max) break
  }
  return paths
}

/** The warm-up settings from the container's environment. @param {Record<string, string | undefined>} env */
export function warmupConfig(env) {
  const int = (value, fallback) => {
    const n = Number.parseInt(value ?? "", 10)
    return Number.isFinite(n) && n > 0 ? n : fallback
  }
  const port = int(env.PORT, 3000)
  const appUrl = (env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`).replace(/\/+$/, "")
  let host
  try {
    host = new URL(appUrl).host
  } catch {
    host = `localhost:${port}`
  }
  return {
    port,
    appUrl,
    host,
    concurrency: int(env.WARMUP_CONCURRENCY, 4),
    requestTimeoutMs: int(env.WARMUP_REQUEST_TIMEOUT_MS, 15_000),
    totalTimeoutMs: int(env.WARMUP_TIMEOUT_MS, 60_000),
  }
}

/** One GET on the local server with the site's Host header; resolves with status and body. */
function get(config, path, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: "127.0.0.1",
        port: config.port,
        path,
        headers: { host: config.host, "user-agent": WARMUP_USER_AGENT, accept: "text/html,application/xml" },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }))
        res.on("error", reject)
      },
    )
    req.on("timeout", () => req.destroy(new Error(`timeout after ${timeoutMs} ms`)))
    req.on("error", reject)
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Runs `worker` over `items` with at most `limit` at a time, stopping new ones past `deadline`. */
export async function runBounded(items, limit, deadline, worker, now = Date.now) {
  let next = 0
  let done = 0
  const lane = async () => {
    while (next < items.length && now() < deadline) {
      const item = items[next++]
      await worker(item)
      done++
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane))
  return done
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {(line: string) => void} [log]
 */
export async function warmup(env = process.env, log = console.log) {
  const config = warmupConfig(env)
  const started = Date.now()
  const deadline = started + config.totalTimeoutMs
  const remaining = () => Math.max(1, Math.min(config.requestTimeoutMs, deadline - Date.now()))

  // The server is starting next to us: retry the sitemap until it answers or the cap is reached.
  let sitemap = null
  while (Date.now() < deadline) {
    try {
      const res = await get(config, "/sitemap.xml", remaining())
      if (res.status === 200) sitemap = res.body
      else log(`[warmup] sitemap.xml: HTTP ${res.status}, home page only`)
      break
    } catch {
      await sleep(250)
    }
  }
  if (sitemap === null && Date.now() >= deadline) {
    log(`[warmup] server not answering after ${config.totalTimeoutMs} ms, giving up`)
    return { pages: 0, errors: 0, ms: Date.now() - started }
  }

  const paths = selectWarmupPaths(sitemap ?? "", config.appUrl)
  log(`[warmup] ${paths.length} pages on ${config.host}, ${config.concurrency} at a time`)
  let errors = 0
  const done = await runBounded(paths, config.concurrency, deadline, async (path) => {
    const t0 = Date.now()
    try {
      const res = await get(config, path, remaining())
      if (res.status >= 400) errors++
      log(`[warmup] ${res.status} ${path} ${Date.now() - t0} ms`)
    } catch (error) {
      errors++
      log(`[warmup] failed ${path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
  const ms = Date.now() - started
  log(`[warmup] done: ${done}/${paths.length} pages in ${ms} ms, ${errors} errors${done < paths.length ? " (time cap reached)" : ""}`)
  return { pages: done, errors, ms }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // A hard stop on top of the per-request timeouts: whatever happens, the entrypoint gets the
  // hand back and marks the pod ready.
  const cap = warmupConfig(process.env).totalTimeoutMs + 5_000
  setTimeout(() => {
    console.log("[warmup] hard time cap reached, stopping")
    process.exit(0)
  }, cap).unref()
  warmup()
    .catch((error) => console.log(`[warmup] error: ${error instanceof Error ? error.message : String(error)}`))
    .finally(() => process.exit(0))
}
