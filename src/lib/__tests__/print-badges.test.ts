import { describe, it, expect } from "vitest"
import { badgeOptionsFrom, badgesOf, DEFAULT_BADGE_OPTIONS, emptyMessage, PALETTE_HEX, renderBadges, reprintOptions, type BadgeData } from "../print-badges"
import { COLOR_OPTIONS } from "../roles"

const alice = { id: "v-alice", firstName: "Alice", lastName: "Martin", email: "a@x.ch", phone: null }
const bob = { id: "v-bob", firstName: "Bob", lastName: "Durand", email: "b@x.ch", phone: null }
const data: BadgeData = {
  eventTitle: "Fête",
  organizationName: "Org",
  accentColorKey: "teal",
  shifts: [
    { id: "s1", roleName: "Bar", label: "Bar soir", date: "2026-07-04", startTime: "18:00", endTime: "23:00", capacity: 3, colorKey: "amber", registrations: [alice, bob] },
    { id: "s2", roleName: "Accueil", label: "Accueil", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 2, colorKey: null, registrations: [alice] },
  ],
}

// Printable badges (#190, V1).
describe("badgesOf", () => {
  it("makes one badge per volunteer with their roles and shifts in order, coloured by the role, else the event", () => {
    const badges = badgesOf(data)
    expect(badges.map((b) => b.firstName)).toEqual(["Bob", "Alice"])
    const a = badges[1]
    expect(a.roles).toEqual(["Accueil", "Bar"])
    expect(a.shifts).toEqual(["sam. 4 juil. 10:00–12:00", "sam. 4 juil. 18:00–23:00 · Bar soir"])
    expect(a.color).toBe(PALETTE_HEX.amber)
    expect(badgesOf({ ...data, shifts: [data.shifts[1]] })[0].color).toBe(PALETTE_HEX.teal)
    expect(badgesOf({ ...data, accentColorKey: null, shifts: [data.shifts[1]] })[0].color).toBeNull()
  })

  it("filters by role and by name, and applies the colour option", () => {
    const bar = badgesOf(data, { ...DEFAULT_BADGE_OPTIONS, role: "Bar" })
    expect(bar.map((b) => b.firstName)).toEqual(["Bob", "Alice"])
    expect(bar[1].roles).toEqual(["Bar"])
    expect(badgesOf(data, { ...DEFAULT_BADGE_OPTIONS, role: "Accueil" }).map((b) => b.firstName)).toEqual(["Alice"])
    expect(badgesOf(data, { ...DEFAULT_BADGE_OPTIONS, volunteer: "v-alice" }).map((b) => b.firstName)).toEqual(["Alice"])
    expect(badgesOf(data, { ...DEFAULT_BADGE_OPTIONS, color: "event" })[0].color).toBe(PALETTE_HEX.teal)
    expect(badgesOf(data, { ...DEFAULT_BADGE_OPTIONS, color: "none" })[0].color).toBeNull()
  })

  it("has a print colour for every palette key", () => {
    for (const o of COLOR_OPTIONS) expect(PALETTE_HEX[o.key]).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe("badgeOptionsFrom", () => {
  it("reads the query, defaulting to everything shown and the role colour", () => {
    expect(badgeOptionsFrom(new URLSearchParams(""))).toEqual(DEFAULT_BADGE_OPTIONS)
    expect(badgeOptionsFrom(new URLSearchParams("role=Bar&lastName=0&shifts=0&color=none&volunteer=+v-alice+"))).toEqual({ role: "Bar", volunteer: "v-alice", lastName: false, shifts: false, color: "none" })
    expect(badgeOptionsFrom(new URLSearchParams("color=rainbow")).color).toBe("role")
    // From the form: a ticked box sends "1", an unticked one nothing.
    expect(badgeOptionsFrom(new URLSearchParams("role=&color=role&lastName=1"))).toMatchObject({ lastName: true, shifts: false })
    expect(badgeOptionsFrom(new URLSearchParams("role=&color=role"))).toMatchObject({ lastName: false, shifts: false })
  })
})

describe("renderBadges", () => {
  it("prints one article per badge, escaped, with the options applied", () => {
    const html = renderBadges({ ...data, eventTitle: "Fête <2026>" }, { ...DEFAULT_BADGE_OPTIONS, lastName: false })
    expect(html).toContain("<title>Badges – Fête &lt;2026&gt;</title>")
    expect(html.match(/<li class="badge">/g)).toHaveLength(2)
    expect(html).toContain(`<span class="first">Alice</span>`)
    expect(html).not.toContain(`<span class="last">Martin</span>`)
    // The event line is readable (not aria-hidden): it survives in a saved PDF.
    expect(html).toContain(`<p class="org">Org · Fête &lt;2026&gt;</p>`)
    expect(html).not.toContain("aria-hidden")
    expect(html).toContain(`style="background:${PALETTE_HEX.amber};color:#fff"`)
    expect(html).toContain("2 badges")
  })

  it("says when nobody matches, naming the post and the person", () => {
    expect(renderBadges(data, { ...DEFAULT_BADGE_OPTIONS, role: "Sécurité" })).toContain("Aucun bénévole inscrit pour le poste « Sécurité ».")
    expect(renderBadges(data, { ...DEFAULT_BADGE_OPTIONS, volunteer: "v-gone" })).toContain("Ce bénévole n'a plus d'inscription active sur cet événement.")
    // Bob is on Bar only: choosing him with the Accueil post names both and says what to do.
    const html = renderBadges(data, { ...DEFAULT_BADGE_OPTIONS, volunteer: "v-bob", role: "Accueil" })
    expect(html).toContain("Bob Durand n'est inscrit·e sur aucun créneau du poste « Accueil ». Choisissez « Tous les postes » pour imprimer son badge.")
    expect(html).toContain("poste « Accueil », Bob Durand")
    expect(emptyMessage({ ...DEFAULT_BADGE_OPTIONS, role: "Bar" }, null)).toBe("Aucun bénévole inscrit pour le poste « Bar ».")
  })

  it("splits the badges into sheets of ten, each its own list", () => {
    const many: BadgeData = { ...data, shifts: [{ ...data.shifts[0], registrations: Array.from({ length: 23 }, (_, i) => ({ firstName: `P${i}`, lastName: `N${i}`, email: `${i}@x.ch`, phone: null })) }] }
    const html = renderBadges(many)
    expect(html.match(/<ul class="sheet" role="list"/g)).toHaveLength(3)
    expect(html).toContain('aria-label="Feuille 3 sur 3"')
    expect(html.match(/<li class="badge">/g)).toHaveLength(23)
  })
})

// Two volunteers with the same name and no email are two people (audit #190/#400).
describe("homonyms", () => {
  const lea1 = { id: "v1", firstName: "Léa", lastName: "Roy", email: null, phone: null }
  const lea2 = { id: "v2", firstName: "Léa", lastName: "Roy", email: null, phone: null }
  const twins: BadgeData = { ...data, shifts: [
    { ...data.shifts[0], id: "s1", registrations: [lea1] },
    { ...data.shifts[1], id: "s2", registrations: [lea2] },
  ] }

  it("prints one badge each, with their own shifts", () => {
    const badges = badgesOf(twins)
    expect(badges).toHaveLength(2)
    expect(badges.map((b) => b.roles).sort()).toEqual([["Accueil"], ["Bar"]])
    expect(badgesOf(twins, { ...DEFAULT_BADGE_OPTIONS, volunteer: "v2" })[0].roles).toEqual(["Accueil"])
  })

  it("tells them apart in the reprint list", () => {
    expect(reprintOptions([{ ...lea1, post: "Bar" }, { ...lea2, post: "Accueil" }, { ...lea1, post: "Bar" }, { id: "v3", firstName: "Bob", lastName: "Durand", email: "b@x.ch" }])).toEqual([
      { id: "v3", label: "Bob Durand" },
      { id: "v2", label: "Léa Roy (sans email, Accueil)" },
      { id: "v1", label: "Léa Roy (sans email, Bar)" },
    ])
    // Same name, no email, same post: a number, so no two options read the same.
    const labels = reprintOptions([{ ...lea1, post: "Bar" }, { ...lea2, post: "Bar" }]).map((o) => o.label)
    expect(labels).toEqual(["Léa Roy (sans email, Bar) n° 1", "Léa Roy (sans email, Bar) n° 2"])
  })
})
