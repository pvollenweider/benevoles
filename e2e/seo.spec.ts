import { test, expect, type APIRequestContext } from "@playwright/test"

/**
 * What search engines, AI crawlers and link previewers (WhatsApp, X, Facebook, LinkedIn, Slack...)
 * read from the public pages of the apex site (#746, #747): an absolute canonical on the
 * deployment's own address (never a build-time localhost), a social card that really is a PNG,
 * the large Twitter card, structured data that parses with the expected types; then robots.txt,
 * the sitemap index and llms.txt. The builders are unit-tested (src/lib/__tests__/seo-metadata,
 * structured-data, sitemap-index, llms-txt, social-card); this checks the served HTML.
 */

// The deployment's address, as the server reads it at request time.
const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")
// A user agent Next.js treats as an HTML-limited bot: the metadata is rendered in <head>, as a
// link previewer reads it.
const PREVIEWER = { "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" }

const headOf = (html: string) => html.slice(0, html.indexOf("</head>"))
const decode = (s: string | undefined) => s?.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
const meta = (head: string, attr: "name" | "property", key: string) => decode(head.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1])

/** Every @type of the page's JSON-LD documents, each of which must parse. */
function jsonLdTypes(html: string): string[] {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>)
  return blocks.flatMap((b) => ((b["@graph"] as { "@type": string }[] | undefined) ?? [b as { "@type": string }]).map((n) => n["@type"]))
}

async function fetchPage(request: APIRequestContext, path: string) {
  const response = await request.get(path, { headers: PREVIEWER })
  expect(response.status(), path).toBe(200)
  const html = await response.text()
  return { html, head: headOf(html) }
}

const PAGES: { path: string; types: string[]; ogType: string }[] = [
  { path: "/", types: ["WebSite", "Organization", "SoftwareApplication", "FAQPage"], ogType: "website" },
  { path: "/fonctionnalites", types: ["WebPage", "BreadcrumbList", "SoftwareApplication"], ogType: "website" },
  { path: "/doc", types: ["CollectionPage", "BreadcrumbList", "Organization"], ogType: "website" },
  { path: "/doc/revenir-sur-la-page-d-inscription", types: ["TechArticle", "BreadcrumbList", "Organization"], ogType: "article" },
  { path: "/legal/privacy", types: ["WebPage", "BreadcrumbList"], ogType: "website" },
]

for (const { path, types, ogType } of PAGES) {
  test(`${path} gives an absolute canonical, a fetchable social card and structured data`, async ({ request }) => {
    const { html, head } = await fetchPage(request, path)
    const canonical = head.match(/<link rel="canonical" href="([^"]*)"/)?.[1]
    expect(canonical).toBe(`${BASE}${path}`)
    expect(meta(head, "property", "og:url")).toBe(canonical)
    expect(meta(head, "property", "og:type")).toBe(ogType)
    expect(meta(head, "property", "og:locale")).toBe("fr_CH")
    expect(meta(head, "property", "og:site_name")).toBe("benevol.app")
    expect(meta(head, "property", "og:title")).toMatch(/\| benevol\.app$/)
    expect(meta(head, "property", "og:title")).not.toMatch(/—/)
    expect(meta(head, "name", "description")?.length).toBeGreaterThan(50)

    const image = meta(head, "property", "og:image")
    expect(image?.startsWith(`${BASE}/og-image.png`)).toBe(true)
    expect(meta(head, "property", "og:image:width")).toBe("1200")
    expect(meta(head, "property", "og:image:height")).toBe("630")
    expect(meta(head, "property", "og:image:alt")).toBeTruthy()
    expect(meta(head, "name", "twitter:card")).toBe("summary_large_image")
    expect(meta(head, "name", "twitter:image")).toBe(image)
    expect(meta(head, "name", "twitter:image:alt")).toBeTruthy()
    const png = await request.get(image!.replace(BASE, ""))
    expect(png.status()).toBe(200)
    expect(png.headers()["content-type"]).toBe("image/png")

    expect(jsonLdTypes(html)).toEqual(expect.arrayContaining(types))
    expect(html).toMatch(/<html lang="fr"/)
  })
}

test("a unit's social card is its own, and an unknown page has none", async ({ request }) => {
  const unit = await request.get("/og-image.png/doc/revenir-sur-la-page-d-inscription")
  const platform = await request.get("/og-image.png")
  expect(unit.status()).toBe(200)
  expect((await unit.body()).equals(await platform.body())).toBe(false)
  expect((await request.get("/og-image.png/doc/cette-page-n-existe-pas")).status()).toBe(404)
})

test("an organisation's public page has its own canonical and link preview", async ({ request }) => {
  const { head } = await fetchPage(request, "/?org=default")
  expect(meta(head, "property", "og:image")).toBe(`${BASE}/og-image.png`)
  expect(meta(head, "name", "twitter:card")).toBe("summary_large_image")
  expect(meta(head, "name", "description")).toMatch(/cherche des bénévoles/)
})

test("robots.txt welcomes search and AI crawlers, keeps private areas closed and names the sitemap index", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text()
  for (const bot of ["Googlebot", "Bingbot", "GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot"]) expect(robots).toContain(`User-Agent: ${bot}`)
  expect(robots).toContain("Disallow: /admin")
  expect(robots).toContain(`Sitemap: ${BASE}/sitemap-index.xml`)
})

test("the sitemap index lists the www sitemap and the organisations' own", async ({ request }) => {
  const response = await request.get("/sitemap-index.xml")
  expect(response.status()).toBe(200)
  expect(response.headers()["content-type"]).toContain("application/xml")
  const locs = [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  expect(locs[0]).toBe(`${BASE}/sitemap.xml`)
  // Locally, without subdomains, an organisation's sitemap is the apex one scoped by ?org=.
  expect(locs).toContain(`${BASE}/sitemap.xml?org=default`)
  const sitemap = await (await request.get("/sitemap.xml")).text()
  expect(sitemap).toContain(`<loc>${BASE}/legal/privacy</loc>`)
  expect(sitemap).toContain(`<loc>${BASE}/legal/terms</loc>`)
})

test("llms.txt sums up the site with absolute links to its pages", async ({ request }) => {
  const response = await request.get("/llms.txt")
  expect(response.status()).toBe(200)
  expect(response.headers()["content-type"]).toContain("text/plain")
  const text = await response.text()
  expect(text.startsWith("# benevol.app\n\n> ")).toBe(true)
  expect(text).toContain(`](${BASE}/fonctionnalites)`)
  expect(text).toContain(`](${BASE}/doc/revenir-sur-la-page-d-inscription)`)
  expect(text).toContain(`](${BASE}/llms-full.txt)`)
  expect((await request.get("/llms-full.txt")).status()).toBe(200)
})
