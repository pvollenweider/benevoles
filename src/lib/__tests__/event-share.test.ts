import { describe, it, expect } from "vitest"
import { eventDateRange, eventPageMetadata, eventShareDescription, previewText, PREVIEW_DESCRIPTION_MAX, type EventForMetadata } from "../event-share"

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
    expect(m.description).toBe("Amicale de Bex cherche des bénévoles pour Fête du village, du 6 au 8 juin 2031.")
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

describe("eventShareDescription", () => {
  it("uses the event's own description when it has one", () => {
    expect(eventShareDescription({ ...base, description: "  Trois jours de fête.\n\nOn compte sur vous !  " })).toBe("Trois jours de fête. On compte sur vous !")
  })

  it("falls back when the description is only blanks or Markdown markers", () => {
    expect(eventShareDescription({ ...base, description: " \n ## \n" })).toMatch(/^Amicale de Bex cherche des bénévoles/)
  })

  it("does not mention the remaining places (stale in caches)", () => {
    expect(eventShareDescription(base)).not.toMatch(/place/)
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
