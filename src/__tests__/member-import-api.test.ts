import { describe, it, expect, vi, beforeEach } from "vitest"

// Import preview then confirm (#464): nothing is written before the confirm, and the confirm
// applies only the previewed file and plan.
const requireOrgSession = vi.fn()
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession }))
const rateLimit = vi.fn()
vi.mock("@/lib/rate-limit", () => ({ rateLimit }))
const logOrgEvent = vi.fn()
vi.mock("@/lib/org-log", () => ({ logOrgEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))

const findMany = vi.fn()
const create = vi.fn()
const update = vi.fn()
const db = { volunteer: { findMany, create, update } }

const CSV = "prenom,nom,email,tags\nAlice,Martin,alice@example.com,bar\nBob,Dupont,bob@example.com,\n,Sans,x@example.com,"

function form(content: string, fields: Record<string, string> = {}, name = "membres.csv") {
  const fd = new FormData()
  fd.append("file", new File([content], name, { type: "text/csv" }))
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return new Request("http://localhost/api/admin/members/import", { method: "POST", body: fd })
}

async function preview(content = CSV, fields: Record<string, string> = {}) {
  const { POST } = await import("@/app/api/admin/members/import/preview/route")
  return POST(form(content, fields))
}

describe("member import API", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOrgSession.mockResolvedValue({ db, organizationId: "org-a", session: { user: { id: "adm-1" } } })
    rateLimit.mockResolvedValue({ ok: true, remaining: 9, retryAfter: 0 })
    findMany.mockResolvedValue([{ id: "m-alice", email: "Alice@Example.com", tags: ["bar"] }])
    create.mockResolvedValue({ id: "new" })
    update.mockResolvedValue({ id: "m-alice" })
  })

  it("previews without writing anything, and reads only the caller's organisation", async () => {
    const res = await preview(CSV, { onDuplicate: "update" })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plan.counts).toEqual({ create: 1, update: 1, skip: 0, error: 1 })
    expect(body.fileHash).toMatch(/^[0-9a-f]{64}$/)
    expect(body.planHash).toMatch(/^[0-9a-f]{64}$/)
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-a" }) }))
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(logOrgEvent).not.toHaveBeenCalled()
  })

  it("applies exactly the previewed plan and logs the import once", async () => {
    const { plan, fileHash, planHash } = await (await preview(CSV, { onDuplicate: "update" })).json()
    const { POST } = await import("@/app/api/admin/members/import/route")
    const res = await POST(form(CSV, { onDuplicate: "update", fileHash, planHash }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ created: plan.counts.create, updated: plan.counts.update, skipped: 0 })
    expect(body.errors).toEqual([{ line: 4, reason: "Prénom manquant" }])
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0][0].data).toMatchObject({ organizationId: "org-a", email: "bob@example.com" })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "m-alice" } }))
    expect(logOrgEvent).toHaveBeenCalledOnce()
    expect(logOrgEvent.mock.calls[0][0]).toMatchObject({ action: "member.imported", changes: { created: { to: 1 }, updated: { to: 1 } } })
    // No personal data in the log entry.
    expect(JSON.stringify(logOrgEvent.mock.calls[0][0])).not.toMatch(/example\.com|Alice|Bob/)
  })

  it("refuses an import that was not previewed", async () => {
    const { POST } = await import("@/app/api/admin/members/import/route")
    const res = await POST(form(CSV))
    expect(res.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })

  it("refuses a different file than the one previewed", async () => {
    const { fileHash, planHash } = await (await preview()).json()
    const { POST } = await import("@/app/api/admin/members/import/route")
    const res = await POST(form(CSV + "\nEve,Autre,eve@example.com,", { fileHash, planHash }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("pas le fichier analysé")
    expect(create).not.toHaveBeenCalled()
  })

  it("returns the up-to-date preview when members changed meanwhile, writing nothing", async () => {
    const { fileHash, planHash } = await (await preview()).json()
    findMany.mockResolvedValue([
      { id: "m-alice", email: "alice@example.com", tags: ["bar"] },
      { id: "m-bob", email: "bob@example.com", tags: [] }, // created in between
    ])
    const { POST } = await import("@/app/api/admin/members/import/route")
    const res = await POST(form(CSV, { fileHash, planHash }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain("ont changé")
    expect(body.preview.plan.counts).toEqual({ create: 0, update: 0, skip: 2, error: 1 })
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it("limits size, number of lines and frequency", async () => {
    expect((await preview("prenom,nom\n" + "x".repeat(2 * 1024 * 1024))).status).toBe(413)
    const many = "prenom,nom\n" + Array.from({ length: 5001 }, (_, i) => `P${i},N${i}`).join("\n")
    const tooMany = await preview(many)
    expect(tooMany.status).toBe(413)
    expect((await tooMany.json()).error).toContain("5000")
    rateLimit.mockResolvedValue({ ok: false, remaining: 0, retryAfter: 60 })
    expect((await preview()).status).toBe(429)
    expect(findMany).not.toHaveBeenCalled()
  })
})
