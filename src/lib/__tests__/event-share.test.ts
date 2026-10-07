import { describe, it, expect } from "vitest"
import { eventDateRange, eventInfoPageMetadata, eventPageMetadata, eventShareDescription, META_DESCRIPTION_MAX, orgHomeMetadata, previewText, PREVIEW_DESCRIPTION_MAX, type EventForMetadata } from "../event-share"

// Link preview of a shared event (#564).
const links = { canonicalUrl: "https://fete.benevol.app/fete-2031", imageUrl: "https://www.benevol.app/og-image.png" }
const base: EventForMetadata = {
  title: "Fête du village",
  description: null,
  startDate: new Date("2031-06-06T00:00:00Z"),
  endDate: new Date("2031-06-08T00:00:00Z"),
  publicStatus: "published",
  isListed: true,
  organizationName: "Amicale de Bex",
}
const NOINDEX = { index: false, follow: false }

describe("eventPageMetadata", () => {
  // Day-of contact (#560): even handed a full event row, the preview never carries it.
  it("never puts the day-of contact in the metadata", () => {
    const row = { ...base, description: "Fête au village", dayContactName: "Coordination Marc", dayContactPhone: "079 111 11 11" } as EventForMetadata
    for (const isListed of [true, false]) {
      const json = JSON.stringify(eventPageMetadata({ ...row, isListed }, links))
      expect(json).not.toContain("079 111 11 11")
      expect(json).not.toContain("Coordination Marc")
    }
  })

  it("a published listed event: full preview, canonical, indexable", () => {
    const m = eventPageMetadata(base, links)
    expect(m.title).toBe("Fête du village")
    expect(m.description).toBe("Amicale de Bex cherche des bénévoles pour Fête du village, du 6 au 8 juin 2031. Choisissez vos créneaux et inscrivez-vous en ligne, sans créer de compte.")
    expect(m.alternates).toEqual({ canonical: links.canonicalUrl })
    expect(m.openGraph).toMatchObject({ type: "website", siteName: "Amicale de Bex", url: links.canonicalUrl, title: "Fête du village", description: m.description })
    expect(m.openGraph?.images).toEqual([expect.objectContaining({ url: links.imageUrl, width: 1200, height: 630 })])
    expect(m.twitter).toMatchObject({ card: "summary_large_image", title: "Fête du village", description: m.description })
    expect(m.robots).toBeUndefined()
  })

  it("an unlisted event: the same preview, but noindex", () => {
    const m = eventPageMetadata({ ...base, isListed: false }, links)
    expect(m.robots).toEqual(NOINDEX)
    expect(m.openGraph).toMatchObject({ title: "Fête du village", url: links.canonicalUrl })
    expect(m.alternates).toEqual({ canonical: links.canonicalUrl })
  })

  it("a draft or an archived event: noindex and nothing else, not even the title", () => {
    for (const publicStatus of ["draft", "archived"]) {
      for (const isListed of [true, false]) {
        expect(eventPageMetadata({ ...base, description: "Secret", publicStatus, isListed }, links)).toEqual({ robots: NOINDEX })
      }
    }
  })

  it("a deleted (unknown) event: nothing", () => {
    expect(eventPageMetadata(null, links)).toEqual({})
  })

  it("never puts a personal token anywhere: only the given public URLs appear", () => {
    const m = eventPageMetadata({ ...base, isListed: false, description: "Venez nombreux !" }, links)
    const urls = JSON.stringify(m).match(/https?:\/\/[^"\s]+/g) ?? []
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) expect([links.canonicalUrl, links.imageUrl]).toContain(u)
    expect(JSON.stringify(m)).not.toMatch(/token|\/my\/|\/leader\//i)
  })
})

describe("eventShareDescription (meta description and link preview, #773)", () => {
  const within = (s: string) => expect(s.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX)

  it("without a description: organisation, event, dates and how to sign up, within 160 characters", () => {
    const out = eventShareDescription(base)
    expect(out).toBe("Amicale de Bex cherche des bénévoles pour Fête du village, du 6 au 8 juin 2031. Choisissez vos créneaux et inscrivez-vous en ligne, sans créer de compte.")
    within(out)
    expect(out.length).toBeGreaterThanOrEqual(140)
  })

  it("with a short description: the description, then the dates", () => {
    expect(eventShareDescription({ ...base, description: "  Trois jours de fête.\n\nOn compte sur vous !  " })).toBe("Trois jours de fête. On compte sur vous ! Bénévoles recherchés du 6 au 8 juin 2031.")
    expect(eventShareDescription({ ...base, description: "Trois jours de fête" })).toBe("Trois jours de fête. Bénévoles recherchés du 6 au 8 juin 2031.")
  })

  it("with a long description: the description alone, cut on a word boundary", () => {
    const out = eventShareDescription({ ...base, description: "Le **grand** rendez-vous de l'été. ".repeat(10) })
    within(out)
    expect(out).toMatch(/^Le grand rendez-vous de l'été\. Le grand/)
    expect(out.endsWith("…")).toBe(true)
    expect(out).not.toMatch(/\*\*|Bénévoles recherchés/)
  })

  it("drops the sign-up sentence, then cuts, when the title is long", () => {
    const longer = eventShareDescription({ ...base, title: "Grande fête populaire du village et de ses environs" })
    expect(longer).toBe("Amicale de Bex cherche des bénévoles pour Grande fête populaire du village et de ses environs, du 6 au 8 juin 2031.")
    const huge = eventShareDescription({ ...base, title: "Festival ".repeat(30).trim() })
    within(huge)
    expect(huge).toMatch(/^Amicale de Bex cherche des bénévoles pour Festival/)
    expect(huge.endsWith("…")).toBe(true)
  })

  it("falls back when the description is only blanks, Markdown markers or HTML tags", () => {
    for (const description of [" \n ## \n", "<p></p>"]) {
      expect(eventShareDescription({ ...base, description })).toMatch(/^Amicale de Bex cherche des bénévoles/)
    }
  })

  it("is plain text: no Markdown, no HTML, no line break", () => {
    const out = eventShareDescription({ ...base, description: "# Fête\n\n<b>Venez</b> [nous aider](https://x.ch) !" })
    expect(out).toBe("Fête Venez nous aider ! Bénévoles recherchés du 6 au 8 juin 2031.")
  })

  it("does not mention the remaining places (stale in caches)", () => {
    expect(eventShareDescription(base)).not.toMatch(/place/)
  })
})

describe("eventInfoPageMetadata", () => {
  const page = { title: "Infos pratiques", content: "## Accès\n\nParking à la **salle communale**." }

  it("a published event's page: its title and its own text as description", () => {
    expect(eventInfoPageMetadata(base, page)).toEqual({ title: "Infos pratiques · Fête du village", description: "Accès Parking à la salle communale." })
  })

  it("an empty page falls back to the event's description", () => {
    expect(eventInfoPageMetadata(base, { ...page, content: " " }).description).toBe(eventShareDescription(base))
  })

  it("a long page is cut within 160 characters", () => {
    const d = eventInfoPageMetadata(base, { ...page, content: "Bienvenue à tous. ".repeat(20) }).description as string
    expect(d.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX)
  })

  it("an unlisted event's page: described but noindex", () => {
    expect(eventInfoPageMetadata({ ...base, isListed: false }, page)).toMatchObject({ title: "Infos pratiques · Fête du village", robots: NOINDEX })
  })

  it("a draft or archived event, or an unknown page: noindex or nothing, never the content", () => {
    for (const publicStatus of ["draft", "archived"]) {
      expect(eventInfoPageMetadata({ ...base, publicStatus }, page)).toEqual({ robots: NOINDEX })
    }
    expect(eventInfoPageMetadata(base, null)).toEqual({})
    expect(eventInfoPageMetadata(null, page)).toEqual({})
  })
})

describe("previewText", () => {
  it("strips Markdown and collapses whitespace", () => {
    expect(previewText("# Titre\n\n**Gras** et *italique*, un [lien](https://x.ch) et `code`.\n- un\n- deux\n> cité")).toBe("Titre Gras et italique, un lien et code. un deux cité")
  })

  it("cuts long text on a word boundary with an ellipsis", () => {
    const long = "mot ".repeat(100)
    const out = previewText(long)
    expect(out.length).toBeLessThanOrEqual(PREVIEW_DESCRIPTION_MAX)
    expect(out.endsWith("mot…")).toBe(true)
  })

  it("is empty for nothing", () => {
    expect(previewText(null)).toBe("")
    expect(previewText("   ")).toBe("")
  })
})

describe("eventDateRange", () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`)
  it("words one day, a month, two months and two years", () => {
    expect(eventDateRange(d("2031-06-06"), d("2031-06-06"))).toBe("le 6 juin 2031")
    expect(eventDateRange(d("2031-06-06"), d("2031-06-08"))).toBe("du 6 au 8 juin 2031")
    expect(eventDateRange(d("2031-05-30"), d("2031-06-02"))).toBe("du 30 mai au 2 juin 2031")
    expect(eventDateRange(d("2031-12-30"), d("2032-01-02"))).toBe("du 30 décembre 2031 au 2 janvier 2032")
    expect(eventDateRange(d("2031-07-01"), d("2031-07-11"))).toBe("du 1er au 11 juillet 2031")
  })

  it("keeps the calendar day as entered, whatever the server's zone", () => {
    // Stored at midnight UTC: formatting in a zone west of UTC would give 31 décembre.
    expect(eventDateRange(d("2032-01-01"), d("2032-01-01"))).toBe("le 1er janvier 2032")
  })
})

describe("the locale of a shared event", () => {
  it("is French as written in Switzerland, like the rest of the site", () => {
    const m = eventPageMetadata(
      { title: "Fête", description: null, startDate: new Date("2031-06-06T00:00:00Z"), endDate: new Date("2031-06-06T00:00:00Z"), organizationName: "Asso", publicStatus: "published", isListed: true },
      { canonicalUrl: "https://asso.benevol.app/fete", imageUrl: "https://www.benevol.app/og-image.png" },
    )
    expect(m.openGraph).toMatchObject({ locale: "fr_CH" })
  })
})

describe("orgHomeMetadata", () => {
  it("gives an organisation's page its canonical on its host and a link preview with the platform's card", () => {
    const links = { canonicalUrl: "https://lausanne-rocks.benevol.app/", imageUrl: "https://www.benevol.app/og-image.png" }
    const m = orgHomeMetadata({ name: "Lausanne Rocks", title: "Bénévoles du festival" }, links)
    const description = "Lausanne Rocks cherche des bénévoles : choisissez vos créneaux et inscrivez-vous en ligne, sans créer de compte."
    expect(m).toMatchObject({
      title: "Bénévoles du festival",
      description,
      alternates: { canonical: links.canonicalUrl },
      openGraph: { type: "website", siteName: "Lausanne Rocks", locale: "fr_CH", url: links.canonicalUrl, images: [expect.objectContaining({ url: links.imageUrl, width: 1200, height: 630 })] },
      twitter: { card: "summary_large_image", description },
    })
    expect(m).not.toHaveProperty("robots")
  })
})
