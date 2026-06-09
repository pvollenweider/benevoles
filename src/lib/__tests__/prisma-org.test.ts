import { describe, it, expect, vi, beforeEach } from "vitest"

// Capture the extension config so the tests can drive each callback
// directly without spinning up Prisma.
const lastExtendConfig: { current: unknown } = { current: null }

vi.mock("../prisma", () => {
  return {
    prisma: {
      $extends(config: unknown) {
        lastExtendConfig.current = config
        return { __scoped: true, config }
      },
    },
  }
})

import { getOrgClient } from "../prisma-org"

type ExtensionConfig = {
  name: string
  query: Record<
    string,
    Record<
      string,
      (input: { args: Record<string, unknown>; query: (a: unknown) => unknown }) => Promise<unknown>
    >
  >
}

function getConfig(): ExtensionConfig {
  if (!lastExtendConfig.current) throw new Error("extension not configured")
  return lastExtendConfig.current as ExtensionConfig
}

describe("getOrgClient", () => {
  beforeEach(() => {
    lastExtendConfig.current = null
  })

  it("registers an extension named 'org-scoped' for all tenant models", () => {
    getOrgClient("org-A")
    const cfg = getConfig()
    expect(cfg.name).toBe("org-scoped")
    expect(cfg.query.event.findMany).toBeTypeOf("function")
    expect(cfg.query.event.findFirst).toBeTypeOf("function")
    expect(cfg.query.event.create).toBeTypeOf("function")
    expect(cfg.query.volunteer.findMany).toBeTypeOf("function")
    expect(cfg.query.volunteer.create).toBeTypeOf("function")
    expect(cfg.query.shift.findMany).toBeTypeOf("function")
    expect(cfg.query.registration.findMany).toBeTypeOf("function")
  })

  describe("event scoping", () => {
    it("injects organizationId into event.findMany where clause", async () => {
      getOrgClient("org-A")
      const cfg = getConfig()
      const query = vi.fn().mockResolvedValue([])
      const args = { where: { publicStatus: "published" } }

      await cfg.query.event.findMany({ args, query })

      expect(query).toHaveBeenCalledWith(args)
      expect(args.where).toEqual({ publicStatus: "published", organizationId: "org-A" })
    })

    it("injects organizationId into event.findFirst where clause", async () => {
      getOrgClient("org-B")
      const cfg = getConfig()
      const query = vi.fn().mockResolvedValue(null)
      const args = { where: { id: "evt-from-other-org" } }

      await cfg.query.event.findFirst({ args, query })

      expect(args.where).toEqual({ id: "evt-from-other-org", organizationId: "org-B" })
    })

    it("forces event.create to use the calling org's id (overrides any caller-provided value)", async () => {
      getOrgClient("org-A")
      const cfg = getConfig()
      const query = vi.fn().mockResolvedValue({})
      const args = { data: { title: "Festival", organizationId: "ATTACKER" } }

      await cfg.query.event.create({ args, query })

      expect((args.data as { organizationId: string }).organizationId).toBe("org-A")
    })

    it("event.count is also scoped", async () => {
      getOrgClient("org-A")
      const cfg = getConfig()
      const query = vi.fn().mockResolvedValue(0)
      const args = {}

      await cfg.query.event.count({ args, query })

      expect((args as { where: unknown }).where).toEqual({ organizationId: "org-A" })
    })
  })

  describe("volunteer scoping", () => {
    it("injects organizationId into volunteer.findMany where clause", async () => {
      getOrgClient("org-A")
      const cfg = getConfig()
      const query = vi.fn().mockResolvedValue([])
      const args = { where: { active: true } }

      await cfg.query.volunteer.findMany({ args, query })

      expect(args.where).toEqual({ active: true, organizationId: "org-A" })
    })

    it("forces volunteer.create to use the calling org's id", async () => {
      getOrgClient("org-A")
      const cfg = getConfig()
      const query = vi.fn().mockResolvedValue({})
      const args = { data: { firstName: "Alice", lastName: "M.", organizationId: "ATTACKER" } }

      await cfg.query.volunteer.create({ args, query })

      expect((args.data as { organizationId: string }).organizationId).toBe("org-A")
    })
  })

  describe("shift scoping (via parent event)", () => {
    it("injects event.organizationId filter into shift.findMany", async () => {
      getOrgClient("org-A")
      const cfg = getConfig()
      const query = vi.fn().mockResolvedValue([])
      const args = { where: { status: "open" } }

      await cfg.query.shift.findMany({ args, query })

      expect(args.where).toEqual({
        status: "open",
        event: { organizationId: "org-A" },
      })
    })

    it("preserves existing event filters when scoping shift queries", async () => {
      getOrgClient("org-A")
      const cfg = getConfig()
      const query = vi.fn().mockResolvedValue([])
      const args = { where: { event: { publicStatus: "published" } } }

      await cfg.query.shift.findFirst({ args, query })

      expect(args.where).toEqual({
        event: { publicStatus: "published", organizationId: "org-A" },
      })
    })
  })

  describe("registration scoping (via parent event)", () => {
    it("injects event.organizationId filter into registration.findMany", async () => {
      getOrgClient("org-A")
      const cfg = getConfig()
      const query = vi.fn().mockResolvedValue([])
      const args = { where: { status: "active" } }

      await cfg.query.registration.findMany({ args, query })

      expect(args.where).toEqual({
        status: "active",
        event: { organizationId: "org-A" },
      })
    })
  })

  describe("memberInvite scoping (via parent event)", () => {
    it("injects event.organizationId filter into memberInvite.findMany", async () => {
      getOrgClient("org-A")
      const cfg = getConfig()
      const query = vi.fn().mockResolvedValue([])
      const args = { where: {} }

      await cfg.query.memberInvite.findMany({ args, query })

      expect(args.where).toEqual({
        event: { organizationId: "org-A" },
      })
    })

    it("preserves existing event filter when scoping memberInvite queries", async () => {
      getOrgClient("org-A")
      const cfg = getConfig()
      const query = vi.fn().mockResolvedValue(null)
      const args = { where: { event: { id: "evt-1" } } }

      await cfg.query.memberInvite.findFirst({ args, query })

      expect(args.where).toEqual({
        event: { id: "evt-1", organizationId: "org-A" },
      })
    })
  })

  describe("cross-tenant isolation", () => {
    it("two clients with different orgs scope to their own org id", async () => {
      const clientA = getOrgClient("org-A")
      const cfgA = getConfig()
      const query = vi.fn().mockResolvedValue([])
      const argsA = { where: {} }
      await cfgA.query.event.findMany({ args: argsA, query })
      expect(argsA.where).toEqual({ organizationId: "org-A" })

      // Different org → fresh extension config
      const clientB = getOrgClient("org-B")
      const cfgB = getConfig()
      const argsB = { where: {} }
      await cfgB.query.event.findMany({ args: argsB, query })
      expect(argsB.where).toEqual({ organizationId: "org-B" })

      // Sanity: both produced distinct extended clients
      expect(clientA).not.toBe(clientB)
    })
  })
})
