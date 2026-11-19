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
    // The event's stats line: visible figures hidden from screen readers, the same in words for them.
    expect(html).toContain('<span aria-hidden="true">2/8 inscrits</span><span class="sr-only">2 inscrits sur 8 places</span>')
  })
})

describe("GET /api/admin/events/[id]/export/pdf: page breaks (#966)", () => {
  it("lets a day's Frise break between rows and keeps each heading with what follows", async () => {
    findFirst.mockResolvedValue({
      title: "Fête", organization: { timeZone: "Europe/Zurich" }, showSchedule: null,
      shifts: [shift("1", "Accueil", "08:00", "10:00")],
    })
    const { GET } = await import("@/app/api/admin/events/[id]/export/pdf/route")
    const html = await (await GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: "e1" }) })).text()
    // Before #966: `.day-block { page-break-inside: avoid }` moved a Frise taller than the space left
    // under « Planning » to page 2, leaving the heading alone on page 1.
    expect(html).not.toMatch(/\.day-block\s*\{[^}]*break-inside:\s*avoid/)
    expect(html).toMatch(/\.section-title, \.day-sub-title \{[^}]*break-after: avoid/)
    expect(html).toMatch(/thead \{ display: table-header-group; \}/)
  })
})

// Dense day (#1431): the full export shares the day sheet's rule, overview strip and 6-hour bands.
describe("GET /api/admin/events/[id]/export/pdf: dense day (#1431)", () => {
  it("prints the overview and the bands, and leaves out the day's recap table", async () => {
    const pad = (n: number) => String(n).padStart(2, "0")
    const clock = (mins: number) => `${pad(Math.floor((mins % 1440) / 60))}:${pad(mins % 60)}`
    const shifts = []
    for (let role = 0; role < 2; role++) for (let mins = 0; mins < 1440; mins += 30) {
      shifts.push(shift(`relay-${role}-${mins}`, `Relais ${role + 1}`, clock(mins), clock(mins + 30)))
    }
    findFirst.mockResolvedValue({
      title: "Relais", organization: { timeZone: "Europe/Zurich" }, showSchedule: null, shifts,
    })
    const { GET } = await import("@/app/api/admin/events/[id]/export/pdf/route")
    const html = await (await GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: "e1" }) })).text()
    expect(html).toContain("Vue d'ensemble du ")
    expect((html.match(/class="gantt-table dense-overview"/g) ?? []).length).toBe(1)
    expect((html.match(/class="gantt-table dense-band"/g) ?? []).length).toBe(4)
    expect(html).toContain("de 0h à 6h")
    expect(html).toContain("de 18h à 24h")
    expect(html).toContain('<span class="fill-count" aria-hidden="true">1/<wbr>4</span><span class="sr-only">, 1 inscrit sur 4 places</span>')
    const recap = html.split('<section class="section section-recap"')[1]
    expect(recap).toContain("Journée dense")
    expect(recap).not.toContain('<table class="recap-table">')
  })
})
