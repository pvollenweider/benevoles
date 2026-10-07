#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Serves videos/output locally for `VIDEO_MEDIA_BASE_URL=http://localhost:<port>` (#644), with the
// same headers the production media host (medias.benevol.app) must send: CORS, so the page at
// www.benevol.app (another origin) can play the video and load its <track> captions, and the
// correct Content-Type per extension (the platform default for .vtt is often wrong or missing).
// No dependency: node's own http + static file serving, mirroring docs/configuration.md.

import { createServer } from "node:http"
import { createReadStream, existsSync, statSync } from "node:fs"
import { join, normalize, extname } from "node:path"

const ROOT = join(process.cwd(), "videos", "output")
const PORT = Number(process.env.PORT ?? process.argv[2] ?? 4870)
// Matches src/lib/env.ts NEXT_PUBLIC_APP_URL default; override with ALLOWED_ORIGIN for another host.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "http://localhost:3000"

const CONTENT_TYPES = {
  ".mp4": "video/mp4",
  ".vtt": "text/vtt; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".jpg": "image/jpeg",
}

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
  res.setHeader("Vary", "Origin")

  if (req.method === "OPTIONS") {
    res.writeHead(204)
    res.end()
    return
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405)
    res.end("Method not allowed")
    return
  }

  const requestPath = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]))
  if (requestPath.includes("..")) {
    res.writeHead(400)
    res.end("Bad request")
    return
  }
  const filePath = join(ROOT, requestPath)
  if (!filePath.startsWith(ROOT) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404)
    res.end("Not found")
    return
  }

  const contentType = CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream"
  res.setHeader("Content-Type", contentType)
  res.setHeader("Content-Length", statSync(filePath).size)
  if (req.method === "HEAD") {
    res.writeHead(200)
    res.end()
    return
  }
  res.writeHead(200)
  createReadStream(filePath).pipe(res)
})

server.listen(PORT, () => {
  console.log(`→ videos/output servi sur http://localhost:${PORT} (CORS pour ${ALLOWED_ORIGIN})`)
  console.log(`  VIDEO_MEDIA_BASE_URL="http://localhost:${PORT}"`)
})
