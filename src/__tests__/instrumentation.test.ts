// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  assertProductionSecrets: vi.fn(),
  bootstrapSuperAdmin: vi.fn(),
  captureException: vi.fn(),
  captureRequestError: vi.fn(),
  serverConfig: vi.fn(),
  edgeConfig: vi.fn(),
}))

vi.mock("@sentry/nextjs", () => ({
  captureRequestError: m.captureRequestError,
  captureException: m.captureException,
}))
vi.mock("../lib/env", () => ({
  env: { ADMIN_EMAIL: "admin@example.org", ADMIN_PASSWORD: "Correct-Horse-Battery9!" },
}))
vi.mock("../lib/production-guards", () => ({ assertProductionSecrets: m.assertProductionSecrets }))
vi.mock("../lib/admin-bootstrap", () => ({ bootstrapSuperAdmin: m.bootstrapSuperAdmin }))
vi.mock("../lib/prisma", () => ({ prisma: { marker: "prisma" } }))
vi.mock("../lib/report-error", () => ({
  reportError: (context: string) => (error: unknown) => m.captureException(error, { tags: { context } }),
}))
vi.mock("../../sentry.server.config", () => {
  m.serverConfig()
  return {}
})
vi.mock("../../sentry.edge.config", () => {
  m.edgeConfig()
  return {}
})

import { register } from "../instrumentation"

beforeEach(() => {
  m.assertProductionSecrets.mockReset()
  m.bootstrapSuperAdmin.mockReset()
  m.captureException.mockReset()
  m.serverConfig.mockReset()
  m.edgeConfig.mockReset()
  delete process.env.NEXT_RUNTIME
})

afterEach(() => {
  delete process.env.NEXT_RUNTIME
})

describe("instrumentation register() (#1334)", () => {
  it("imports and runs the admin bootstrap on the Node.js runtime, after the guards", async () => {
    process.env.NEXT_RUNTIME = "nodejs"
    m.bootstrapSuperAdmin.mockResolvedValueOnce(undefined)

    await register()

    expect(m.assertProductionSecrets).toHaveBeenCalledOnce()
    expect(m.bootstrapSuperAdmin).toHaveBeenCalledOnce()
    expect(m.bootstrapSuperAdmin).toHaveBeenCalledWith(process.env, { marker: "prisma" })
    expect(m.assertProductionSecrets.mock.invocationCallOrder[0]).toBeLessThan(
      m.bootstrapSuperAdmin.mock.invocationCallOrder[0],
    )
  })

  it("never imports the bootstrap on the Edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge"

    await register()

    expect(m.bootstrapSuperAdmin).not.toHaveBeenCalled()
    expect(m.assertProductionSecrets).not.toHaveBeenCalled()
    expect(m.edgeConfig).toHaveBeenCalledOnce()
    expect(m.serverConfig).not.toHaveBeenCalled()
  })

  it("lets the server start when the bootstrap fails: logs and reports instead of throwing", async () => {
    process.env.NEXT_RUNTIME = "nodejs"
    m.bootstrapSuperAdmin.mockRejectedValueOnce(new Error("base injoignable"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(register()).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("super admin"), expect.stringContaining("base injoignable"))
    expect(m.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { context: "admin.bootstrap" } })
  })
})
