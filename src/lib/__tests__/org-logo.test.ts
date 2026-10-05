import { describe, expect, it } from "vitest"
import {
  checkLogoUpload,
  emailLogoHtml,
  etagMatches,
  fitLogo,
  logoCacheControl,
  logoFileProblem,
  logoVersion,
  looksLikeSvg,
  LOGO_ERRORS,
  LOGO_MAX_UPLOAD_BYTES,
  orgLogoAlt,
  orgLogoOf,
  orgLogoPath,
  printLogoHtml,
  sniffLogoType,
} from "../org-logo"

const bytes = (...b: number[]) => new Uint8Array(b)
const text = (s: string) => new TextEncoder().encode(s)
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13)
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16)
const HASH = "a".repeat(16) + "b".repeat(48)

describe("sniffLogoType (#300): the real type from the first bytes", () => {
  it("recognizes PNG and JPEG by their magic numbers", () => {
    expect(sniffLogoType(PNG)).toBe("image/png")
    expect(sniffLogoType(JPEG)).toBe("image/jpeg")
  })

  it("rejects everything else, whatever the name or declared type would say", () => {
    expect(sniffLogoType(text("GIF89a...."))).toBeNull()
    expect(sniffLogoType(text("RIFF\0\0\0\0WEBPVP8 "))).toBeNull()
    expect(sniffLogoType(text("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull()
    expect(sniffLogoType(bytes(0x89, 0x50, 0x4e))).toBeNull() // truncated signature
    expect(sniffLogoType(bytes(0xff, 0xd8))).toBeNull()
    expect(sniffLogoType(new Uint8Array())).toBeNull()
  })
})

describe("looksLikeSvg", () => {
  it("spots SVG and XML, with or without BOM and leading spaces", () => {
    expect(looksLikeSvg(text("<svg viewBox='0 0 1 1'></svg>"))).toBe(true)
    expect(looksLikeSvg(text("  \n<?xml version='1.0'?><svg/>"))).toBe(true)
    expect(looksLikeSvg(bytes(0xef, 0xbb, 0xbf, ...text("<svg/>")))).toBe(true)
    expect(looksLikeSvg(text("<!-- logo --><svg/>"))).toBe(true)
    expect(looksLikeSvg(PNG)).toBe(false)
  })
})

describe("checkLogoUpload", () => {
  it("accepts PNG and JPEG", () => {
    expect(checkLogoUpload(PNG)).toEqual({ ok: true, type: "image/png" })
    expect(checkLogoUpload(JPEG)).toEqual({ ok: true, type: "image/jpeg" })
  })

  it("refuses SVG with its own message", () => {
    expect(checkLogoUpload(text("<svg onload='alert(1)'/>"))).toEqual({ ok: false, error: LOGO_ERRORS.svg })
  })

  it("refuses another format, an empty file and a file over 2 MB", () => {
    expect(checkLogoUpload(text("GIF89a"))).toEqual({ ok: false, error: LOGO_ERRORS.format })
    expect(checkLogoUpload(new Uint8Array())).toEqual({ ok: false, error: LOGO_ERRORS.empty })
    const big = new Uint8Array(LOGO_MAX_UPLOAD_BYTES + 1)
    big.set(PNG)
    expect(checkLogoUpload(big)).toEqual({ ok: false, error: LOGO_ERRORS.tooLarge })
    const limit = new Uint8Array(LOGO_MAX_UPLOAD_BYTES)
    limit.set(PNG)
    expect(checkLogoUpload(limit).ok).toBe(true)
  })
})

describe("logoFileProblem (browser pre-check)", () => {
  it("says what is wrong before sending", () => {
    expect(logoFileProblem(null)).toBe(LOGO_ERRORS.empty)
    expect(logoFileProblem({ size: 0, type: "image/png" })).toBe(LOGO_ERRORS.empty)
    expect(logoFileProblem({ size: 10, type: "image/svg+xml" })).toBe(LOGO_ERRORS.svg)
    expect(logoFileProblem({ size: 10, type: "image/webp" })).toBe(LOGO_ERRORS.format)
    expect(logoFileProblem({ size: LOGO_MAX_UPLOAD_BYTES + 1, type: "image/jpeg" })).toBe(LOGO_ERRORS.tooLarge)
    expect(logoFileProblem({ size: 10, type: "image/png" })).toBeNull()
    // An unknown declared type is left to the server, which reads the bytes.
    expect(logoFileProblem({ size: 10, type: "" })).toBeNull()
  })
})

describe("logo URL, cache and ETag", () => {
  it("versions the same-origin URL with the start of the hash", () => {
    expect(logoVersion(HASH)).toBe("a".repeat(16))
    expect(orgLogoPath("org-1", HASH)).toBe(`/api/public/organizations/org-1/logo?v=${"a".repeat(16)}`)
    expect(orgLogoOf("org-1", { hash: HASH, width: 512, height: 256 })).toEqual({ src: orgLogoPath("org-1", HASH), width: 512, height: 256 })
    expect(orgLogoOf("org-1", null)).toBeNull()
    expect(orgLogoOf("org-1", undefined)).toBeNull()
  })

  it("is immutable for the current version only", () => {
    expect(logoCacheControl(logoVersion(HASH), HASH)).toBe("public, max-age=31536000, immutable")
    expect(logoCacheControl("0000000000000000", HASH)).toBe("public, max-age=3600, must-revalidate")
    expect(logoCacheControl(null, HASH)).toBe("public, max-age=3600, must-revalidate")
  })

  it("matches If-None-Match, weak or in a list", () => {
    expect(etagMatches(`"${HASH}"`, HASH)).toBe(true)
    expect(etagMatches(`W/"${HASH}"`, HASH)).toBe(true)
    expect(etagMatches(`"other", "${HASH}"`, HASH)).toBe(true)
    expect(etagMatches("*", HASH)).toBe(true)
    expect(etagMatches(`"other"`, HASH)).toBe(false)
    expect(etagMatches(null, HASH)).toBe(false)
  })
})

describe("fitLogo", () => {
  it("keeps the proportions inside the box and never enlarges", () => {
    expect(fitLogo(512, 256, 120, 40)).toEqual({ width: 80, height: 40 })
    expect(fitLogo(512, 128, 120, 40)).toEqual({ width: 120, height: 30 })
    expect(fitLogo(60, 30, 120, 40)).toEqual({ width: 60, height: 30 })
    expect(fitLogo(0, 0, 120, 40)).toEqual({ width: 120, height: 40 })
  })
})

describe("alternative text and markup", () => {
  it("is empty next to the written name, the name when alone", () => {
    expect(orgLogoAlt("Festival du Rhône", true)).toBe("")
    expect(orgLogoAlt("  Festival du Rhône ", false)).toBe("Festival du Rhône")
  })

  it("prints a decorative, sized image, or nothing without a logo", () => {
    const logo = { src: '/x?v=1&a="b"', width: 512, height: 256 }
    expect(printLogoHtml(logo, "org-logo", { maxWidth: 160, maxHeight: 56 })).toBe('<img class="org-logo" src="/x?v=1&amp;a=&quot;b&quot;" alt="" width="112" height="56">')
    expect(printLogoHtml(null, "org-logo", { maxWidth: 160, maxHeight: 56 })).toBe("")
  })

  it("puts an absolute URL in emails, with the organization's name as alt for blocked images", () => {
    const html = emailLogoHtml({ src: orgLogoPath("org-1", HASH), width: 400, height: 100 }, "https://cdp.benevol.app/", "Club <Rhône> & Co")
    expect(html).toContain(`src="https://cdp.benevol.app/api/public/organizations/org-1/logo?v=${"a".repeat(16)}"`)
    expect(html).toContain('alt="Club &lt;Rhône&gt; &amp; Co"')
    expect(html).toContain('width="200" height="50"')
  })
})
