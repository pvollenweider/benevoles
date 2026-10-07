import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { docImageFile, docImageFromBytes, docImageTag, pngSize } from "../doc-images"
import { renderEventPageMarkdown } from "../event-page-markdown"
import { loadDocUnits } from "../doc-units"
import { renderDocUnitParts } from "../public-content"

/** A minimal PNG header: signature, then an IHDR chunk of the given size. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12) // IHDR
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

describe("pngSize", () => {
  it("reads the width and height of the IHDR chunk", () => {
    expect(pngSize(pngHeader(1280, 800))).toEqual({ width: 1280, height: 800 })
    expect(pngSize(pngHeader(780, 1688))).toEqual({ width: 780, height: 1688 })
  })

  it("reads a real screenshot of the repo", () => {
    const bytes = fs.readFileSync(path.join(process.cwd(), "public/doc-img/public-timeline-mobile.png"))
    expect(pngSize(bytes)).toEqual({ width: 780, height: 1688 })
  })

  it("refuses anything that isn't a PNG header", () => {
    expect(pngSize(new Uint8Array(0))).toBeNull()
    expect(pngSize(new TextEncoder().encode("GIF89a, not a png at all, long enough"))).toBeNull()
    const noIhdr = pngHeader(10, 10)
    noIhdr.set([0x49, 0x44, 0x41, 0x54], 12) // IDAT first
    expect(pngSize(noIhdr)).toBeNull()
    expect(pngSize(pngHeader(0, 10))).toBeNull()
  })
})

describe("docImageFile", () => {
  it("accepts a screenshot of /doc-img by its plain name", () => {
    expect(docImageFile("/doc-img/admin-dashboard.png")).toBe("admin-dashboard.png")
  })

  it("refuses other folders, traversal, queries and other formats", () => {
    expect(docImageFile("/doc-img/../../package.json")).toBeNull()
    expect(docImageFile("/doc-img/..%2Fsecret.png")).toBeNull()
    expect(docImageFile("/doc-img/sub/x.png")).toBeNull()
    expect(docImageFile("/doc-img/x.png?v=1")).toBeNull()
    expect(docImageFile("/doc-img/x.jpg")).toBeNull()
    expect(docImageFile("https://example.org/doc-img/x.png")).toBeNull()
    expect(docImageFile("/other/x.png")).toBeNull()
  })
})

describe("docImageFromBytes", () => {
  it("gives the size and a content fingerprint that changes with the file", () => {
    const a = docImageFromBytes("/doc-img/a.png", pngHeader(100, 50))
    const b = docImageFromBytes("/doc-img/a.png", pngHeader(100, 51))
    expect(a).toMatchObject({ width: 100, height: 50 })
    expect(a?.src).toMatch(/^\/doc-img\/a\.png\?v=[0-9a-f]{12}$/)
    expect(b?.src).not.toBe(a?.src)
    expect(docImageFromBytes("/doc-img/a.png", pngHeader(100, 50))?.src).toBe(a?.src)
  })

  it("is null for a file that isn't a PNG", () => {
    expect(docImageFromBytes("/doc-img/a.png", new Uint8Array(40))).toBeNull()
  })
})

describe("docImageTag", () => {
  const info = { src: "/doc-img/a.png?v=abc", width: 1280, height: 800 }

  it("draws the first image eagerly, with its size and alt text", () => {
    const html = docImageTag({ src: "/doc-img/a.png", alt: "Le tableau de bord" }, info, 0)
    expect(html).toBe('<img src="/doc-img/a.png?v=abc" alt="Le tableau de bord" width="1280" height="800">')
  })

  it("loads every following image lazily and decodes it asynchronously", () => {
    const html = docImageTag({ src: "/doc-img/a.png", alt: "x" }, info, 1)
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('decoding="async"')
  })

  it("keeps an unknown image as written, still lazy after the first", () => {
    const html = docImageTag({ src: "https://example.org/a.png", alt: "x", title: "Titre" }, null, 2)
    expect(html).toBe('<img src="https://example.org/a.png" alt="x" title="Titre" loading="lazy" decoding="async">')
  })

  it("escapes its attributes", () => {
    const html = docImageTag({ src: "/a.png", alt: 'Un "devis" <b>' }, null, 0)
    expect(html).toContain('alt="Un &quot;devis&quot; &lt;b&gt;"')
  })
})

describe("Markdown images drawn by the caller (renderEventPageMarkdown `image`)", () => {
  it("passes each image with its index and keeps loading/decoding through the sanitizer", () => {
    const seen: number[] = []
    const html = renderEventPageMarkdown("![Un](/doc-img/a.png)\n\n![Deux](/doc-img/b.png \"Titre\")", {
      shiftHeadings: false,
      image: (img, index) => {
        seen.push(index)
        return docImageTag(img, { src: `${img.src}?v=1`, width: 10, height: 20 }, index)
      },
    })
    expect(seen).toEqual([0, 1])
    expect(html).toContain('<img src="/doc-img/a.png?v=1" alt="Un" width="10" height="20">')
    expect(html).toContain('<img src="/doc-img/b.png?v=1" alt="Deux" title="Titre" width="10" height="20" loading="lazy" decoding="async">')
  })

  // The alt text is what a screen reader reads: an ampersand, an escaped Markdown character or an
  // entity in it must reach the page once, never double-escaped (« &amp;amp; » read aloud).
  it("keeps special characters of the alt text escaped exactly once", () => {
    const html = renderEventPageMarkdown("![A & B \\*x\\* &amp; « C »](/doc-img/a.png)", {
      shiftHeadings: false,
      image: (img, index) => docImageTag(img, null, index),
    })
    const alt = /alt="([^"]*)"/.exec(html)?.[1]
    expect(alt).toBe("A &amp; B *x* &amp; « C »")
    expect(html).not.toContain("&amp;amp;")
  })

  it("leaves admin-authored event pages with marked's own image and no loading attribute", () => {
    const html = renderEventPageMarkdown('![x](/a.png)<img src="/b.png" loading="lazy">')
    expect(html).not.toContain("loading=")
  })
})

describe("documentation units (#759 F2)", () => {
  it("render every /doc-img screenshot with its size, a fingerprint, and lazy loading after the first", () => {
    const units = loadDocUnits().filter((u) => u.body.includes("](/doc-img/"))
    expect(units.length).toBeGreaterThan(0)
    for (const unit of units) {
      const html = renderDocUnitParts(unit).map((p) => (p.kind === "html" ? p.html : "")).join("")
      const imgs = [...html.matchAll(/<img [^>]*>/g)].map((m) => m[0]).filter((t) => t.includes("/doc-img/"))
      expect(imgs.length, unit.slug).toBeGreaterThan(0)
      for (const tag of imgs) {
        expect(tag, unit.slug).toMatch(/src="\/doc-img\/[^"?]+\.png\?v=[0-9a-f]{12}"/)
        expect(tag, unit.slug).toMatch(/ width="\d+" height="\d+"/)
        expect(tag, unit.slug).toMatch(/ alt="[^"]+"/)
      }
      imgs.slice(1).forEach((tag) => expect(tag, unit.slug).toContain('loading="lazy"'))
    }
  })
})
