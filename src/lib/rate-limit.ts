/**
 * Sliding-window in-memory rate limiter.
 * Single-instance only — swap `store` for an Upstash Redis client when scaling horizontally.
 */

type Window = { count: number; resetAt: number }

const store = new Map<string, Window>()

// Prune expired entries every 10 minutes to prevent unbounded growth
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [key, win] of store) {
      if (win.resetAt <= now) store.delete(key)
    }
  }, 10 * 60 * 1000)
}

export function rateLimit(
  ip: string,
  route: string,
  limit: number,
  windowMs: number,
): { ok: boolean; remaining: number; retryAfter: number } {
  const key = `${route}:${ip}`
  const now = Date.now()
  const existing = store.get(key)

  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1, retryAfter: 0 }
  }

  existing.count++
  const remaining = Math.max(0, limit - existing.count)
  if (existing.count > limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((existing.resetAt - now) / 1000) }
  }
  return { ok: true, remaining, retryAfter: 0 }
}

export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  )
}
