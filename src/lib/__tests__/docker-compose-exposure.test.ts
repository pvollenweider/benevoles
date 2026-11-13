import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

// F-03: docker-compose.yml used to publish the app on every interface while getClientIp trusts
// X-Forwarded-For. The default must stay on the host loopback; exposing it further is a
// deliberate, documented change (docs/deploiement.md, "Exposition et adresse des visiteurs").
const root = path.join(__dirname, "..", "..", "..")
const compose = fs.readFileSync(path.join(root, "docker-compose.yml"), "utf-8")

describe("docker-compose app exposure", () => {
  it("binds the app port to the host loopback by default", () => {
    expect(compose).toContain('- "127.0.0.1:3000:3000"')
  })

  it("does not publish port 3000 on every interface", () => {
    expect(compose).not.toContain('- "3000:3000"')
  })
})

// #1333: the try-out file runs the published image with a public super admin password, so it
// must stay reachable from this machine only and never carry a fixed session or encryption key.
describe("docker-compose.essai.yml (try-out)", () => {
  const essai = fs.readFileSync(path.join(root, "docker-compose.essai.yml"), "utf-8")

  it("runs the published image, not a local build", () => {
    expect(essai).toContain("image: ghcr.io/pvollenweider/benevoles:latest")
    expect(essai).not.toMatch(/^\s*build:/m)
  })

  it("publishes every port on the host loopback only", () => {
    const ports = [...essai.matchAll(/^\s*-\s*"([^"]*:\d+)"\s*$/gm)].map((m) => m[1])
    expect(ports).toEqual(["127.0.0.1:8025:8025", "127.0.0.1:3000:3000"])
  })

  it("draws its keys at random instead of writing them", () => {
    expect(essai).not.toMatch(/^\s*AUTH_SECRET:/m)
    expect(essai).not.toMatch(/^\s*TOKEN_ENCRYPTION_KEY:/m)
    expect(essai).toContain("/dev/urandom")
  })

  it("is a local, self-hosted instance that trusts its own address", () => {
    expect(essai).toContain("NEXT_PUBLIC_APP_URL: http://localhost:3000")
    expect(essai).toContain("AUTH_URL: http://localhost:3000")
    expect(essai).toContain('AUTH_TRUST_HOST: "true"')
    expect(essai).toContain('HOSTED_SERVICE: "false"')
  })
})
