import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { DEFAULT_READY_FILE } from "../readiness"

// A new pod takes traffic only once warmed up (scripts/warmup.mjs, src/lib/readiness.ts): the
// Deployment, the entrypoint and the image have to agree, and the rollout has to keep the old pod
// serving meanwhile.
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")
const deployment = read("k8s/deployment.yaml")
const entrypoint = read("docker-entrypoint.sh")
const dockerfile = read("Dockerfile")
const workflow = read(".github/workflows/deploy.yml")

function probe(name: string): Record<string, string> {
  const block = deployment.match(new RegExp(`${name}:\\n((?:\\s{12,}.*\\n)+)`))
  expect(block, name).not.toBeNull()
  return Object.fromEntries([...block![1].matchAll(/^\s+(\w+): (.+)$/gm)].map((m) => [m[1], m[2].trim()]))
}

describe("warm-up before readiness", () => {
  it("readiness waits for the warm-up, liveness does not", () => {
    expect(probe("readinessProbe").path).toBe("/api/health/ready")
    expect(probe("livenessProbe").path).toBe("/api/health")
  })

  it("the rolling update keeps the old pod until the new one is ready", () => {
    expect(deployment).toMatch(/type: RollingUpdate\n\s+rollingUpdate:\n\s+maxSurge: 1\n\s+maxUnavailable: 0\n/)
  })

  it("the timing budget fits: warm-up cap and probes within the rollout timeout, liveness patient", () => {
    const ready = probe("readinessProbe")
    const live = probe("livenessProbe")
    const warmupCapS = 60 + 5 // WARMUP_TIMEOUT_MS default plus the script's hard stop
    const rolloutTimeout = Number(workflow.match(/rollout status deployment\/benevoles-app[\s\S]*?--timeout=(\d+)s/)![1])
    const worstReady = Number(ready.initialDelaySeconds) + warmupCapS + Number(ready.periodSeconds)
    expect(worstReady).toBeLessThan(rolloutTimeout / 2)
    // Liveness never decides during the warm-up: it gives the server well over the cap.
    const liveGrace = Number(live.initialDelaySeconds) + Number(live.periodSeconds) * Number(live.failureThreshold)
    expect(liveGrace).toBeGreaterThan(warmupCapS)
  })

  it("the entrypoint warms only the server, then always writes the readiness file", () => {
    expect(entrypoint).toContain(`READY_FILE="\${WARMUP_READY_FILE:-${DEFAULT_READY_FILE}}"`)
    expect(entrypoint).toContain('if [ "$*" = "node server.js" ]; then')
    expect(entrypoint).toMatch(/\( node scripts\/warmup\.mjs \|\| .*; touch "\$READY_FILE" \) &/)
    expect(entrypoint.indexOf('rm -f "$READY_FILE"')).toBeLessThan(entrypoint.indexOf("node scripts/warmup.mjs"))
    expect(entrypoint.trimEnd().endsWith('exec "$@"')).toBe(true)
  })

  it("the image carries the warm-up script and starts the server through the entrypoint", () => {
    expect(dockerfile).toMatch(/COPY --from=builder .*\/app\/scripts\/warmup\.mjs \.\/scripts\/warmup\.mjs\n/)
    expect(dockerfile).toContain('CMD ["node", "server.js"]')
    expect(read(".dockerignore").split("\n").map((l) => l.trim())).not.toContain("scripts")
  })
})
