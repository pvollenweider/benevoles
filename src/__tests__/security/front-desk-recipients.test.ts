/**
 * Front-desk access limited to one event (#1142): a front-desk account is not one of the
 * organisation's administrators. It receives none of their automatic emails and is not listed or
 * counted among them.
 *
 * Two kinds of proof:
 * - structural: every place of src/ that selects admin accounts (AdminUser.findMany / count /
 *   groupBy, and the `admins` relation of an organisation) either carries the shared role filter
 *   or is listed below with the reason it reads every account. A new unfiltered query fails here
 *   until someone decides;
 * - behavioural: the sites below answer their real query from an organisation that has an owner,
 *   an organiser and a front-desk account, and the front-desk account must not come back. The
 *   other sites have the same kind of test next to their own tests (withdrawals, sign-ups, answer
 *   changes, delivery summaries, product updates, space validation, reactivation, logo, milestones).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { COLETTE, ELODIE, SAMI, adminsMatching, teamOf, type TeamAccount } from "@/__tests__/helpers/front-desk-accounts"

const auth = vi.hoisted(() => vi.fn())
vi.mock("@/auth", () => ({ auth }))

const db = vi.hoisted(() => ({
  adminFindMany: vi.fn(), adminFindFirst: vi.fn(), adminCount: vi.fn(), adminUpdate: vi.fn(), adminDelete: vi.fn(),
  orgFindUnique: vi.fn(), queryRaw: vi.fn(),
}))
vi.mock("@/lib/prisma", () => {
  const client: Record<string, unknown> = {
    adminUser: { findMany: db.adminFindMany, findFirst: db.adminFindFirst, count: db.adminCount, update: db.adminUpdate, delete: db.adminDelete },
    organization: { findUnique: db.orgFindUnique },
    $queryRaw: db.queryRaw,
  }
  client.$transaction = async (fn: (tx: unknown) => unknown) => fn(client)
  client.$extends = () => client
  return { prisma: client }
})
const queueDigestItem = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/digest", () => ({ queueDigestItem, digestDelayMs: (ms: number) => ms }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32) } }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

const ORG = "org-fete"
let accounts: TeamAccount[]

beforeEach(() => {
  vi.clearAllMocks()
  accounts = teamOf(ORG)
  db.adminFindMany.mockImplementation(async ({ where }: { where: unknown }) => adminsMatching(where, accounts))
  db.adminFindFirst.mockImplementation(async ({ where }: { where: unknown }) => adminsMatching(where, accounts)[0] ?? null)
  db.adminCount.mockImplementation(async ({ where }: { where: unknown }) => adminsMatching(where, accounts).length)
  db.adminUpdate.mockResolvedValue({})
  db.adminDelete.mockResolvedValue({})
  db.queryRaw.mockResolvedValue([])
  db.orgFindUnique.mockResolvedValue({ active: true })
})

describe("every query that selects admin accounts is classified (#1142)", () => {
  const src = path.join(__dirname, "..", "..")
  const files: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (["generated", "__tests__", "__integration__", "node_modules"].includes(e.name)) continue
        walk(full)
      } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(full)
    }
  }
  walk(src)

  /** A read of several admin accounts, or of an organisation's `admins` relation. */
  const SELECTION = /adminUser\.(?:findMany|count|groupBy)\(|\badmins: (?:true\b|\{\s*(?:where|select|none|some|every)\b)/g
  /** What makes such a read leave the front-desk role out (or name one precise role). */
  const FILTERED = /ORG_ADMIN_ROLE_WHERE|PRODUCT_UPDATE_RECIPIENT_WHERE|eligibleOwnerWhere\(|role: OWNER_ROLE|role: "super_admin"|role: \{ in: string\[\] \}/

  /**
   * Reads of every account, whatever its role, with the reason. The number is how many such
   * reads the file has: one more fails the test.
   */
  const EVERY_ACCOUNT: Record<string, { count: number; reason: string }> = {
    "app/api/super-admin/organizations/[id]/route.ts": { count: 3, reason: "The operator's view of one organisation (every account, with its role, and their number) and its deletion, which removes every account." },
    "app/super-admin/organizations/[slug]/page.tsx": { count: 2, reason: "The operator's page of one organisation: every account with its role, and their number." },
    "app/api/super-admin/organizations/route.ts": { count: 1, reason: "The operator's list of organisations: the number of accounts of each, whatever their role." },
    "app/super-admin/organizations/page.tsx": { count: 1, reason: "The operator's list of organisations: the number of accounts of each, whatever their role." },
    "lib/prisma-org.ts": { count: 1, reason: "Checks that the account a front-desk grant is created for belongs to the organisation: an account of any role, the front-desk one first." },
    "app/api/cron/cleanup/route.ts": { count: 1, reason: "Deletes the accounts of an organisation being erased: every account." },
    "lib/org-log-read.ts": { count: 1, reason: "Names of the authors of log entries, by id: a front-desk account's check-ins must be attributed." },
    "lib/event-log-read.ts": { count: 2, reason: "Names of the authors of log entries and of milestone owners, by id." },
    "lib/send-batches-data.ts": { count: 1, reason: "Names of the authors of sends, by id." },
    "lib/token-encryption-job.ts": { count: 2, reason: "Re-encrypts stored second-factor secrets: every account that has one." },
    "lib/usage-stats.ts": { count: 1, reason: "Platform statistics grouped by role: the buckets name owner, organiser and super admin, so a front-desk account is in none." },
  }

  const unfiltered = new Map<string, number>()
  let selections = 0
  for (const file of files) {
    const source = fs.readFileSync(file, "utf-8")
    for (const match of source.matchAll(SELECTION)) {
      selections++
      // The query's own arguments: from the match to the end of its statement, at most.
      const rest = source.slice(match.index, match.index + 600)
      const end = match[0].startsWith("admins") ? rest.search(/\n\s*\},?\n|\}\s*\}[,)]/) : rest.indexOf("\n\n")
      const call = end > 0 ? rest.slice(0, end + 80) : rest
      if (FILTERED.test(call)) continue
      const key = path.relative(src, file).split(path.sep).join("/")
      unfiltered.set(key, (unfiltered.get(key) ?? 0) + 1)
    }
  }

  it("finds the selections", () => {
    expect(selections).toBeGreaterThan(25)
  })

  it("every unfiltered selection is a declared read of every account", () => {
    expect(Object.fromEntries([...unfiltered].sort())).toEqual(Object.fromEntries(Object.entries(EVERY_ACCOUNT).map(([file, { count }]) => [file, count]).sort()))
    for (const { reason } of Object.values(EVERY_ACCOUNT)) expect(reason.length).toBeGreaterThan(20)
  })

  it.each([
    "lib/answer-change-notifications.ts",
    "lib/notification-helpers.ts",
    "lib/withdrawal-notifications.ts",
    "lib/delivery-summary-data.ts",
    "lib/shift-swap-server.ts",
    "lib/org-inactivity-procedure.ts",
    "lib/availability-change-notifications.ts",
    "lib/org-inactivity-data.ts",
    "lib/notifications/outbox.ts",
    "lib/notifications/org-send-guard.ts",
    "lib/admin-team-changes.ts",
    "lib/admin-invitation-server.ts",
    "lib/org-review.ts",
    "lib/milestones.ts",
    "app/admin/settings/admins/page.tsx",
    "app/api/admin/settings/admins/route.ts",
    "app/api/super-admin/organizations/[id]/send-invite/route.ts",
    "app/api/super-admin/organizations/[id]/review/route.ts",
  ])("%s uses the shared role filter", (file) => {
    expect(fs.readFileSync(path.join(src, file), "utf-8")).toContain("ORG_ADMIN_ROLE_WHERE")
    expect(unfiltered.has(file)).toBe(false)
  })

  it.each(["app/api/super-admin/product-updates/send/route.ts", "app/api/super-admin/product-updates/route.ts", "app/super-admin/product-updates/page.tsx"])("%s uses the product-update recipients filter", (file) => {
    expect(fs.readFileSync(path.join(src, file), "utf-8")).toContain("PRODUCT_UPDATE_RECIPIENT_WHERE")
  })
})

describe("recipients and team lists leave the front-desk account out (#1142)", () => {
  it("the fixture really has an active front-desk account in the organisation", () => {
    expect(adminsMatching({ organizationId: ORG, isActive: true }, accounts).map((a) => a.email)).toEqual([ELODIE.email, SAMI.email, COLETTE.email])
  })

  it("availability changes: queued for the owner and the organiser only", async () => {
    queueDigestItem.mockResolvedValue(null)
    const { queueAvailabilityChangeNotifications } = await import("@/lib/availability-change-notifications")
    await queueAvailabilityChangeNotifications({ event: { id: "evt-1", title: "Fête du village", organizationId: ORG }, volunteerId: "vol-1", volunteerName: "Nadia Rochat", outside: [], changeId: "c-1" })
    const recipients = queueDigestItem.mock.calls.map(([item]) => item.recipient.email)
    expect(recipients).toEqual([ELODIE.email, SAMI.email])
    expect(recipients).not.toContain(COLETTE.email)
  })

  it("a space awaiting validation may write to its sign-up owner, not to a front-desk account created with it", async () => {
    const { organizationSendingVerdict } = await import("@/lib/notifications/org-send-guard")
    const createdAt = new Date("2027-01-10T08:00:00Z")
    const reader = {
      organization: {
        findUnique: async ({ select }: { select: { admins: { where: unknown } } }) => ({
          active: true, outboundEmailApprovedAt: null, createdAt,
          admins: adminsMatching(select.admins.where, accounts).map(({ email, createdAt: at }) => ({ email, createdAt: at })),
        }),
      },
    }
    expect(await organizationSendingVerdict(ORG, ELODIE.email, reader as never)).toBeNull()
    expect(await organizationSendingVerdict(ORG, COLETTE.email, reader as never)).not.toBeNull()
  })

  it("the team route lists the owner and the organiser, not the front-desk account", async () => {
    auth.mockResolvedValue({ user: { id: ELODIE.id, email: ELODIE.email, role: "admin", organizationId: ORG } })
    const { GET } = await import("@/app/api/admin/settings/admins/route")
    const res = await GET()
    expect(res.status).toBe(200)
    const emails = ((await res.json()) as { email: string }[]).map((a) => a.email)
    expect(emails).toEqual([ELODIE.email, SAMI.email])
    expect(emails).not.toContain(COLETTE.email)
  })

  it("the team's role change does not reach a front-desk account: unknown account, nothing written", async () => {
    const { changeAdminRole, ADMIN_NOT_FOUND } = await import("@/lib/admin-team-changes")
    expect(await changeAdminRole(ORG, COLETTE.id, "organizer")).toEqual({ ok: false, status: 404, error: ADMIN_NOT_FOUND })
    expect(await changeAdminRole(ORG, COLETTE.id, "admin")).toEqual({ ok: false, status: 404, error: ADMIN_NOT_FOUND })
    expect(db.adminUpdate).not.toHaveBeenCalled()
    // An organiser is still found and changed.
    expect(await changeAdminRole(ORG, SAMI.id, "admin")).toMatchObject({ ok: true, changed: true })
  })

  it("the team's removal does not reach a front-desk account either", async () => {
    const { removeOrgAdmin, ADMIN_NOT_FOUND } = await import("@/lib/admin-team-changes")
    expect(await removeOrgAdmin(ORG, COLETTE.id, ELODIE.email)).toEqual({ ok: false, status: 404, error: ADMIN_NOT_FOUND })
    expect(db.adminDelete).not.toHaveBeenCalled()
  })

  it("a front-desk account does not count as the organisation's other active administrator", async () => {
    const { removeOrgAdmin, LAST_ACTIVE_ADMIN } = await import("@/lib/admin-team-changes")
    // Only the organiser and the front-desk account are active: the organiser is the last administrator.
    accounts = accounts.map((a) => (a.id === ELODIE.id ? { ...a, isActive: false } : a))
    expect(await removeOrgAdmin(ORG, SAMI.id, "someone.else@example.org")).toEqual({ ok: false, status: 400, error: LAST_ACTIVE_ADMIN })
    expect(db.adminDelete).not.toHaveBeenCalled()
  })

  it("an organisation whose only active account is a front-desk one has no active administrator (expired invitations)", async () => {
    const { findAdminEmailHolder } = await import("@/lib/admin-invitation-server")
    const now = new Date("2027-03-01T08:00:00Z")
    const invited = { id: "adm-luc", organizationId: ORG, email: "luc.berset@example.org", name: "Luc Berset", role: "admin", isActive: false, receiveProductUpdates: true, createdAt: new Date("2027-01-10T08:00:00Z"), setupTokenHash: "h" }
    const expired = { ...invited, setupTokenExpiresAt: new Date("2027-02-01T08:00:00Z") }
    accounts = [COLETTE, expired as never].map((a) => ({ ...a, organizationId: ORG }))
    const reader = { adminUser: { findFirst: async () => expired, count: db.adminCount, deleteMany: vi.fn() } }
    expect(await findAdminEmailHolder(reader as never, invited.email, now)).toMatchObject({ organizationHasActiveAdmin: false })
    // With an active organiser, it has one.
    accounts = [...accounts, { ...SAMI, organizationId: ORG }]
    expect(await findAdminEmailHolder(reader as never, invited.email, now)).toMatchObject({ organizationHasActiveAdmin: true })
  })

  it("a front-desk account cannot be picked as the owner of a milestone", async () => {
    const { eligibleOwnerWhere } = await import("@/lib/milestones")
    expect(adminsMatching(eligibleOwnerWhere(ORG), accounts).map((a) => a.email)).toEqual([ELODIE.email, SAMI.email])
  })

  it("an abandoned sign-up space is one without an active administrator: a front-desk account does not keep it", async () => {
    const { abandonedSignupSpaceWhere } = await import("@/lib/org-review")
    const where = abandonedSignupSpaceWhere(new Date()).admins.none
    expect(adminsMatching(where, [{ ...COLETTE, organizationId: ORG }])).toEqual([])
    expect(adminsMatching(where, accounts).map((a) => a.email)).toEqual([ELODIE.email, SAMI.email])
  })
})
