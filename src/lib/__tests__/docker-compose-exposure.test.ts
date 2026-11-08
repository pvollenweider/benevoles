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
