import { describe, expect, it } from "vitest"
import { buildVolunteerSwapView, type ViewRegistration, type ViewRequest, type ViewShift, type VolunteerSwapInput } from "../shift-swap-view"
import { duplicatedSwaps } from "../event-duplicate"

const ZONE = "Europe/Zurich"
const NOW = new Date("2030-06-01T08:00:00Z")

const shift = (id: string, over: Partial<ViewShift> = {}): ViewShift => ({
  id, eventId: "e1", roleName: "Bar", label: "Bar", status: "open", date: new Date("2030-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00", ...over,
})
const reg = (id: string, volunteerId: string, s: ViewShift, status = "active"): ViewRegistration => ({ id, volunteerId, eventId: "e1", status, shift: s })
const request = (over: Partial<ViewRequest> = {}): ViewRequest => ({
  id: "q1", status: "open", registrationId: "rp", volunteerId: "vp", shiftId: "sa", counterRegistrationId: null, counterVolunteerId: null, counterShiftId: null,
  revision: 0, declinedVolunteerIds: [], expiresAt: new Date("2030-07-04T08:00:00Z"), endReason: null, updatedAt: NOW, ...over,
})

const sa = shift("sa")
const sb = shift("sb", { date: new Date("2030-07-05T00:00:00Z"), startTime: "14:00", endTime: "16:00", locationDetails: "Entrée nord" })
const sc = shift("sc", { roleName: "Accueil", label: "Accueil", date: new Date("2030-07-06T00:00:00Z") })

function input(over: Partial<VolunteerSwapInput> = {}): VolunteerSwapInput {
  const person = { active: true, tags: [], birthDate: new Date("1990-01-01") }
  return {
    now: NOW, timeZone: ZONE,
    event: { shiftSwapsEnabled: true, shiftSwapsApproval: false },
    me: "vj",
    persons: new Map([["vj", person], ["vp", person]]),
    held: new Map([["vj", [reg("rj", "vj", sb), reg("rj2", "vj", sc)]], ["vp", [reg("rp", "vp", sa)]]]),
    shifts: new Map([sa, sb, sc].map((s) => [s.id, s])),
    requests: [request()],
    reserved: new Map(), limits: new Map(), assignedOnlyRoles: new Set(),
    ...over,
  }
}

describe("buildVolunteerSwapView (#1174)", () => {
  it("shows Jean the open request he can answer, with the mission only and the registrations he can offer", () => {
    const view = buildVolunteerSwapView(input())
    expect(view.offers).toEqual([{ requestId: "q1", shift: { id: "sa", roleName: "Bar", label: "Bar", date: "2030-07-04", startTime: "10:00", endTime: "12:00", locationDetails: null, instructions: null }, deadline: "2030-07-04T08:00:00.000Z", registrationIds: ["rj"] }])
    // Never who published it.
    expect(JSON.stringify(view.offers)).not.toContain("vp")
  })

  it("hides a request he cannot actually answer: other poste, a rule of either plan, a declined offer, his own", () => {
    expect(buildVolunteerSwapView(input({ held: new Map([["vj", [reg("rj2", "vj", sc)]], ["vp", [reg("rp", "vp", sa)]]]) })).offers).toEqual([])
    expect(buildVolunteerSwapView(input({ reserved: new Map([["Bar", ["sécurité"]]]) })).offers).toEqual([])
    expect(buildVolunteerSwapView(input({ requests: [request({ declinedVolunteerIds: ["vj"] })] })).offers).toEqual([])
    expect(buildVolunteerSwapView(input({ me: "vp" })).offers).toEqual([])
    expect(buildVolunteerSwapView(input({ now: new Date("2030-07-04T08:00:00Z") })).offers).toEqual([])
  })

  it("lists what can be published: confirmed, not already in a request, no assigned-only poste, before its deadline", () => {
    const view = buildVolunteerSwapView(input({ me: "vp", held: new Map([["vp", [reg("rp", "vp", sa), reg("rp2", "vp", sb), reg("rw", "vp", sc, "waiting")]]]) }))
    expect(view.publishable.map((p) => p.registrationId)).toEqual(["rp2"])
    expect(buildVolunteerSwapView(input({ me: "vj", assignedOnlyRoles: new Set(["Bar"]) })).publishable.map((p) => p.registrationId)).toEqual(["rj2"])
  })

  it("shows each side « Tu cèdes » and « Tu reçois », the revision and whether an organiser must approve", () => {
    const offered = request({ status: "offered", counterRegistrationId: "rj", counterVolunteerId: "vj", counterShiftId: "sb", revision: 2 })
    const sbApproval = { ...sb, requiresApproval: true }
    const view = buildVolunteerSwapView(input({ requests: [offered], shifts: new Map([sa, sbApproval, sc].map((s) => [s.id, s])) }))
    expect(view.mine).toEqual([expect.objectContaining({ requestId: "q1", side: "counterpart", status: "offered", revision: 2, needsApproval: true, gives: expect.objectContaining({ id: "sb" }), receives: expect.objectContaining({ id: "sa" }) })])
    const pierre = buildVolunteerSwapView(input({ me: "vp", requests: [offered] }))
    expect(pierre.mine[0]).toMatchObject({ side: "requester", gives: { id: "sa" }, receives: { id: "sb" }, needsApproval: false })
  })

  it("says why an ended request did not happen, but not for a person's own withdrawal", () => {
    const ended = buildVolunteerSwapView(input({ me: "vp", requests: [request({ status: "impossible", endReason: "overlap" }), request({ id: "q2", status: "withdrawn", endReason: null })] }))
    expect(ended.mine.map((m) => m.endMessage)).toEqual(["Cet échange crée un conflit d'horaire.", null])
  })

  it("with swaps off: the person's own requests only, nothing to publish or answer", () => {
    const view = buildVolunteerSwapView(input({ event: { shiftSwapsEnabled: false, shiftSwapsApproval: false }, me: "vp" }))
    expect(view).toMatchObject({ enabled: false, publishable: [], offers: [] })
    expect(view.mine).toHaveLength(1)
  })
})

describe("buildVolunteerSwapView across a sector (#1175)", () => {
  const nord = shift("sa", { roleName: "Parking Nord", label: "Parking Nord", sectorId: "sec-p" })
  const sud = shift("sb", { roleName: "Parking Sud", label: "Parking Sud", sectorId: "sec-p", date: new Date("2030-07-05T00:00:00Z") })
  const bar = shift("sc", { roleName: "Bar", label: "Bar", sectorId: "sec-b", date: new Date("2030-07-06T00:00:00Z") })
  const sectorInput = (mine: ViewRegistration[]) => input({
    event: { shiftSwapsEnabled: true, shiftSwapsApproval: false, sectorsAdoptedAt: new Date() },
    held: new Map([["vj", mine], ["vp", [reg("rp", "vp", nord)]]]),
    shifts: new Map([nord, sud, bar].map((s) => [s.id, s])),
  })

  it("offers Pierre's Parking Nord to Jean on Parking Sud, naming the poste, and says the scope", () => {
    const view = buildVolunteerSwapView(sectorInput([reg("rj", "vj", sud)]))
    expect(view.scope).toBe("secteur")
    expect(view.offers).toEqual([expect.objectContaining({ requestId: "q1", shift: expect.objectContaining({ roleName: "Parking Nord" }), registrationIds: ["rj"] })])
  })

  it("never to someone on a poste of another sector", () => {
    expect(buildVolunteerSwapView(sectorInput([reg("rj", "vj", bar)])).offers).toEqual([])
  })

  it("an event without sectors keeps the same-poste scope", () => {
    expect(buildVolunteerSwapView(input()).scope).toBe("poste")
  })
})

describe("duplicatedSwaps (#1174)", () => {
  it("copies the options with the settings only while they can be adopted, never otherwise", () => {
    expect(duplicatedSwaps({ shiftSwapsEnabled: true, shiftSwapsApproval: true, swapsGate: true }, true)).toEqual({ shiftSwapsEnabled: true, shiftSwapsApproval: true })
    expect(duplicatedSwaps({ shiftSwapsEnabled: true, shiftSwapsApproval: true, swapsGate: false }, true)).toEqual({ shiftSwapsEnabled: false, shiftSwapsApproval: true })
    expect(duplicatedSwaps({ shiftSwapsEnabled: true, shiftSwapsApproval: true, newEventSwaps: false }, false)).toEqual({ shiftSwapsEnabled: false, shiftSwapsApproval: false })
    expect(duplicatedSwaps({ newEventSwaps: true }, false)).toEqual({ shiftSwapsEnabled: true, shiftSwapsApproval: false })
  })
})
