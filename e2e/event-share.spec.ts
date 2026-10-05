import { test, expect } from "@playwright/test"

/**
 * Event link preview and copy/share actions (#564): a published event's page carries its
 * description, canonical URL and Open Graph / Twitter card in the HTML <head> a link previewer
 * fetches; a draft gives nothing away; the admin copies the public link with a visible and
 * announced confirmation.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"
// A user agent Next.js treats as an HTML-limited bot: the metadata is rendered in <head>, as
// WhatsApp, Facebook or a newsletter tool would read it.
const PREVIEWER = { "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" }

const headOf = (html: string) => html.slice(0, html.indexOf("</head>"))
const metaContent = (head: string, attr: "name" | "property", key: string) =>
  head.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1]

test("a published event has a rich link preview and a copyable link; a draft has neither", async ({ page, context }) => {
  test.setTimeout(120_000)
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  const stamp = Date.now()
  const title = `E2E Partage ${stamp}`
  const created = await page.request.post("/api/admin/events", { data: { title, startDate: "2031-06-06", endDate: "2031-06-08" } })
  const event: { id: string; slug: string } = await created.json()

  // Draft: no title, no description, noindex.
  const draftHead = headOf(await (await page.request.get(`/${event.slug}?org=default`, { headers: PREVIEWER })).text())
  expect(draftHead).not.toContain(title)
  expect(metaContent(draftHead, "property", "og:title")).toBeUndefined()
  expect(metaContent(draftHead, "name", "robots")).toMatch(/noindex/)

  const shift = await page.request.post("/api/admin/shifts", {
    data: { eventId: event.id, roleName: "Bar", label: "Bar", date: "2031-06-06", startTime: "10:00", endTime: "12:00", capacity: 5 },
  })
  expect(shift.ok()).toBeTruthy()
  expect((await page.request.patch(`/api/admin/events/${event.id}`, { data: { publicStatus: "published" } })).ok()).toBeTruthy()

  // Published, no description: the fallback sentence, canonical, Open Graph and Twitter card.
  const head = headOf(await (await page.request.get(`/${event.slug}?org=default`, { headers: PREVIEWER })).text())
  const description = metaContent(head, "name", "description")
  expect(description).toMatch(new RegExp(`cherche des bénévoles pour ${title}, du 6 au 8 juin 2031\\.$`))
  expect(metaContent(head, "property", "og:title")).toBe(title)
  expect(metaContent(head, "property", "og:description")).toBe(description)
  expect(metaContent(head, "property", "og:image")).toMatch(/\/og-image\.png$/)
  expect(metaContent(head, "name", "twitter:card")).toBe("summary_large_image")
  const canonical = head.match(/<link rel="canonical" href="([^"]*)"/)?.[1]
  expect(canonical).toContain(`/${event.slug}`)
  expect(metaContent(head, "property", "og:url")).toBe(canonical)
  expect(metaContent(head, "name", "robots")).toBeUndefined()

  // Admin: copy the public link, with a visible confirmation in the status region.
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto(`/admin/events/${event.id}`)
  const section = page.getByRole("region", { name: "Partager l'événement" })
  await expect(section.getByText(canonical!)).toBeVisible()
  await section.getByRole("button", { name: "Copier le lien" }).click()
  await expect(section.getByRole("status")).toHaveText("Lien copié.")
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(canonical)

  // The pre-publish page offers the same actions.
  await page.goto(`/admin/events/${event.id}/review`)
  await expect(page.getByRole("button", { name: "Copier le lien" })).toBeVisible()
})
