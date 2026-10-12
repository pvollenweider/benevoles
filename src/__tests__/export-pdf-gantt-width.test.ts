import { describe, it, expect, vi } from "vitest"

const findFirst = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: vi.fn(async () => ({ organizationId: "org-a", db: { event: { findFirst } } })) }))

const shift = (id: string, roleName: string, startTime: string, endTime: string) => ({
  id, roleName, label: roleName, date: new Date("2026-10-10T00:00:00Z"), startTime, endTime, capacity: 4, status: "open", displayOrder: 0,
  registrations: [{ status: "active", phone: null, comment: null, volunteer: { firstName: "Léa", lastName: "Giroud", email: "lea@x.ch", phone: null } }],
})

describe("GET /api/admin/events/[id]/export/pdf: the Frise fits the page (#923)", () => {
  it("scales a long day's time axis to the page width instead of a minimum width per slot", async () => {
    findFirst.mockResolvedValue({
      title: "Fête", organization: { timeZone: "Europe/Zurich" }, showSchedule: null,
      shifts: [shift("1", "Accueil", "08:00", "10:00"), shift("2", "Loge", "22:00", "02:00")],
    })
    const { GET } = await import("@/app/api/admin/events/[id]/export/pdf/route")
    const html = await (await GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: "e1" }) })).text()
    // Before #923: `table-layout: auto; width: auto` and `.slot-th { min-width: 20px }` made the
    // 72 slots of this day about 1 500 px wide, past the right edge of an A4 landscape page.
    expect(html).toMatch(/\.gantt-table \{ table-layout: fixed; width: 100%; \}/)
    expect(html).not.toMatch(/\.slot-th\s*\{[^}]*min-width/)
    expect(html).toContain('<col span="72"')
  })
})
