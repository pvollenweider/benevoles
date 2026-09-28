/**
 * Sliding-window in-memory rate limiter.
 *
 * Single-instance only: counters live in this process, reset on restart and aren't shared
 * between pods. Fine with `replicas: 1` (k8s/deployment.yaml); running more replicas requires
 * moving `store` to a shared backend (Redis/Upstash) first, otherwise every limit is multiplied
 * by the number of pods (#289).
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

/** Whether `key` has already used up `limit` in its current window — reads without counting. */
export function isRateLimited(ip: string, route: string, limit: number): boolean {
  const win = store.get(`${route}:${ip}`)
  return !!win && win.resetAt > Date.now() && win.count >= limit
}

/**
 * Client IP as seen by our own reverse proxy (#289).
 *
 * `X-Forwarded-For` is a list each proxy appends to: `client-supplied…, what proxy 1 saw, …`.
 * The leftmost entries are whatever the client chose to send, so keying rate limits on them
 * lets anyone pick a fresh bucket per request. The trustworthy entry is the one added by the
 * proxy closest to us: counted from the right, TRUSTED_PROXY_HOPS entries in (1 = the rightmost,
 * Traefik in front of the pod; raise it only if another proxy/LB appends in front of Traefik).
 */
export function getClientIp(req: Request): string {
  const hops = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1)
  const chain = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean)
  if (chain.length > 0) return chain[Math.max(0, chain.length - hops)]
  return req.headers.get("x-real-ip")?.trim() || "unknown"
}
