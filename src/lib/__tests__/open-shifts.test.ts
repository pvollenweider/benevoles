import { describe, it, expect } from "vitest"
import {
  availabilityFit, candidateReasons, exclusionSentence, findCandidates, openShiftLine, openShiftsHistory, overlapMinutes,
  selectedRecipients, shiftPeriods, type EventShiftRef, type OpenShift, type PoolMember,
} from "../open-shifts"
import { shiftsOverlap } from "../utils"
import { render } from "../notifications/templates"

const ref = (id: string, date: string, startTime: string, endTime: string, roleName = "Bar"): EventShiftRef => ({ id, roleName, label: roleName, date, startTime, endTime })
const open = (s: EventShiftRef, placesLeft = 2, reservedTags: string[] = []): OpenShift => ({ ...s, placesLeft, reservedTags })
const member = (id: string, over: Partial<PoolMember> = {}): PoolMember => ({
  id, firstName: id.charAt(0).toUpperCase() + id.slice(1), lastName: over.lastName ?? id.toUpperCase(), hasEmail: true, active: true, tags: [], ...over,
})

describe("overlapMinutes", () => {
  it("counts the minutes in common, zero for back-to-back shifts", () => {
    expect(overlapMinutes(ref("a", "2026-07-04", "10:00", "12:00"), ref("b", "2026-07-04", "11:45", "14:00"))).toBe(15)
    expect(overlapMinutes(ref("a", "2026-07-04", "10:00", "12:00"), ref("b", "2026-07-04", "12:00", "14:00"))).toBe(0)
  })

  it("follows night shifts into the next day, and the night before", () => {
    const night = ref("n", "2026-07-04", "22:00", "02:00")
    expect(overlapMinutes(night, ref("m", "2026-07-05", "01:30", "04:00"))).toBe(30)
    expect(overlapMinutes(night, ref("e", "2026-07-04", "20:00", "22:15"))).toBe(15)
    expect(overlapMinutes(night, ref("x", "2026-07-04", "01:00", "03:00"))).toBe(0)
  })

  it("reads wall-clock hours on daylight saving nights (October and March), like shiftsOverlap", () => {
    const pairs: [EventShiftRef, EventShiftRef, number][] = [
      [ref("a", "2026-10-24", "23:00", "03:00"), ref("b", "2026-10-25", "02:00", "05:00"), 60],
      [ref("a", "2026-03-28", "23:00", "03:00"), ref("b", "2026-03-29", "02:30", "06:00"), 30],
      [ref("a", "2026-03-29", "01:00", "02:00"), ref("b", "2026-03-29", "02:00", "04:00"), 0],
    ]
    for (const [a, b, minutes] of pairs) {
      expect(overlapMinutes(a, b)).toBe(minutes)
      expect(shiftsOverlap(a, b)).toBe(minutes > 0)
    }
  })

  it("accepts Shift.date as a Date (UTC midnight)", () => {
    expect(overlapMinutes({ date: new Date("2026-07-04T00:00:00Z"), startTime: "22:00", endTime: "02:00" }, ref("m", "2026-07-05", "00:00", "01:00"))).toBe(60)
  })
})

describe("general availability (#402), indicative", () => {
  it("maps a shift to the periods of the day it touches, the night with the evening", () => {
    expect(shiftPeriods({ startTime: "09:00", endTime: "12:00" })).toEqual(["morning"])
    expect(shiftPeriods({ startTime: "11:00", endTime: "14:00" })).toEqual(["morning", "afternoon"])
    expect(shiftPeriods({ startTime: "22:00", endTime: "02:00" })).toEqual(["evening"])
    expect(shiftPeriods({ startTime: "04:00", endTime: "07:00" })).toEqual(["morning", "evening"])
    expect(shiftPeriods({ startTime: "17:00", endTime: "08:00" })).toEqual(["morning", "afternoon", "evening"])
  })

  it("matches, partly matches, misses, or says nothing when no period is set", () => {
    expect(availabilityFit({ availabilityPeriods: ["evening"] }, { startTime: "22:00", endTime: "02:00" })).toBe("match")
    expect(availabilityFit({ availabilityPeriods: ["morning"] }, { startTime: "11:00", endTime: "14:00" })).toBe("partial")
    expect(availabilityFit({ availabilityPeriods: ["morning"] }, { startTime: "19:00", endTime: "21:00" })).toBe("no_match")
    expect(availabilityFit({ availabilityPeriods: [] }, { startTime: "19:00", endTime: "21:00" })).toBe("unknown")
    expect(availabilityFit({}, { startTime: "19:00", endTime: "21:00" })).toBe("unknown")
  })
})

describe("findCandidates", () => {
  const bar = ref("bar", "2026-07-04", "22:00", "02:00")
  const acc = ref("acc", "2026-07-05", "10:00", "12:00", "Accueil")
  const early = ref("early", "2026-07-04", "18:00", "22:15")
  const sec = ref("sec", "2026-07-05", "14:00", "16:00", "Sécurité")
  const eventShifts = [bar, acc, early, sec]
  const members = [
    member("zoe", { lastName: "Zed" }),
    member("ana", { lastName: "Abel", tags: ["Bar"], availabilityPeriods: ["evening"] }),
    member("ina", { lastName: "Inactive", active: false }),
    member("noe", { lastName: "Nomail", hasEmail: false }),
    member("dec", { lastName: "Declined" }),
    member("reg", { lastName: "Registered" }),
    member("ovl", { lastName: "Overlap" }),
    member("sel", { lastName: "Secu", tags: ["sécurité"] }),
  ]
  const registrations = [
    { volunteerId: "reg", shiftId: "bar", status: "active" },
    { volunteerId: "ovl", shiftId: "early", status: "active" },
    { volunteerId: "zoe", shiftId: "acc", status: "requested" },
  ]
  const invites = [{ volunteerId: "dec", declined: true }, { volunteerId: "ana", declined: false }]
  const base = { eventShifts, members, registrations, invites }

  it("lists members by name only, with nothing ranked, and leaves out inactive, email-less and declined members with a count", () => {
    const { candidates, excluded } = findCandidates({ ...base, shifts: [open(bar)] })
    expect(candidates.map((c) => c.member.id)).toEqual(["ana", "ovl", "sel", "zoe"])
    expect(excluded).toEqual({ inactive: 1, noEmail: 1, declined: 1, alreadyOnShifts: 1, reserved: 0 })
    expect(exclusionSentence(excluded)).toBe("Non proposés : 1 membre inactif, 1 membre sans email, 1 membre qui a répondu « pas disponible », 1 membre déjà inscrit sur ces créneaux.")
  })

  it("shows declined members only when asked, marked as such", () => {
    const { candidates, excluded } = findCandidates({ ...base, shifts: [open(bar)], includeDeclined: true })
    const dec = candidates.find((c) => c.member.id === "dec")!
    expect(dec.invite).toBe("declined")
    expect(excluded.declined).toBe(0)
    expect(candidateReasons(dec, [open(bar)])).toContain("A répondu « pas disponible » à son invitation")
  })

  it("shows a member whose shift overlaps by a few minutes, marked, with nothing to offer them", () => {
    const { candidates } = findCandidates({ ...base, shifts: [open(bar)] })
    const ovl = candidates.find((c) => c.member.id === "ovl")!
    expect(ovl.selectable).toBe(false)
    expect(ovl.offer).toEqual([])
    expect(ovl.fits[0]).toMatchObject({ status: "overlap", overlap: { minutes: 15, shift: { id: "early" } } })
    expect(candidateReasons(ovl, [open(bar)]).join("\n")).toMatch(/Chevauchement : son inscription Bar .* a 15 min en commun avec ce créneau, qui ne lui sera pas proposé/)
  })

  it("still offers the other selected shifts to a member with an overlap", () => {
    const { candidates } = findCandidates({ ...base, shifts: [open(bar), open(acc)] })
    const ovl = candidates.find((c) => c.member.id === "ovl")!
    expect(ovl.selectable).toBe(true)
    expect(ovl.offer).toEqual(["acc"])
    // Already on « acc » (a request holds the spot): only « bar » is offered to Zoé.
    expect(candidates.find((c) => c.member.id === "zoe")!.offer).toEqual(["bar"])
  })

  it("offers a reserved role only to members with its tag, and leaves out who has nothing else", () => {
    const { candidates, excluded } = findCandidates({ ...base, shifts: [open(sec, 1, ["Sécurité"])] })
    expect(candidates.filter((c) => c.selectable).map((c) => c.member.id)).toEqual(["sel"])
    expect(excluded.reserved).toBe(4)
    // A reserved role is bookable only through an invitation (#470).
    expect(candidates.find((c) => c.member.id === "sel")!.link).toBe("new_invitation")
  })

  it("filters on a tag, case-insensitively, before counting who was left out", () => {
    const { candidates, excluded } = findCandidates({ ...base, shifts: [open(bar)], tag: "bar" })
    expect(candidates.map((c) => c.member.id)).toEqual(["ana"])
    expect(excluded).toEqual({ inactive: 0, noEmail: 0, declined: 0, alreadyOnShifts: 0, reserved: 0 })
  })

  it("picks the link: their invitation, a new one, or the event page for members already registered", () => {
    const { candidates } = findCandidates({ ...base, shifts: [open(bar), open(acc)] })
    const link = Object.fromEntries(candidates.map((c) => [c.member.id, c.link]))
    expect(link).toMatchObject({ ana: "invitation", sel: "new_invitation", zoe: "event", ovl: "event" })
  })

  it("says why each member is listed, from existing data, availability labelled indicative", () => {
    const { candidates } = findCandidates({ ...base, shifts: [open(bar)] })
    const ana = candidates.find((c) => c.member.id === "ana")!
    expect(candidateReasons(ana, [open(bar)])).toEqual([
      "Tags : Bar",
      "Disponibilité générale (indicative) : Soir, compatible avec l'horaire de ce créneau",
      "Déjà invité à cet événement",
    ])
    const two = findCandidates({ ...base, shifts: [open(bar), open(acc)] }).candidates
    expect(candidateReasons(two.find((c) => c.member.id === "ana")!, [open(bar), open(acc)])).toContain("Disponibilité générale (indicative) : Soir, compatible avec l'horaire de 1 des 2 créneaux choisis")
    const noted = findCandidates({ ...base, members: [member("max", { availabilityPeriods: ["morning", "evening"], availabilityNote: "pas le dimanche" })], shifts: [open(bar)] }).candidates[0]
    expect(candidateReasons(noted, [open(bar)])[0]).toBe("Disponibilité générale (indicative) : Matin, soir, « pas le dimanche », compatible avec l'horaire de ce créneau")
    const zoe = two.find((c) => c.member.id === "zoe")!
    expect(candidateReasons(zoe, [open(bar), open(acc)])).toEqual(["Déjà inscrit à cet événement (1 créneau)", "Déjà sur Accueil, dim. 5 juil. : pas proposé à nouveau"])
  })

  it("never keeps a selected member who can't be written to, nor an unknown id", () => {
    const { candidates } = findCandidates({ ...base, shifts: [open(bar)] })
    expect(selectedRecipients(candidates, ["ana", "ovl", "ina", "someone-else"]).map((c) => c.member.id)).toEqual(["ana"])
  })
})

describe("email and history", () => {
  const shifts = [open(ref("bar", "2026-07-04", "22:00", "02:00"), 2), open({ ...ref("acc", "2026-07-05", "10:00", "12:00", "Accueil"), label: "Accueil public" }, 1)]

  it("writes each open shift with its date, hours and places left", () => {
    expect(openShiftLine(shifts[0])).toBe("Bar : samedi 4 juillet, de 22:00 à 02:00 le lendemain, 2 places libres")
    expect(openShiftLine(shifts[1])).toBe("Accueil (Accueil public) : dimanche 5 juillet, de 10:00 à 12:00, 1 place libre")
  })

  it("renders one email listing the selected shifts, with the sign-up and decline links, in « tu »", () => {
    const { subject, text, html } = render({
      kind: "open_shifts",
      recipient: { email: "ana@x.ch", name: "Ana" },
      data: { volunteerName: "Ana", organizationName: "Asso", eventTitle: "Fête", note: "Merci !", shifts, signupUrl: "https://x/fete?t=1", declineUrl: "https://x/fete?t=1&decline=1" },
    })
    expect(subject).toBe("Fête : on cherche encore du monde")
    expect(text).toContain("- Bar : samedi 4 juillet, de 22:00 à 02:00 le lendemain, 2 places libres")
    expect(text).toContain("- Accueil (Accueil public) : dimanche 5 juillet, de 10:00 à 12:00, 1 place libre")
    expect(text).toContain("T'inscrire : https://x/fete?t=1")
    expect(text).toContain("Pas disponible cette fois ? Tu peux le dire ici : https://x/fete?t=1&decline=1")
    expect(text).toContain("Merci !")
    expect(html).toContain("Choisir mon créneau")
    for (const s of [subject, text]) expect(s).not.toMatch(/[·—]/)
  })

  it("adds the personal page for members registered without an invitation, and no decline link", () => {
    const { text } = render({
      kind: "open_shifts",
      recipient: { email: "zoe@x.ch", name: "Zoé" },
      data: { volunteerName: "Zoé", organizationName: "Asso", eventTitle: "Fête", shifts: [shifts[0]], signupUrl: "https://x/fete", editToken: "tok-z" },
    })
    expect(text).toContain("Le créneau à compléter :")
    expect(text).toMatch(/Tes inscriptions : .*\/my\/tok-z/)
    expect(text).not.toContain("Pas disponible")
  })

  it("records the send in the history like a targeted message (#467)", () => {
    expect(openShiftsHistory(shifts, "  Venez nombreux  ")).toEqual({
      subject: "On cherche encore du monde",
      message: "Venez nombreux\n\nCréneaux proposés :\n- Bar : samedi 4 juillet, de 22:00 à 02:00 le lendemain, 2 places libres\n- Accueil (Accueil public) : dimanche 5 juillet, de 10:00 à 12:00, 1 place libre",
      audienceLabel: "les membres choisis pour 2 créneaux à compléter",
    })
    expect(openShiftsHistory([shifts[0]]).audienceLabel).toBe("les membres choisis pour 1 créneau à compléter")
    expect(openShiftsHistory([shifts[0]]).message.startsWith("Créneaux proposés :")).toBe(true)
  })
})
