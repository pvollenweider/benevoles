// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium, type Locator, type Page } from "playwright"
import { loadManifest, videoDir, type AudioMetadata, type Timeline } from "../lib/manifest"

const reference = process.argv.find((arg) => !arg.startsWith("-") && arg !== process.argv[0] && arg !== process.argv[1])
if (!reference) throw new Error("Usage: npm run video:record -- <VIDEO_ID>")

const baseUrl = (process.env.VIDEO_BASE_URL ?? "http://localhost:43100").replace(/\/$/, "")
const host = new URL(baseUrl).hostname
if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
  throw new Error(`Refusing to record against non-local host ${host}`)
}

const org = process.env.VIDEO_ORG ?? "default"
const eventSlug = process.env.VIDEO_EVENT_SLUG ?? "fete-du-village"
const gapMs = 450

async function metadata(file: string): Promise<AudioMetadata | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as AudioMetadata
  } catch {
    return null
  }
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" })
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(500)
}

async function ensureTouchMarker(page: Page) {
  await page.evaluate(() => {
    if (document.getElementById("video-touch-marker")) return
    const style = document.createElement("style")
    style.id = "video-touch-marker-style"
    style.textContent = `
      #video-touch-marker {
        position: fixed; z-index: 2147483647; width: 28px; height: 28px;
        margin: -14px 0 0 -14px; border: 3px solid rgba(37, 99, 235, .95);
        border-radius: 9999px; background: rgba(255, 255, 255, .75);
        box-shadow: 0 1px 4px rgba(0, 0, 0, .28); pointer-events: none;
        opacity: 0; transition: left .35s ease, top .35s ease, opacity .12s ease;
      }
      #video-touch-marker.video-tap { animation: video-tap .42s ease-out; }
      @keyframes video-tap {
        0% { transform: scale(1); }
        45% { transform: scale(.68); background: rgba(37, 99, 235, .35); }
        100% { transform: scale(1); }
      }
    `
    const marker = document.createElement("div")
    marker.id = "video-touch-marker"
    marker.setAttribute("aria-hidden", "true")
    document.head.append(style)
    document.body.append(marker)
  })
}

async function tap(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded()
  const box = await target.boundingBox()
  if (!box) throw new Error("Cannot show a touch marker for an invisible target")
  await ensureTouchMarker(page)
  await page.evaluate(({ x, y }) => {
    const marker = document.getElementById("video-touch-marker")!
    marker.style.left = `${x}px`
    marker.style.top = `${y}px`
    marker.style.opacity = "1"
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  await page.waitForTimeout(420)
  await page.evaluate(() => {
    const marker = document.getElementById("video-touch-marker")!
    marker.classList.remove("video-tap")
    void marker.getBoundingClientRect()
    marker.classList.add("video-tap")
  })
  await target.click()
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const marker = document.getElementById("video-touch-marker")
    if (marker) marker.style.opacity = "0"
  })
}

async function dragVisibly(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await ensureTouchMarker(page)
  await page.evaluate(({ x, y }) => {
    const marker = document.getElementById("video-touch-marker")!
    marker.style.left = `${x}px`
    marker.style.top = `${y}px`
    marker.style.opacity = "1"
  }, from)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  const steps = 14
  for (let step = 1; step <= steps; step++) {
    const point = {
      x: from.x + (to.x - from.x) * step / steps,
      y: from.y + (to.y - from.y) * step / steps,
    }
    await page.mouse.move(point.x, point.y)
    await page.evaluate(({ x, y }) => {
      const marker = document.getElementById("video-touch-marker")!
      marker.style.left = `${x}px`
      marker.style.top = `${y}px`
    }, point)
    await page.waitForTimeout(35)
  }
  await page.mouse.up()
  await page.waitForTimeout(450)
  await page.evaluate(() => {
    const marker = document.getElementById("video-touch-marker")
    if (marker) marker.style.opacity = "0"
  })
}

async function typeNaturally(page: Page, field: Locator, value: string) {
  await field.scrollIntoViewIfNeeded()
  await tap(page, field)
  await field.pressSequentially(value, { delay: 95 })
  await page.waitForTimeout(180)
}

async function fillVisibly(page: Page, field: Locator, value: string, pauseMs = 850) {
  await field.scrollIntoViewIfNeeded()
  await tap(page, field)
  await field.fill(value)
  await page.waitForTimeout(pauseMs)
}

async function main() {
  const manifest = await loadManifest(reference!)
  const slug = manifest.slug
  const dir = videoDir(manifest.slug)
  const rawVideo = path.join(dir, "capture.webm")
  const timelineFile = path.join(dir, "timeline.json")
  const audio = await metadata(path.join(dir, "audio-metadata.json"))
  const durations = new Map(manifest.segments.map((segment) => [segment.id, audio?.segments[segment.id]?.durationMs ?? segment.fallbackDurationMs]))
  await mkdir(dir, { recursive: true })
  await rm(rawVideo, { force: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: manifest.viewport.width, height: manifest.viewport.height },
    deviceScaleFactor: manifest.viewport.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    locale: manifest.language,
    timezoneId: "Europe/Zurich",
    colorScheme: "light",
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  })
  const page = await context.newPage()
  const cues: Timeline["cues"] = []
  let startedAt = 0
  let recording = false

  const scene = async (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => {
    const audioDuration = durations.get(id)
    if (!audioDuration) throw new Error(`Missing duration for ${id}`)
    // The TTS take contains a short tail, the recorder adds a chapter gap, and the next take has
    // a short lead-in. Overlap the silent tails at this transition so the next sentence follows
    // naturally without clipping or overlapping spoken words.
    const expected = audioDuration - (id === "lifecycle" ? 1_300 : 0)
    const start = performance.now()
    cues.push({ id, startMs: Math.round(start - startedAt), endMs: 0 })
    const at = async (fraction: number) => {
      const remaining = start + expected * fraction - performance.now()
      if (remaining > 0) await page.waitForTimeout(remaining)
    }
    try {
      await action(at)
    } catch (error) {
      throw new Error(`Scene ${id} failed`, { cause: error })
    }
    const elapsed = performance.now() - start
    if (elapsed > expected + 1_000) {
      throw new Error(`Scene ${id} overruns its narration by ${Math.round(elapsed - expected)} ms`)
    }
    if (elapsed < expected) await page.waitForTimeout(expected - elapsed)
    cues.at(-1)!.endMs = Math.round(performance.now() - startedAt)
    await page.waitForTimeout(gapMs)
  }

  try {
    let featureEventId = ""
    if (slug === "volunteer-register-mobile") {
      await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`)
      await settle(page)
      const heading = page.getByRole("heading", { level: 1, name: "Fête du village de Montvert" })
      if (!(await heading.isVisible())) throw new Error("Demo event not found; run scripts/seed-demo.ts on the local database first")
    } else {
      await page.goto(`${baseUrl}/admin/login`)
      await page.getByLabel("Email").fill(process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost")
      await page.getByLabel("Mot de passe").fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
      await page.getByRole("button", { name: "Se connecter" }).click()
      await page.waitForURL(/\/admin\/events/)
      await settle(page)
      if (slug === "admin-features-tour" || slug === "organizer-monitor-followup" || slug === "admin-navigation" || slug === "global-search" || slug === "org-public-identity" || slug === "org-timezone-charter" || slug === "event-review-publish" || slug === "event-visibility-registration-window" || slug === "event-duplicate" || slug === "event-program-pages-qr" || slug === "event-milestones" || slug === "event-archive-delete" || slug === "shifts-roles-views" || slug === "shift-create-edit-detail" || slug === "shift-create-series" || slug === "shift-timeline-quick-actions" || slug === "shift-night-dst" || slug === "shift-waitlist-offer" || slug === "shift-approval" || slug === "shift-eligibility-rules" || slug === "volunteer-discover-event") {
        const href = await page.getByRole("link", { name: "Fête du village de Montvert" }).first().getAttribute("href")
        if (!href) throw new Error("Seed event link not found")
        featureEventId = href.split("/").filter(Boolean).at(-1) ?? ""
        const warmRoutes = slug === "admin-features-tour" ? [
          "/admin/settings/admins",
          `/admin/events/${featureEventId}`,
          `/admin/events/${featureEventId}/sector-leaders`,
          `/admin/events/${featureEventId}/edit`,
          `/admin/events/${featureEventId}/duplicate`,
          `/admin/events/${featureEventId}/shifts`,
          `/admin/events/${featureEventId}/registrations`,
          "/admin/members",
          `/admin/events/${featureEventId}/questions`,
          `/admin/events/${featureEventId}/pages`,
          "/admin/settings/message-templates",
          `/admin/events/${featureEventId}/message`,
          "/admin/settings/notifications",
          `/admin/events/${featureEventId}/print`,
          `/admin/events/${featureEventId}/log`,
          "/admin/search?q=buvette",
        ] : slug === "admin-navigation" || slug === "global-search" || slug === "org-public-identity" || slug === "org-timezone-charter" || slug === "event-review-publish" || slug === "event-visibility-registration-window" || slug === "event-duplicate" || slug === "event-program-pages-qr" || slug === "event-milestones" || slug === "event-archive-delete" || slug === "shifts-roles-views" || slug === "shift-create-edit-detail" || slug === "shift-create-series" || slug === "shift-timeline-quick-actions" || slug === "shift-night-dst" || slug === "shift-waitlist-offer" || slug === "shift-approval" || slug === "shift-eligibility-rules" || slug === "volunteer-discover-event" ? [
          "/admin/events",
          "/admin/members",
          "/admin/settings/admins",
          `/admin/events/${featureEventId}`,
          `/admin/events/${featureEventId}/shifts`,
          "/admin/search?q=buvette",
          "/admin/account",
        ] : [
          `/admin/events/${featureEventId}`,
          `/admin/events/${featureEventId}/staffing`,
          `/admin/events/${featureEventId}/registrations`,
          `/admin/events/${featureEventId}/registrations?demandes=1`,
          `/admin/events/${featureEventId}/message`,
          "/admin/settings/notifications",
          `/admin/events/${featureEventId}/print`,
          `/admin/events/${featureEventId}/log`,
        ]
        for (const route of warmRoutes) {
          await page.goto(`${baseUrl}${route}`)
          await page.waitForLoadState("networkidle")
        }
        await page.goto(`${baseUrl}/admin/events`)
        await settle(page)
      }
    }

    // Recorder-owned demo data must be cleaned before capture starts. These scenarios are often
    // retried while tuning synchronization; doing it here keeps both the database and the first
    // frame deterministic, without showing maintenance actions in the finished lesson.
    if (slug === "event-milestones") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}`); await settle(page)
      while (await page.getByRole("checkbox", { name: "Fermer les inscriptions", exact: true }).count()) {
        await page.getByRole("button", { name: "Supprimer le jalon Fermer les inscriptions", exact: true }).first().click()
        const dialog = page.getByRole("alertdialog")
        await dialog.waitFor()
        await dialog.getByRole("button", { name: /^Supprimer/ }).click()
        await dialog.waitFor({ state: "hidden" })
      }
    } else if (slug === "event-program-pages-qr") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/pages`); await settle(page)
      while (await page.getByText("FAQ bénévoles", { exact: true }).count()) {
        await page.getByRole("button", { name: "Supprimer la page « FAQ bénévoles »", exact: true }).first().click()
        const dialog = page.getByRole("alertdialog")
        await dialog.waitFor()
        await dialog.getByRole("button", { name: /^Supprimer/ }).click()
        await dialog.waitFor({ state: "hidden" })
      }
      while (await page.getByText("Questions fréquentes", { exact: true }).count() > 1) {
        await page.getByRole("button", { name: "Supprimer la page « Questions fréquentes »", exact: true }).last().click()
        const dialog = page.getByRole("alertdialog")
        await dialog.waitFor()
        await dialog.getByRole("button", { name: /^Supprimer/ }).click()
        await dialog.waitFor({ state: "hidden" })
      }
    }

    await page.screencast.start({
      path: rawVideo,
      size: { width: manifest.viewport.width, height: manifest.viewport.height },
      quality: 90,
    })
    recording = true
    startedAt = performance.now()

    if (slug === "volunteer-register-mobile") {
    await scene("welcome", async () => {
      await page.screencast.showChapter(manifest.title, { description: "Le parcours bénévole, simplement", duration: 2_300 })
    })

    const shift = page.getByRole("button", { name: /Sélectionner — Accueil 15h–18h/ })
    await scene("discover", async () => {
      await shift.scrollIntoViewIfNeeded()
      await page.waitForTimeout(700)
    })

    await scene("choose", async () => {
      await tap(page, shift)
      const continueButton = page.getByRole("button", { name: /^Continuer/ })
      await continueButton.scrollIntoViewIfNeeded()
      await page.waitForTimeout(900)
      await tap(page, continueButton)
      await page.getByRole("heading", { name: "Vos informations" }).waitFor()
    })

    const stamp = Date.now()
    await scene("details", async () => {
      await typeNaturally(page, page.getByRole("textbox", { name: "Prénom *", exact: true }), "Alex")
      await typeNaturally(page, page.getByRole("textbox", { name: "Nom *", exact: true }), "Martin")
      await typeNaturally(page, page.getByRole("textbox", { name: "Email *", exact: true }), `alex.martin.video.${stamp}@example.org`)
      await typeNaturally(page, page.getByRole("textbox", { name: /Téléphone \*/, exact: true }), "079 000 12 34")
    })

    await scene("preferences", async () => {
      const size = page.getByRole("radio", { name: "M", exact: true })
      await size.scrollIntoViewIfNeeded()
      await tap(page, size)
      const charter = page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox")
      await tap(page, charter)
      const privacy = page.locator("label").filter({ hasText: "J'accepte que mes données" }).getByRole("checkbox")
      await tap(page, privacy)
    })

    await scene("confirm", async () => {
      const submit = page.getByRole("button", { name: "Confirmer mon inscription" })
      await submit.scrollIntoViewIfNeeded()
      await page.waitForTimeout(700)
      await tap(page, submit)
      await page.waitForURL(new RegExp(`/${eventSlug}/success`), { timeout: 20_000 })
      await page.getByRole("heading", { name: /inscription confirmée/i }).waitFor()
    })

    await scene("success", async () => {
      const emailNotice = page.getByText("Merci pour ton engagement. Un email de confirmation a été envoyé.")
      await emailNotice.scrollIntoViewIfNeeded()
      await page.waitForTimeout(900)
    })
    } else if (slug === "admin-navigation") {
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Trouver le bon écran, sans hésiter", duration: 2_300 })
        await page.getByRole("heading", { name: "Événements" }).waitFor()
      })

      await page.screencast.showChapter("Toute l’organisation", { description: "Événements, membres et réglages communs", duration: 1_400 })
      await scene("organization-navigation", async (at) => {
        await at(0.08)
        await tap(page, page.getByRole("link", { name: "Membres", exact: true }).first())
        await page.getByRole("heading", { name: "Membres" }).waitFor()
        await at(0.43)
        await tap(page, page.getByRole("link", { name: "Paramètres", exact: true }).first())
        await page.getByRole("heading", { name: "Paramètres" }).waitFor()
        await at(0.72)
        await tap(page, page.getByRole("link", { name: "Événements", exact: true }).first())
        await page.getByRole("heading", { name: "Événements" }).waitFor()
      })

      await page.screencast.showChapter("Un événement précis", { description: "Planning, inscriptions et suivi", duration: 1_400 })
      await scene("event-navigation", async (at) => {
        await tap(page, page.getByRole("link", { name: "Fête du village de Montvert" }).first())
        await page.waitForURL(new RegExp(`/admin/events/${featureEventId}$`))
        await at(0.34)
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
        await at(0.66)
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations`); await settle(page)
        await page.getByRole("heading", { name: "Inscriptions" }).waitFor()
        await at(0.84)
        await page.goto(`${baseUrl}/admin/events`); await settle(page)
      })

      await page.screencast.showChapter("Retrouver directement", { description: "Recherche globale et raccourci clavier", duration: 1_400 })
      await scene("search", async (at) => {
        await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K")
        const search = page.getByLabel("Rechercher un bénévole, un événement ou un poste").first()
        await search.waitFor()
        await typeNaturally(page, search, "buvette")
        await at(0.40)
        await search.press("Enter")
        await page.waitForURL(/\/admin\/search\?q=buvette/)
        await page.getByRole("heading", { name: "Recherche" }).waitFor()
        await at(0.70)
        const result = page.getByRole("link", { name: /Buvette/i }).first()
        if (await result.isVisible()) await result.scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events`); await settle(page)
      await scene("account-help", async (at) => {
        const accountMenu = page.locator('button[aria-haspopup="menu"]:visible').last()
        await tap(page, accountMenu)
        await page.getByRole("menu", { name: "Menu du compte" }).waitFor()
        await at(0.44)
        await page.getByRole("menuitem", { name: "Mon compte" }).hover()
        await at(0.72)
        await page.keyboard.press("Escape")
        await page.getByRole("link", { name: /Aide/ }).filter({ visible: true }).first().scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Mobile et clavier", { description: "Les mêmes repères pour tout le monde", duration: 1_400 })
      await scene("mobile-keyboard", async (at) => {
        await page.setViewportSize({ width: 390, height: 800 })
        await at(0.10)
        await tap(page, page.getByRole("button", { name: /Menu/ }))
        await page.getByRole("link", { name: "Membres", exact: true }).waitFor()
        await at(0.48)
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${baseUrl}/admin/events`); await settle(page)
        await page.locator("body").click({ position: { x: 4, y: 120 } })
        await page.keyboard.press("Tab")
        await page.getByRole("link", { name: "Aller au contenu" }).waitFor()
        await at(0.76)
        await page.keyboard.press("Enter")
      })

      await scene("result", async () => {
        await page.goto(`${baseUrl}/admin/events`); await settle(page)
        await page.getByRole("heading", { name: "Événements" }).waitFor()
      })
    } else if (slug === "global-search") {
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Une personne ou un créneau, en quelques secondes", duration: 2_300 })
        await page.getByRole("heading", { name: "Événements" }).waitFor()
      })

      await scene("open", async (at) => {
        await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K")
        const field = page.getByLabel("Rechercher un bénévole, un événement ou un poste").filter({ visible: true })
        await field.waitFor()
        await at(0.46)
        await page.keyboard.press("Escape")
        await at(0.72)
        await tap(page, page.getByRole("button", { name: "Rechercher" }).filter({ visible: true }))
      })

      await page.screencast.showChapter("Retrouver une personne", { description: "Fiche membre ou inscription", duration: 1_400 })
      await scene("person", async (at) => {
        const field = page.getByLabel("Rechercher un bénévole, un événement ou un poste").filter({ visible: true })
        await typeNaturally(page, field, "Camille Rochat")
        await field.press("Enter")
        await page.waitForURL(/\/admin\/search/)
        await page.getByRole("heading", { name: "Recherche" }).waitFor()
        await at(0.52)
        await page.getByRole("heading", { name: /Bénévoles/ }).scrollIntoViewIfNeeded()
        await at(0.74)
        await page.getByRole("heading", { name: /Inscriptions/ }).scrollIntoViewIfNeeded()
      })

      await scene("shift", async (at) => {
        const search = page.getByLabel("Nom, email, téléphone, événement ou poste")
        await tap(page, search)
        await search.fill("Buvette")
        await page.getByRole("button", { name: "Rechercher", exact: true }).click()
        await page.waitForURL(/q=Buvette/)
        await at(0.58)
        await page.getByRole("heading", { name: /Créneaux/ }).scrollIntoViewIfNeeded()
      })

      await scene("limits", async (at) => {
        const search = page.getByLabel("Nom, email, téléphone, événement ou poste")
        await tap(page, search)
        await search.fill("zoe")
        await page.getByRole("button", { name: "Rechercher", exact: true }).click()
        await page.waitForURL(/q=zoe/)
        await at(0.55)
        await page.getByText("Zoé Pittet").first().scrollIntoViewIfNeeded()
      })

      await scene("result", async () => {
        await page.getByRole("heading", { name: "Recherche" }).waitFor()
      })
    } else if (slug === "org-public-identity") {
      await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Un nom clair et une adresse stable", duration: 2_300 })
        await page.getByRole("heading", { name: "Paramètres" }).waitFor()
      })

      await scene("names", async (at) => {
        await page.getByRole("heading", { name: /^Nom de l.organisation$/ }).scrollIntoViewIfNeeded()
        await at(0.28)
        const titleHeading = page.getByRole("heading", { name: "Titre de la page publique" })
        await titleHeading.scrollIntoViewIfNeeded()
        const form = titleHeading.locator("xpath=ancestor::form")
        const field = form.getByLabel("Titre affiché en haut de la page de vos événements")
        await tap(page, field)
        await field.fill("Les bénévoles des Fêtes de Montvert")
        await at(0.70)
        await tap(page, form.getByRole("button", { name: "Enregistrer" }))
        await form.getByText(/Titre enregistré|Aucune modification/).waitFor()
      })

      await scene("slug", async (at) => {
        const heading = page.getByRole("heading", { name: "Identifiant public (slug)" })
        await heading.scrollIntoViewIfNeeded()
        await at(0.44)
        await page.getByLabel("Identifiant", { exact: true }).click()
        await at(0.72)
        await page.getByText(/Adresse de votre espace/).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/?org=${encodeURIComponent(org)}`); await settle(page)
      await scene("public-page", async (at) => {
        await page.getByText("Les bénévoles des Fêtes de Montvert").first().waitFor()
        await at(0.52)
        await page.getByRole("link", { name: "Fête du village de Montvert" }).scrollIntoViewIfNeeded()
      })

      await scene("event-result", async (at) => {
        const eventLink = page.getByRole("link", { name: "Fête du village de Montvert" })
        await tap(page, eventLink)
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).waitFor()
        await at(0.58)
        await page.getByText("Place du Collège, Montvert").first().scrollIntoViewIfNeeded()
      })

      await scene("result", async () => {
        await page.goto(`${baseUrl}/?org=${encodeURIComponent(org)}`); await settle(page)
        await page.getByText("Les bénévoles des Fêtes de Montvert").first().waitFor()
      })
    } else if (slug === "org-timezone-charter") {
      await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Des horaires justes et un cadre clair", duration: 2_300 })
        await page.getByRole("heading", { name: "Paramètres" }).waitFor()
      })

      await page.screencast.showChapter("Le temps local", { description: "Rappels, délais et changements d’heure", duration: 1_400 })
      await scene("timezone", async (at) => {
        const heading = page.getByRole("heading", { name: "Fuseau horaire" })
        await heading.scrollIntoViewIfNeeded()
        const form = heading.locator("xpath=ancestor::form")
        await at(0.34)
        await form.getByLabel("Fuseau horaire de vos événements").selectOption("Europe/Zurich")
        await at(0.68)
        await form.getByText(/Les heures des créneaux/).scrollIntoViewIfNeeded()
      })

      await scene("timezone-result", async (at) => {
        const heading = page.getByRole("heading", { name: "Fuseau horaire" })
        const form = heading.locator("xpath=ancestor::form")
        await tap(page, form.getByRole("button", { name: "Enregistrer" }))
        await at(0.52)
        await page.getByText(/sans modifier leurs heures affichées/).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("La convention", { description: "Le cadre accepté par chaque bénévole", duration: 1_400 })
      await scene("charter", async (at) => {
        const heading = page.getByRole("heading", { name: "Convention des Bénévoles" })
        await heading.scrollIntoViewIfNeeded()
        const panel = heading.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')]")
        const charter = panel.locator("textarea")
        await tap(page, charter)
        await charter.fill("Je m’engage à arriver à l’heure, à prévenir rapidement en cas d’empêchement et à respecter les consignes de sécurité données par les responsables.")
        await at(0.65)
        await tap(page, panel.getByRole("button", { name: "Enregistrer" }))
        await panel.getByText("Enregistré ✓").waitFor()
      })

      await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
      await page.screencast.showChapter("Côté bénévole", { description: "Vérifier le texte réellement présenté", duration: 1_400 })
      await scene("public-setup", async (at) => {
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).waitFor()
        await at(0.22)
        await tap(page, page.getByRole("button", { name: /Sélectionner — Accueil 09h–12h/ }))
        await at(0.52)
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        await page.getByRole("heading", { name: "Vos informations" }).waitFor()
      })

      await scene("public-result", async (at) => {
        await page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).scrollIntoViewIfNeeded()
        await at(0.08)
        await tap(page, page.getByRole("button", { name: "convention des bénévoles" }))
        await page.getByRole("dialog", { name: "Convention des Bénévoles" }).waitFor()
        await at(0.24)
        await page.getByText(/Je m’engage à arriver à l’heure/).scrollIntoViewIfNeeded()
        await at(0.66)
        await tap(page, page.getByRole("button", { name: "J'ai lu et j'accepte" }))
        await page.getByRole("heading", { name: "Vos informations" }).waitFor()
      })

      await scene("attention", async (at) => {
        await page.getByRole("heading", { name: "Vos informations" }).scrollIntoViewIfNeeded()
        await at(0.24)
        await page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).scrollIntoViewIfNeeded()
        await at(0.68)
        await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
        await page.getByRole("heading", { name: "Fuseau horaire" }).scrollIntoViewIfNeeded()
      })

      await scene("result", async () => {
        await page.getByRole("heading", { name: "Fuseau horaire" }).scrollIntoViewIfNeeded()
      })
    } else if (slug === "shift-night-dst") {
      const nightEvent = await page.evaluate(async () => {
        const eventResponse = await fetch("/api/admin/events", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Nuits et changements d'heure 2026", description: "Trois permanences pour comprendre minuit et les changements d'heure.", location: "Maison des associations", startDate: "2026-03-29", endDate: "2026-10-25", publicStatus: "draft" }),
        })
        if (!eventResponse.ok) throw new Error(await eventResponse.text())
        const event = await eventResponse.json()
        const shifts = [
          { roleName: "Nuit ordinaire", label: "Permanence de nuit", date: "2026-07-04", startTime: "22:00", endTime: "02:00", capacity: 2 },
          { roleName: "Passage à l'heure d'été", label: "Nuit du printemps", date: "2026-03-29", startTime: "01:00", endTime: "05:00", capacity: 2 },
          { roleName: "Passage à l'heure d'hiver", label: "Nuit de l'automne", date: "2026-10-25", startTime: "01:00", endTime: "05:00", capacity: 2 },
        ]
        for (const shift of shifts) {
          const response = await fetch("/api/admin/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...shift, eventId: event.id }) })
          if (!response.ok) throw new Error(await response.text())
        }
        return event as { id: string }
      })
      await page.goto(`${baseUrl}/admin/events/${nightEvent.id}/shifts`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Minuit, heure d’été et heure d’hiver", duration: 2_300 })
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
      })
      await scene("ordinary", async (at) => {
        const shift = page.getByRole("button", { name: /Nuit ordinaire/ })
        await shift.scrollIntoViewIfNeeded()
        await at(0.42)
        await tap(page, shift)
        await page.getByRole("dialog").waitFor()
      })
      await scene("spring", async (at) => {
        await tap(page, page.getByRole("button", { name: "Fermer et enregistrer" }))
        const shift = page.getByRole("button", { name: /Passage à l'heure d'été/ })
        await shift.scrollIntoViewIfNeeded()
        await at(0.46)
        await tap(page, shift)
      })
      await scene("autumn", async (at) => {
        await tap(page, page.getByRole("button", { name: "Fermer et enregistrer" }))
        const shift = page.getByRole("button", { name: /Passage à l'heure d'hiver/ })
        await shift.scrollIntoViewIfNeeded()
        await at(0.46)
        await tap(page, shift)
      })
      await scene("timezone", async (at) => {
        await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
        const timeZone = page.getByLabel("Fuseau horaire de vos événements")
        await timeZone.scrollIntoViewIfNeeded()
        await at(0.56)
        await timeZone.focus()
      })
      await scene("calendar", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${nightEvent.id}/shifts`); await settle(page)
        await tap(page, page.getByRole("button", { name: "Liste" }))
        await at(0.42)
        await page.getByText("Nuit du printemps", { exact: true }).scrollIntoViewIfNeeded()
      })
      await scene("result", async (at) => {
        await page.getByText("Nuit de l'automne", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.58)
      })
    } else if (slug === "shift-timeline-quick-actions") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Dessiner et ajuster sans quitter le planning", duration: 2_300 })
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
      })
      let createdBar: Locator
      await scene("draw", async (at) => {
        const region = page.getByRole("region", { name: /Planning du/ }).first()
        const row = region.locator(".cursor-crosshair").last()
        await row.scrollIntoViewIfNeeded()
        const from = await row.evaluate((el) => {
          const rect = el.getBoundingClientRect()
          const y = rect.top + Math.min(18, rect.height / 2)
          const limit = Math.min(rect.right - 100, window.innerWidth - 120)
          for (let x = rect.left + 140; x < limit; x += 24) {
            if (!(document.elementFromPoint(x, y) as HTMLElement | null)?.closest("[data-shift-bar]")) return { x, y }
          }
          return { x: Math.max(rect.left + 20, limit - 100), y }
        })
        await at(0.32)
        await dragVisibly(page, from, { x: from.x + 96, y: from.y })
        await page.getByRole("dialog").waitFor()
        createdBar = row.locator('[data-shift-bar="1"]').last()
      })
      await scene("resize", async (at) => {
        await tap(page, page.getByRole("button", { name: "Fermer et enregistrer" }))
        const handle = createdBar.locator(".cursor-ew-resize").last()
        const box = await handle.boundingBox()
        if (!box) throw new Error("Created shift resize handle is not visible")
        await at(0.34)
        await dragVisibly(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { x: box.x + box.width / 2 + 48, y: box.y + box.height / 2 })
        await page.waitForTimeout(900)
      })
      await scene("popover", async (at) => {
        await at(0.28)
        await tap(page, createdBar)
        await page.getByRole("dialog").waitFor()
        await at(0.62)
        await page.getByLabel("Inscriptions").scrollIntoViewIfNeeded()
      })
      await scene("copy", async (at) => {
        await page.getByRole("button", { name: "Dupliquer" }).scrollIntoViewIfNeeded()
        await at(0.34)
        await tap(page, page.getByRole("button", { name: "Dupliquer" }))
        await page.getByText("Créneau dupliqué", { exact: true }).waitFor()
      })
      await scene("detail", async (at) => {
        await tap(page, page.getByRole("button", { name: "Fermer et enregistrer" }))
        await tap(page, page.getByRole("button", { name: "Liste" }))
        const row = page.locator("tbody tr").last()
        await row.scrollIntoViewIfNeeded()
        await at(0.42)
        await tap(page, row.getByRole("button", { name: "Modifier" }))
        await page.getByRole("heading", { name: "Modifier le créneau" }).waitFor()
      })
      await scene("result", async (at) => {
        await page.getByRole("group", { name: "Infos pratiques pour les bénévoles" }).scrollIntoViewIfNeeded()
        await at(0.62)
      })
    } else if (slug === "shift-create-series") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Découper une longue journée en relèves", duration: 2_300 })
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
      })
      await scene("range", async (at) => {
        await tap(page, page.getByRole("button", { name: "Créer une série" }))
        await page.getByRole("heading", { name: "Créer une série de créneaux" }).waitFor()
        await page.getByLabel("Poste *").fill("Buvette série")
        const date = page.getByLabel("Date *")
        if (await date.count()) await date.selectOption({ index: 1 })
        await at(0.46)
        await page.getByLabel("Début *").fill("10:00")
        await page.getByLabel("Fin *").fill("22:00")
      })
      await scene("duration", async (at) => {
        await page.getByLabel("Durée d'un créneau *").selectOption("120")
        await at(0.42)
        await page.getByLabel("Personnes par créneau *").fill("3")
        await at(0.70)
        await page.getByLabel("Pause entre deux créneaux (min)").fill("0")
      })
      await scene("preview", async (at) => {
        await page.getByText(/Aperçu :/).scrollIntoViewIfNeeded()
        await at(0.48)
        await page.getByRole("list", { name: "Créneaux qui seront créés" }).scrollIntoViewIfNeeded()
      })
      await scene("create", async (at) => {
        const create = page.getByRole("button", { name: "Créer 6 créneaux" })
        await create.scrollIntoViewIfNeeded()
        await at(0.28)
        await tap(page, create)
        await page.getByText("Buvette série", { exact: true }).first().waitFor()
        await at(0.68)
        await page.getByText("Buvette série", { exact: true }).first().scrollIntoViewIfNeeded()
      })
      await scene("adjust", async (at) => {
        await tap(page, page.getByRole("button", { name: "Liste" }))
        const row = page.locator("tr").filter({ hasText: "Buvette série" }).first()
        await row.scrollIntoViewIfNeeded()
        await at(0.34)
        await tap(page, row.getByRole("button", { name: "Modifier" }))
        await page.getByRole("heading", { name: "Modifier le créneau" }).waitFor()
        await at(0.68)
        await page.getByLabel("Capacité *").fill("4")
      })
      await scene("result", async (at) => {
        await page.getByRole("button", { name: "Enregistrer" }).scrollIntoViewIfNeeded()
        await at(0.42)
        await tap(page, page.getByRole("button", { name: "Annuler" }))
      })
    } else if (slug === "shift-create-edit-detail") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "De l’horaire aux informations du jour J", duration: 2_300 })
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
      })
      await scene("identity", async (at) => {
        await tap(page, page.getByRole("button", { name: "+ Ajouter un créneau" }))
        await page.getByRole("heading", { name: "Nouveau créneau" }).waitFor()
        await at(0.22)
        await page.getByLabel("Poste *").fill("Accueil")
        await page.getByLabel("Libellé").fill("Accueil des artistes")
        const date = page.getByLabel("Date *")
        if (await date.count()) await date.selectOption({ index: 1 })
        await at(0.48)
        await page.getByLabel("Début *").fill("18:00")
        await page.getByLabel("Fin *").fill("21:30")
        await page.getByLabel("Capacité *").fill("3")
      })
      await scene("availability", async (at) => {
        const waitlist = page.getByRole("checkbox", { name: /Activer la liste d'attente/ })
        await waitlist.scrollIntoViewIfNeeded()
        await at(0.38)
        await tap(page, waitlist)
        await at(0.64)
        await page.getByRole("checkbox", { name: /Sur validation/ }).scrollIntoViewIfNeeded()
      })
      await scene("practical", async (at) => {
        await page.getByRole("group", { name: "Infos pratiques pour les bénévoles" }).scrollIntoViewIfNeeded()
        await at(0.22)
        await page.getByLabel("Lieu de rendez-vous").fill("Entrée artistes, portail nord")
        await page.getByLabel("Coordonnées GPS ou lien de carte").fill("46.1805734, 6.1228285")
        await at(0.52)
        await page.getByLabel("Personne de contact").fill("Léa, accueil artistes")
        await page.getByLabel("Téléphone du contact").fill("079 555 01 24")
        await page.getByLabel("Consigne pratique").fill("Venir dix minutes avant avec des chaussures fermées.")
      })
      await scene("save", async (at) => {
        await page.getByRole("button", { name: "Ajouter", exact: true }).scrollIntoViewIfNeeded()
        await at(0.30)
        await tap(page, page.getByRole("button", { name: "Ajouter", exact: true }))
        await page.getByText("Accueil des artistes", { exact: true }).first().waitFor()
        await at(0.66)
        await page.getByText("Accueil des artistes", { exact: true }).first().scrollIntoViewIfNeeded()
      })
      await scene("change", async (at) => {
        await tap(page, page.getByRole("button", { name: "Liste" }))
        const row = page.locator("tr").filter({ hasText: "Accueil des artistes" })
        await row.scrollIntoViewIfNeeded()
        await at(0.34)
        await tap(page, row.getByRole("button", { name: "Modifier" }))
        await page.getByRole("heading", { name: "Modifier le créneau" }).waitFor()
        await at(0.70)
        await page.getByLabel("Lieu de rendez-vous").scrollIntoViewIfNeeded()
      })
      await scene("result", async (at) => {
        await page.getByLabel("Consigne pratique").scrollIntoViewIfNeeded()
        await at(0.62)
      })
    } else if (slug === "shifts-roles-views") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Une mission, plusieurs plages horaires", duration: 2_300 })
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
      })
      await scene("timeline", async (at) => {
        await page.getByRole("button", { name: "Timeline" }).scrollIntoViewIfNeeded()
        await at(0.40)
        await page.getByText("Buvette", { exact: true }).first().scrollIntoViewIfNeeded()
      })
      await scene("list", async (at) => {
        await at(0.24)
        await tap(page, page.getByRole("button", { name: "Liste" }))
        await at(0.58)
        await page.getByText("Accueil", { exact: true }).first().scrollIntoViewIfNeeded()
      })
      await scene("roles", async (at) => {
        await page.getByRole("button", { name: "Gérer les postes" }).scrollIntoViewIfNeeded()
        await at(0.22)
        await tap(page, page.getByRole("button", { name: "Gérer les postes" }))
        await page.getByRole("heading", { name: "Gérer les postes" }).waitFor()
        await at(0.58)
        const move = page.getByRole("button", { name: /Descendre le poste/ }).filter({ visible: true }).first()
        await tap(page, move)
      })
      await scene("colors", async (at) => {
        const color = page.getByRole("button", { name: /Changer la couleur du poste/ }).first()
        await color.scrollIntoViewIfNeeded()
        await at(0.32)
        await tap(page, color)
        const palette = page.getByRole("group", { name: /Couleur du poste/ })
        await at(0.58)
        await palette.scrollIntoViewIfNeeded()
        await tap(page, palette.getByRole("button", { name: "Indigo" }))
        await palette.waitFor({ state: "hidden" })
      })
      await scene("result", async (at) => {
        // Persist the reordered roles first. Saving closes the management panel; only then switch
        // the underlying schedule to Timeline, so the final frame actually demonstrates the view.
        await tap(page, page.getByRole("button", { name: "Enregistrer l'ordre" }))
        await page.getByRole("heading", { name: "Gérer les postes" }).waitFor({ state: "hidden" })
        const timeline = page.getByRole("button", { name: "Timeline" })
        await timeline.scrollIntoViewIfNeeded()
        await at(0.38)
        await tap(page, timeline)
        await page.getByText(/Cliquer \+ glisser sur un poste pour ajouter un créneau/).first().waitFor()
        if (await timeline.getAttribute("aria-pressed") !== "true") throw new Error("Timeline view was not selected")
        await at(0.72)
      })
    } else if (slug === "shift-waitlist-offer") {
      const waitlistShift = await page.evaluate(async (eventId) => {
        const response = await fetch(`/api/admin/events/${eventId}`)
        if (!response.ok) throw new Error(`Cannot load event: ${response.status}`)
        const event = await response.json()
        const shift = event.shifts.find((candidate: { roleName: string; startTime: string }) => candidate.roleName === "Buvette" && candidate.startTime === "14:00")
        if (!shift) throw new Error("Waitlist demonstration shift not found")
        return { id: shift.id, label: shift.label }
      }, featureEventId)

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Garder les personnes disponibles sans dépasser la capacité", duration: 2_300 })
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
      })

      await scene("setup", async (at) => {
        await tap(page, page.getByRole("button", { name: "Liste" }))
        const row = page.locator("tr").filter({ hasText: "Buvette" }).filter({ hasText: "14:00–18:00" }).first()
        await row.scrollIntoViewIfNeeded()
        await at(0.26)
        await tap(page, row.getByRole("button", { name: "Modifier" }))
        await page.getByRole("heading", { name: "Modifier le créneau" }).waitFor()
        await at(0.58)
        const capacity = page.getByLabel("Capacité *")
        await capacity.scrollIntoViewIfNeeded()
        await capacity.focus()
        await at(0.76)
        const waitlist = page.getByRole("checkbox", { name: /Activer la liste d'attente/ })
        if (!(await waitlist.isChecked())) throw new Error("Waitlist must be enabled in the demo data")
        await waitlist.scrollIntoViewIfNeeded()
      })

      await scene("admin", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations?shift=${encodeURIComponent(waitlistShift.id)}`); await settle(page)
        await page.getByRole("heading", { name: "Inscriptions" }).waitFor()
        await at(0.32)
        await page.getByText("Camille Rochat", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.62)
        await page.getByText("#1", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.78)
        await page.getByText("#3", { exact: true }).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Une place se libère", { description: "La première personne reçoit une offre de 24 heures", duration: 1_400 })
      await scene("release", async (at) => {
        await page.goto(`${baseUrl}/my/demo-waitlist-release-zoe-0001`); await settle(page)
        await page.getByRole("heading", { name: /Mes inscriptions/ }).waitFor()
        await at(0.28)
        await tap(page, page.getByRole("button", { name: `Annuler le créneau ${waitlistShift.label}` }))
        await page.getByRole("alertdialog").waitFor()
        await at(0.52)
        await tap(page, page.getByRole("button", { name: "Oui, annuler" }))
        await page.getByText(/annulée/i).first().waitFor()
        await at(0.78)
      })

      await scene("volunteer", async (at) => {
        await page.goto(`${baseUrl}/my/demo-waitlist-camille-0001`); await settle(page)
        await page.getByText("Une place t'est proposée", { exact: true }).waitFor()
        await at(0.26)
        await page.getByText(/Confirme avant/).scrollIntoViewIfNeeded()
        await at(0.58)
        await page.getByRole("link", { name: `Prendre la place : ${waitlistShift.label}` }).focus()
        await at(0.76)
        await page.getByRole("button", { name: `Refuser la place proposée sur le créneau ${waitlistShift.label}` }).focus()
      })

      await scene("expiry", async (at) => {
        await page.getByRole("heading", { name: "Liste d'attente : comment ça marche" }).scrollIntoViewIfNeeded()
        await at(0.34)
        await page.getByText(/Si tu ne réponds pas dans les 24 heures/).scrollIntoViewIfNeeded()
        await at(0.68)
        await page.getByText(/la place passe à la personne suivante/).last().scrollIntoViewIfNeeded()
      })

      await scene("result", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations?shift=${encodeURIComponent(waitlistShift.id)}`); await settle(page)
        await at(0.34)
        await page.getByText("Camille Rochat", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.62)
        await page.getByText("Place proposée", { exact: true }).scrollIntoViewIfNeeded()
      })
    } else if (slug === "shift-approval") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Décider avec les bonnes informations", duration: 2_300 })
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
      })

      await scene("setup", async (at) => {
        await tap(page, page.getByRole("button", { name: "Liste" }))
        const row = page.locator("tr").filter({ hasText: "Chauffeur navette" }).filter({ hasText: "08:00–12:00" }).first()
        await row.scrollIntoViewIfNeeded()
        await at(0.24)
        await tap(page, row.getByRole("button", { name: "Modifier" }))
        await page.getByRole("heading", { name: "Modifier le créneau" }).waitFor()
        await at(0.48)
        const approval = page.getByRole("checkbox", { name: /Sur validation/ })
        if (!(await approval.isChecked())) throw new Error("Approval must be enabled in the demo data")
        await approval.scrollIntoViewIfNeeded()
        await at(0.66)
        await page.getByLabel("Âge minimum (optionnel)").scrollIntoViewIfNeeded()
        await at(0.80)
        await page.getByLabel("Consigne pratique").scrollIntoViewIfNeeded()
      })

      await scene("request", async (at) => {
        await page.goto(`${baseUrl}/my/demo-approval-lucas-0001`); await settle(page)
        await page.getByRole("heading", { name: /Mes inscriptions/ }).waitFor()
        await at(0.30)
        await page.getByText("Demande envoyée · en attente de réponse", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.62)
        await page.getByText(/Créneau sur validation/).scrollIntoViewIfNeeded()
        await at(0.78)
        await page.getByRole("button", { name: /Retirer ma demande/ }).focus()
      })

      await page.screencast.showChapter("Examiner la candidature", { description: "Coordonnées, réponses et disponibilités", duration: 1_400 })
      await scene("admin", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations?demandes=1`); await settle(page)
        await page.getByRole("heading", { name: "Inscriptions" }).waitFor()
        await at(0.28)
        await page.getByText("Lucas Girard", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.58)
        await page.getByText(/permis B/i).first().scrollIntoViewIfNeeded()
        await at(0.78)
        await page.getByRole("button", { name: /Accepter la demande de Lucas Girard/ }).focus()
      })

      await scene("decision", async (at) => {
        await tap(page, page.getByRole("button", { name: /Refuser la demande de Lucas Girard/ }))
        await page.getByRole("heading", { name: "Refuser la demande de Lucas Girard ?" }).waitFor()
        await at(0.24)
        await page.getByLabel("Message à la personne (facultatif)").fill("Le permis doit être valable depuis trois ans.")
        await at(0.48)
        await tap(page, page.getByRole("button", { name: "Annuler" }))
        await at(0.62)
        await tap(page, page.getByRole("button", { name: /Accepter la demande de Lucas Girard/ }))
        await page.getByRole("heading", { name: "Accepter la demande de Lucas Girard ?" }).waitFor()
        await at(0.78)
        await tap(page, page.getByRole("button", { name: "Accepter", exact: true }))
        await page.getByText(/Demande de Lucas Girard acceptée/).waitFor()
      })

      await scene("volunteer", async (at) => {
        await page.goto(`${baseUrl}/my/demo-approval-lucas-0001`); await settle(page)
        await page.getByRole("heading", { name: /Mes inscriptions/ }).waitFor()
        await at(0.30)
        await page.getByText("Chauffeur navette", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.58)
        await page.getByRole("link", { name: /Ajouter à mon calendrier/ }).scrollIntoViewIfNeeded()
        await at(0.78)
        await page.getByText("Permis B depuis 3 ans", { exact: true }).scrollIntoViewIfNeeded()
      })

      await scene("result", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations?q=Lucas%20Girard`); await settle(page)
        await at(0.34)
        await page.getByText("Lucas Girard", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.64)
        const requests = page.getByText("Demande à traiter", { exact: true })
        if (await requests.count()) throw new Error("Lucas request should be confirmed")
      })
    } else if (slug === "shift-eligibility-rules") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Des règles simples, expliquées avant l’inscription", duration: 2_300 })
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
      })

      await scene("settings", async (at) => {
        await tap(page, page.getByRole("button", { name: "Liste" }))
        const evening = page.locator("tr").filter({ hasText: "Buvette" }).filter({ hasText: "18:00–22:00" }).first()
        await evening.scrollIntoViewIfNeeded()
        await at(0.18)
        await tap(page, evening.getByRole("button", { name: "Modifier" }))
        await page.getByRole("heading", { name: "Modifier le créneau" }).waitFor()
        await at(0.36)
        await page.getByLabel("Âge minimum (optionnel)").scrollIntoViewIfNeeded()
        await at(0.52)
        await tap(page, page.getByRole("button", { name: "Annuler" }))
        await tap(page, page.getByRole("button", { name: "Gérer les postes" }))
        await page.getByRole("heading", { name: "Gérer les postes" }).waitFor()
        await at(0.70)
        await page.getByRole("button", { name: /Limite : 2 créneaux par personne, poste « Buvette »/ }).scrollIntoViewIfNeeded()
        await at(0.84)
        await page.getByRole("button", { name: /Accès : sécurité, poste « Sécurité » réservé/ }).scrollIntoViewIfNeeded()
      })

      await scene("age", async (at) => {
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
        const evening = page.getByRole("button", { name: /Buvette.*18h–22h.*18 ans minimum/ })
        await evening.scrollIntoViewIfNeeded()
        await at(0.32)
        await evening.focus()
        await at(0.64)
        await page.getByText("18+", { exact: true }).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Limiter sans masquer", { description: "La règle et sa solution restent compréhensibles", duration: 1_400 })
      await scene("quota", async (at) => {
        await page.goto(`${baseUrl}/my/demo-waitlist-camille-0001`); await settle(page)
        await page.getByRole("heading", { name: /Mes inscriptions/ }).waitFor()
        await at(0.18)
        await page.getByRole("link", { name: "Retour à l'accueil" }).focus()
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
        const limited = page.getByRole("button", { name: /Buvette.*limite de 2 par personne atteinte/ }).first()
        await limited.waitFor()
        await limited.scrollIntoViewIfNeeded()
        await at(0.34)
        await limited.focus()
        await at(0.70)
      })

      await scene("reserved", async (at) => {
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
        const reserved = page.getByRole("button", { name: /Sécurité.*réservé à certains membres/ }).first()
        await reserved.waitFor()
        await reserved.scrollIntoViewIfNeeded()
        await at(0.30)
        await reserved.focus()
        await at(0.62)
        await page.getByText(/Les postes marqués « Réservé » sont réservés à certains membres/).scrollIntoViewIfNeeded()
      })

      await scene("eligible", async (at) => {
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}&token=demo-invite-julien-security-0001`); await settle(page)
        const security = page.getByRole("button", { name: /Sélectionner — Sécurité/ }).first()
        await security.waitFor()
        await security.scrollIntoViewIfNeeded()
        await at(0.34)
        await security.focus()
        await at(0.68)
        await tap(page, security)
      })

      await scene("result", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/edit`); await settle(page)
        const phone = page.getByRole("checkbox", { name: /Téléphone obligatoire/ })
        await phone.scrollIntoViewIfNeeded()
        if (!(await phone.isChecked())) throw new Error("Phone requirement must be enabled in the demo data")
        await at(0.36)
        await phone.focus()
        await at(0.70)
        await page.getByText(/Les bénévoles devront indiquer un numéro/).scrollIntoViewIfNeeded()
      })
    } else if (slug === "volunteer-discover-event") {
      await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Tout comprendre avant de choisir", duration: 2_300 })
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).waitFor()
      })

      await page.screencast.showChapter("Ouvrir la bonne page", { description: "Lien, QR code ou invitation personnelle", duration: 1_400 })
      await scene("access", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/qr`); await settle(page)
        await page.getByRole("heading", { name: "QR code", exact: true }).waitFor()
        await at(0.18)
        await page.getByAltText(/QR code vers/).scrollIntoViewIfNeeded()
        await at(0.58)
        await page.getByText("Scanner pour s'inscrire").scrollIntoViewIfNeeded()
        await at(0.78)
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
      })

      await scene("identity", async (at) => {
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).waitFor()
        await at(0.16)
        const map = page.getByRole("link", { name: /Voir sur la carte/ }).first()
        await map.scrollIntoViewIfNeeded()
        await map.focus()
        await at(0.42)
        await page.getByText(/Présentez-vous au stand d'accueil/).scrollIntoViewIfNeeded()
        await at(0.72)
        await page.getByText(/Deux jours de fête sur la place/).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Les informations pratiques", { description: "Tout retrouver sans fouiller ses messages", duration: 1_400 })
      await scene("pages", async (at) => {
        await tap(page, page.getByRole("link", { name: "Accès et parking" }))
        // In production the organization subdomain carries the tenant context. The local video
        // stack uses ?org= instead, which a relative public-page link cannot preserve by itself.
        await page.goto(`${baseUrl}/${eventSlug}/acces?org=${encodeURIComponent(org)}`); await settle(page)
        await page.getByRole("heading", { name: "Accès et parking" }).waitFor()
        await at(0.30)
        await page.getByRole("heading", { name: "En transports publics" }).scrollIntoViewIfNeeded()
        await at(0.52)
        await page.getByRole("heading", { name: "En voiture" }).scrollIntoViewIfNeeded()
        await at(0.68)
        await page.goto(`${baseUrl}/${eventSlug}/faq?org=${encodeURIComponent(org)}`); await settle(page)
        await page.getByRole("heading", { name: "Questions fréquentes" }).waitFor()
        await at(0.84)
      })

      await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
      await page.screencast.showChapter("Lire le planning", { description: "Journées, postes, capacités et programme", duration: 1_400 })
      await scene("desktop", async (at) => {
        const firstDay = page.getByRole("region", { name: /Planning de la journée/ }).first()
        await firstDay.scrollIntoViewIfNeeded()
        await at(0.22)
        await page.getByText(/Concert de la fanfare/).first().scrollIntoViewIfNeeded()
        await at(0.54)
        await page.getByText(/Bal populaire/).first().scrollIntoViewIfNeeded()
        await at(0.80)
        await page.getByText(/Brunch/).first().scrollIntoViewIfNeeded()
      })

      await scene("states", async (at) => {
        const full = page.getByRole("button", { name: /Rejoindre la file d'attente/ }).first()
        await full.scrollIntoViewIfNeeded()
        await full.focus()
        await at(0.24)
        const approval = page.getByRole("button", { name: /sur validation/ }).first()
        await approval.scrollIntoViewIfNeeded()
        await approval.focus()
        await at(0.50)
        const adult = page.getByRole("button", { name: /18 ans minimum/ }).first()
        await adult.scrollIntoViewIfNeeded()
        await adult.focus()
        await at(0.72)
        const reserved = page.getByRole("button", { name: /réservé à certains membres/ }).first()
        await reserved.scrollIntoViewIfNeeded()
        await reserved.focus()
      })

      await page.screencast.showChapter("Sur téléphone", { description: "Faire défiler sans perdre les détails", duration: 1_400 })
      await scene("mobile", async (at) => {
        await page.setViewportSize({ width: 390, height: 800 })
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
        const hint = page.getByText(/Faites défiler pour voir toutes les plages/).first()
        await hint.scrollIntoViewIfNeeded()
        await at(0.20)
        const timeline = page.getByRole("region", { name: /Planning de la journée/ }).first()
        await timeline.evaluate((element) => { element.scrollLeft = element.scrollWidth * 0.46 })
        await at(0.48)
        await timeline.evaluate((element) => { element.scrollLeft = element.scrollWidth })
        await at(0.70)
        await page.getByText(/Brunch/).first().scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Une invitation personnelle", { description: "Le bon accès, sans inscription automatique", duration: 1_400 })
      await scene("invitation", async (at) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}&token=demo-invite-julien-security-0001`); await settle(page)
        const security = page.getByRole("button", { name: /Sélectionner — Sécurité/ }).first()
        await security.scrollIntoViewIfNeeded()
        await at(0.24)
        await security.focus()
        await at(0.56)
        await tap(page, security)
        await page.getByRole("button", { name: /Désélectionner — Sécurité/ }).waitFor()
      })

      await scene("result", async (at) => {
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).scrollIntoViewIfNeeded()
        await at(0.28)
        await page.getByRole("link", { name: /Voir sur la carte/ }).first().scrollIntoViewIfNeeded()
        await at(0.60)
        await page.getByRole("link", { name: "Accès et parking" }).scrollIntoViewIfNeeded()
      })
    } else if (slug === "event-archive-delete") {
      const disposableTitle = "Ancienne fête de Montvert — copie de démonstration"
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/duplicate`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Conserver l’historique ou effacer une édition", duration: 2_300 })
        await page.getByRole("heading", { name: "Dupliquer l'événement" }).waitFor()
      })

      let disposableId = ""
      await scene("prepare", async (at) => {
        const title = page.getByLabel("Titre de la copie")
        await title.fill(disposableTitle)
        await at(0.42)
        await page.getByRole("heading", { name: "Ce que vous allez créer" }).scrollIntoViewIfNeeded()
        await at(0.70)
        await tap(page, page.getByRole("button", { name: "Créer la copie" }))
        await page.waitForURL(/\/admin\/events\/[^/]+$/)
        disposableId = new URL(page.url()).pathname.split("/").at(-1) ?? ""
        await page.getByRole("heading", { name: disposableTitle }).waitFor()
      })

      await scene("archive", async (at) => {
        await at(0.28)
        await tap(page, page.getByRole("button", { name: "Archiver" }))
        await page.getByRole("alertdialog").waitFor()
        await at(0.58)
        await tap(page, page.getByRole("button", { name: "Confirmer" }))
        await page.getByText("Archivé", { exact: true }).first().waitFor()
      })

      await scene("delete-open", async (at) => {
        await page.getByRole("heading", { name: "Suppression définitive" }).scrollIntoViewIfNeeded()
        await at(0.38)
        await tap(page, page.getByRole("button", { name: "Supprimer l'événement…" }))
        await page.getByRole("heading", { name: "Supprimer définitivement cet événement ?" }).waitFor()
        await at(0.72)
        await page.getByText("Action irréversible").scrollIntoViewIfNeeded()
      })

      await scene("backup", async (at) => {
        const backup = page.getByRole("link", { name: /Ouvrir l'export PDF/ })
        await backup.scrollIntoViewIfNeeded()
        await at(0.48)
        await backup.focus()
      })

      await scene("confirm", async (at) => {
        const confirm = page.getByLabel(/Pour confirmer, saisissez le titre/)
        await confirm.scrollIntoViewIfNeeded()
        await at(0.34)
        await confirm.fill(disposableTitle)
        await page.getByText("Le titre correspond. Vous pouvez supprimer.").waitFor()
        await at(0.70)
        await tap(page, page.getByRole("button", { name: "Supprimer définitivement" }))
        await page.getByRole("heading", { name: "Événements" }).waitFor()
      })

      await scene("result", async (at) => {
        await page.getByRole("heading", { name: "Événements" }).waitFor()
        await at(0.52)
        if (await page.getByText(disposableTitle, { exact: true }).count()) throw new Error(`Disposable event ${disposableId} was not deleted`)
      })
    } else if (slug === "event-milestones") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Les échéances essentielles, au même endroit", duration: 2_300 })
        await page.getByRole("heading", { name: "Jalons" }).waitFor()
      })

      await scene("create", async (at) => {
        await page.getByRole("heading", { name: "Jalons" }).scrollIntoViewIfNeeded()
        await at(0.26)
        await tap(page, page.getByRole("button", { name: "+ Ajouter un jalon" }))
        await at(0.48)
        await page.getByLabel("Titre *").fill("Fermer les inscriptions")
        await at(0.68)
        const due = new Date(); due.setDate(due.getDate() + 8)
        await page.getByLabel("Échéance *").fill(due.toISOString().slice(0, 10))
        await at(0.84)
        await tap(page, page.getByRole("button", { name: "Ajouter" }))
        await page.getByText("Fermer les inscriptions", { exact: true }).first().waitFor()
      })

      await scene("states", async (at) => {
        await page.getByRole("heading", { name: "Jalons" }).scrollIntoViewIfNeeded()
        await at(0.56)
        await page.getByText("Fermer les inscriptions", { exact: true }).first().scrollIntoViewIfNeeded()
      })

      await scene("toggle", async (at) => {
        const checkbox = page.getByRole("checkbox", { name: "Fermer les inscriptions", exact: true }).first()
        await at(0.28)
        await tap(page, checkbox)
        await at(0.58)
        await tap(page, checkbox)
      })

      await scene("dashboard", async (at) => {
        await page.goto(`${baseUrl}/admin/events`); await settle(page)
        await at(0.42)
        await page.getByRole("link", { name: "Fête du village de Montvert" }).first().scrollIntoViewIfNeeded()
      })

      await scene("result", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}`); await settle(page)
        await page.getByText("Fermer les inscriptions", { exact: true }).first().scrollIntoViewIfNeeded()
        await at(0.62)
      })
    } else if (slug === "event-program-pages-qr") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/edit`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Informer, orienter et partager", duration: 2_300 })
        await page.getByRole("heading", { name: "Modifier l'événement" }).waitFor()
      })

      await scene("program", async (at) => {
        await page.getByText("Spectacles", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.38)
        const add = page.getByRole("button", { name: "+ Ajouter" })
        if (await add.isVisible()) await tap(page, add)
        await at(0.62)
        const name = page.getByPlaceholder("Nom du spectacle")
        if (await name.isVisible()) {
          await name.fill("Concert de clôture")
          const times = page.locator('input[type="time"]')
          await times.nth((await times.count()) - 2).fill("23:30")
          await times.nth((await times.count()) - 1).fill("01:00")
        }
      })

      await scene("pages", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/pages`); await settle(page)
        await page.getByRole("heading", { name: "Pages" }).waitFor()
        await at(0.22)
        const faqRow = page.getByRole("listitem").filter({ hasText: "Questions fréquentes" }).first()
        await tap(page, faqRow.getByRole("button", { name: "Modifier" }))
        await page.getByRole("heading", { name: "Modifier la page" }).waitFor()
        await at(0.44)
        await page.getByLabel("Titre *").focus()
        await at(0.64)
        await page.getByLabel(/Contenu/).fill("# Questions fréquentes\n\n**Où se garer ?** Parking nord.\n\n**Que prendre ?** Une gourde et des chaussures fermées.")
        await at(0.72)
        await tap(page, page.getByRole("button", { name: "Enregistrer" }))
        await page.getByText("Questions fréquentes", { exact: true }).first().waitFor()
      })

      await scene("public", async (at) => {
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
        await at(0.34)
        await page.getByRole("heading", { level: 1, name: "Fête du village de Montvert" }).scrollIntoViewIfNeeded()
        await at(0.62)
        await page.getByRole("button", { name: /Sélectionner — Accueil 15h–18h/ }).scrollIntoViewIfNeeded()
      })

      await scene("qr", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/qr`); await settle(page)
        await page.getByRole("heading", { name: "QR code" }).waitFor()
        await at(0.34)
        await page.getByRole("link", { name: "Télécharger PNG" }).scrollIntoViewIfNeeded()
        await at(0.58)
        await page.getByRole("link", { name: "Télécharger SVG" }).focus()
        await at(0.78)
        await page.getByRole("button", { name: "Imprimer" }).focus()
      })

      await scene("result", async (at) => {
        await page.getByAltText(/QR code vers/).scrollIntoViewIfNeeded()
        await at(0.62)
        await page.getByText("Scanner pour s'inscrire").scrollIntoViewIfNeeded()
      })
    } else if (slug === "event-duplicate") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/duplicate`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Reprendre la structure, jamais les engagements", duration: 2_300 })
        await page.getByRole("heading", { name: /Dupliquer/ }).waitFor()
      })

      await scene("identity", async (at) => {
        const title = page.getByLabel("Titre de la copie")
        await title.scrollIntoViewIfNeeded()
        await at(0.18)
        await tap(page, title); await title.fill("Fête du village de Montvert 2027")
        const source = await page.getByLabel("Premier jour de la copie").inputValue()
        const next = new Date(`${source}T00:00:00Z`); next.setUTCFullYear(next.getUTCFullYear() + 1)
        await fillVisibly(page, page.getByLabel("Premier jour de la copie"), next.toISOString().slice(0, 10), 1_100)
        await page.getByLabel("Premier jour de la copie").blur()
        await at(0.70)
        await page.getByText(/Toutes les dates.*décalées/).first().scrollIntoViewIfNeeded()
      })

      await scene("choices", async (at) => {
        await page.getByRole("group", { name: "Ce qui est copié" }).scrollIntoViewIfNeeded()
        await at(0.22)
        await page.getByRole("checkbox", { name: "Les créneaux" }).hover()
        await at(0.48)
        await page.getByRole("checkbox", { name: "Les messages et réglages d'inscription" }).hover()
        await at(0.72)
        await page.getByRole("checkbox", { name: "Les pages personnalisées" }).hover()
      })

      await scene("leaders", async (at) => {
        const leaders = page.getByRole("checkbox", { name: "Les responsables de secteur" })
        await leaders.scrollIntoViewIfNeeded()
        await at(0.42)
        await tap(page, leaders)
        await at(0.72)
        await page.getByText(/chacun reçoit tout de suite un email/).scrollIntoViewIfNeeded()
      })

      await scene("summary", async (at) => {
        await page.getByRole("heading", { name: "Ce que vous allez créer" }).scrollIntoViewIfNeeded()
        await at(0.48)
        await page.getByText(/Les inscriptions et les jalons ne sont jamais copiés/).scrollIntoViewIfNeeded()
      })

      let copyId = ""
      await scene("create", async (at) => {
        await at(0.16)
        await tap(page, page.getByRole("button", { name: "Créer la copie" }))
        await page.waitForURL(/\/admin\/events\/[^/]+$/)
        copyId = new URL(page.url()).pathname.split("/").at(-1) ?? ""
        await page.getByRole("heading", { name: "Fête du village de Montvert 2027" }).waitFor()
        await at(0.54)
        await page.getByText(/Brouillon/).first().scrollIntoViewIfNeeded()
        await at(0.78)
        await page.goto(`${baseUrl}/admin/events/${copyId}/edit`); await settle(page)
        await page.getByRole("checkbox", { name: "Inscriptions ouvertes" }).scrollIntoViewIfNeeded()
      })

      await scene("result", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${copyId}/shifts`); await settle(page)
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
        await at(0.46)
        await page.getByText("Buvette", { exact: true }).first().scrollIntoViewIfNeeded()
      })
    } else if (slug === "event-visibility-registration-window") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/edit`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Qui voit la page, et quand peut-on s’inscrire ?", duration: 2_300 })
        await page.getByRole("heading", { name: "Modifier l'événement" }).waitFor()
      })

      await scene("statuses", async (at) => {
        const status = page.getByLabel("Statut")
        await status.scrollIntoViewIfNeeded()
        await at(0.22)
        await status.selectOption("draft")
        await page.getByText("Enregistré ✓").waitFor({ timeout: 10_000 })
        await at(0.52)
        await status.selectOption("published")
        await page.getByText("Enregistré ✓").waitFor({ timeout: 10_000 })
        await at(0.76)
        await page.getByText(/Un événement ne peut être publié qu'avec au moins un créneau/).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Partager uniquement par lien", { description: "Publié, mais absent de la liste publique", duration: 1_400 })
      await scene("unlisted", async (at) => {
        const listed = page.getByRole("checkbox", { name: /Afficher cet événement sur la page publique/ })
        await listed.scrollIntoViewIfNeeded()
        await at(0.30)
        if (await listed.isChecked()) await tap(page, listed)
        await page.getByText("Enregistré ✓").waitFor({ timeout: 10_000 })
        await at(0.64)
        await page.getByText(/Accessible uniquement par lien direct/i).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Programmer les inscriptions", { description: "La page reste visible avant l’ouverture", duration: 1_400 })
      await scene("window", async (at) => {
        const open = page.getByLabel("Ouverture programmée (facultatif)")
        await open.scrollIntoViewIfNeeded()
        const now = new Date()
        const local = (days: number) => {
          const value = new Date(now.getTime() + days * 86_400_000)
          const pad = (n: number) => String(n).padStart(2, "0")
          return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T09:00`
        }
        await at(0.18)
        await fillVisibly(page, open, local(2), 1_000)
        await fillVisibly(page, page.getByLabel("Fermeture programmée (facultatif)"), local(5), 1_000)
        await page.getByText("Enregistré ✓").waitFor({ timeout: 10_000 })
        await at(0.72)
        await page.getByText(/Heures du fuseau de l'organisation/).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
      await scene("public-result", async (at) => {
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).waitFor()
        await at(0.30)
        await page.getByText(/inscriptions ouvrent le/i).scrollIntoViewIfNeeded()
        await at(0.68)
        await page.getByText("Place du Collège, Montvert").first().scrollIntoViewIfNeeded()
      })

      await scene("archive", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/edit`); await settle(page)
        const status = page.getByLabel("Statut")
        await status.scrollIntoViewIfNeeded()
        await at(0.34)
        await status.selectOption("archived")
        await page.getByText("Enregistré ✓").waitFor({ timeout: 10_000 })
        await at(0.70)
        await page.goto(`${baseUrl}/admin/events`); await settle(page)
      })

      await scene("result", async (at) => {
        await page.getByRole("heading", { name: "Événements" }).waitFor()
        await at(0.44)
        await page.getByRole("link", { name: "Fête du village de Montvert" }).first().scrollIntoViewIfNeeded()
      })
    } else if (slug === "event-review-publish") {
      await page.evaluate(async (eventId) => {
        const response = await fetch(`/api/admin/events/${eventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicStatus: "draft" }),
        })
        if (!response.ok) throw new Error(`Cannot prepare draft: ${response.status}`)
      }, featureEventId)
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/review`); await settle(page)

      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Tester le parcours avant de l’ouvrir", duration: 2_300 })
        await page.getByRole("heading", { name: "Vérification" }).waitFor()
      })

      await scene("checks", async (at) => {
        const checks = page.getByRole("list").first()
        await checks.scrollIntoViewIfNeeded()
        await at(0.34)
        await checks.getByText(/créneaux/).first().scrollIntoViewIfNeeded()
        await at(0.66)
        const optional = checks.getByText(/Facultatif/).first()
        if (await optional.isVisible()) await optional.scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Le parcours bénévole complet", { description: "Une simulation sans inscription réelle", duration: 1_400 })
      await scene("preview-start", async (at) => {
        await tap(page, page.getByRole("link", { name: "Prévisualiser comme un bénévole" }))
        await page.waitForURL(/\/preview$/)
        await page.getByText(/Aperçu : la page telle que la verront les bénévoles/).waitFor()
        await at(0.42)
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).scrollIntoViewIfNeeded()
        await at(0.72)
        await page.getByText("Place du Collège, Montvert").first().scrollIntoViewIfNeeded()
      })

      await scene("preview-form", async (at) => {
        await tap(page, page.getByRole("button", { name: /Sélectionner — Accueil 09h–12h/ }))
        await at(0.24)
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        await page.getByRole("heading", { name: "Vos informations" }).waitFor()
        await at(0.58)
        await page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).scrollIntoViewIfNeeded()
      })

      await scene("preview-result", async (at) => {
        await typeNaturally(page, page.getByRole("textbox", { name: "Prénom *", exact: true }), "Alex")
        await typeNaturally(page, page.getByRole("textbox", { name: "Nom *", exact: true }), "Martin")
        await typeNaturally(page, page.getByRole("textbox", { name: "Email *", exact: true }), "alex.preview@example.org")
        await typeNaturally(page, page.getByRole("textbox", { name: /Téléphone \*/, exact: true }), "079 000 12 34")
        await tap(page, page.getByRole("radio", { name: "M", exact: true }))
        await at(0.48)
        await tap(page, page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox"))
        await tap(page, page.locator("label").filter({ hasText: "J'accepte que mes données" }).getByRole("checkbox"))
        await tap(page, page.getByRole("button", { name: "Voir la confirmation (aperçu)" }))
        await page.getByRole("heading", { name: /Aperçu de la confirmation/ }).waitFor()
        await at(0.76)
        await page.getByRole("heading", { name: /Email de confirmation/ }).scrollIntoViewIfNeeded()
      })

      await scene("publish", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/review`); await settle(page)
        await page.getByRole("heading", { name: "Publication" }).scrollIntoViewIfNeeded()
        await at(0.40)
        await tap(page, page.getByRole("button", { name: "Publier" }))
        await page.getByText("L'événement est publié : les bénévoles peuvent s'inscrire.").waitFor()
        await at(0.76)
        await page.getByText(/Lien à partager/).scrollIntoViewIfNeeded()
      })

      await scene("result", async (at) => {
        await page.getByRole("heading", { name: "Publication" }).scrollIntoViewIfNeeded()
        await at(0.36)
        await page.getByRole("link", { name: "QR code" }).scrollIntoViewIfNeeded()
        await at(0.66)
        await page.getByRole("link", { name: "Inviter des membres" }).scrollIntoViewIfNeeded()
      })
    } else if (slug === "event-create-template") {
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Une base prête à adapter", duration: 2_300 })
        await tap(page, page.getByRole("link", { name: "+ Nouvel événement" }))
        await page.getByRole("heading", { name: "Nouvel événement" }).waitFor()
      })

      await page.screencast.showChapter("Choisir le bon point de départ", { description: "Cinq structures courantes ou une page blanche", duration: 1_400 })
      await scene("compare", async (at) => {
        await tap(page, page.getByRole("radio", { name: /Festival sur plusieurs jours/ }))
        await at(0.24)
        await tap(page, page.getByRole("radio", { name: /^Buvette/ }))
        await at(0.42)
        await tap(page, page.getByRole("radio", { name: /Manifestation sportive/ }))
        await at(0.60)
        await tap(page, page.getByRole("radio", { name: /Montage, exploitation, démontage/ }))
        await at(0.78)
        await tap(page, page.getByRole("radio", { name: /Fête de village/ }))
      })

      await scene("preview", async (at) => {
        await page.getByRole("heading", { name: "Fête de village", exact: true }).scrollIntoViewIfNeeded()
        await at(0.20)
        await page.getByRole("heading", { name: "Ce qui sera créé" }).scrollIntoViewIfNeeded()
        await at(0.44)
        await fillVisibly(page, page.getByLabel("Titre"), "Fête villageoise de Bellevue", 1_000)
        await fillVisibly(page, page.getByLabel(/Premier jour/), "2031-07-05", 1_100)
        await at(0.78)
        await page.getByText(/Brouillon, non publié/).scrollIntoViewIfNeeded()
      })

      await scene("create", async (at) => {
        await at(0.14)
        await tap(page, page.getByRole("button", { name: /Créer le brouillon \(10 créneaux\)/ }))
        await page.waitForURL(/\/admin\/events\/[^/]+\/shifts\?wizard=1$/)
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
        await at(0.48)
        await page.getByRole("navigation", { name: "Étapes de création de l'événement" }).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Adapter le planning", { description: "Chaque créneau reste entièrement modifiable", duration: 1_400 })
      await scene("adapt", async (at) => {
        await page.getByRole("button", { name: "Liste" }).click()
        const row = page.getByRole("row").filter({ hasText: "Buvette" }).first()
        await row.scrollIntoViewIfNeeded()
        await at(0.28)
        await tap(page, row.getByRole("button", { name: "Modifier" }))
        const editor = page.getByRole("group", { name: "Modifier le créneau" })
        await editor.waitFor()
        await at(0.52)
        const capacity = editor.getByLabel("Capacité *")
        await tap(page, capacity)
        await capacity.fill("5")
        await at(0.76)
        await tap(page, editor.getByRole("button", { name: "Enregistrer", exact: true }))
        await page.getByRole("status").filter({ hasText: /Créneau modifié/ }).waitFor()
      })

      await scene("result", async () => {
        await page.screencast.showChapter("Un départ rapide, un planning maîtrisé", { description: "Le modèle propose, l’équipe décide", duration: 2_300 })
      })
    } else if (slug === "event-create-blank") {
      let createdEventId = ""
      await scene("welcome", async (at) => {
        await page.screencast.showChapter(manifest.title, { description: "Un brouillon complet, sans modèle imposé", duration: 2_300 })
        await tap(page, page.getByRole("link", { name: "+ Nouvel événement" }))
        await page.getByRole("heading", { name: "Nouvel événement" }).waitFor()
        await at(0.48)
        await tap(page, page.getByRole("radio", { name: /Page blanche/ }))
      })

      await page.screencast.showChapter("L’identité et les dates", { description: "Le cadre réel de la manifestation", duration: 1_400 })
      await scene("identity-dates", async (at) => {
        await typeNaturally(page, page.getByLabel("Titre *"), "Fête du quartier des Tilleuls")
        await fillVisibly(page, page.getByLabel("Description"), "Deux jours de rencontres, de musique et de repas partagés avec les habitantes et habitants du quartier.", 1_200)
        await at(0.48)
        await fillVisibly(page, page.getByLabel("Date début *"), "2031-06-14", 1_100)
        await fillVisibly(page, page.getByLabel("Date fin *"), "2031-06-15", 1_100)
      })

      await scene("location", async (at) => {
        await fillVisibly(page, page.getByLabel("Lieu"), "Maison de quartier, 12 avenue des Tilleuls, Montvert", 1_200)
        await at(0.32)
        await typeNaturally(page, page.getByLabel("Coordonnées GPS ou lien de carte"), "46.180573, 6.122829")
        await at(0.72)
        await page.getByRole("link", { name: /Vérifier sur la carte/ }).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Ce que verra le bénévole", { description: "Des consignes et une confirmation utiles", duration: 1_400 })
      await scene("public-content", async (at) => {
        const instructions = page.getByText("Instructions publiques", { exact: true }).locator("xpath=following-sibling::textarea")
        await fillVisibly(page, instructions, "Entre par la cour nord et présente-toi à l’accueil quinze minutes avant ton premier créneau.", 1_200)
        await at(0.48)
        const confirmation = page.getByText("Message de confirmation", { exact: true }).locator("xpath=following-sibling::textarea")
        await fillVisibly(page, confirmation, "Merci {{prenom}} ! Ton créneau {{créneau}} est bien réservé. Toutes les informations pratiques suivront par email.", 1_200)
        await at(0.78)
        await page.getByText(/Supporte le \*\*gras\*\*/).scrollIntoViewIfNeeded()
      })

      await scene("phone-color", async (at) => {
        const phone = page.getByRole("checkbox", { name: "Téléphone obligatoire à l'inscription" })
        await phone.scrollIntoViewIfNeeded()
        await at(0.20)
        await tap(page, phone)
        await at(0.52)
        await tap(page, page.getByRole("radio", { name: /Émeraude/ }))
        await at(0.76)
        await page.getByText("Aperçu de l'en-tête").scrollIntoViewIfNeeded()
      })

      await scene("create", async (at) => {
        await at(0.14)
        await tap(page, page.getByRole("button", { name: "Créer l'événement" }))
        await page.waitForURL(/\/admin\/events\/[^/]+\/shifts\?wizard=1$/)
        createdEventId = new URL(page.url()).pathname.split("/")[3]
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
        await at(0.56)
        await page.getByRole("navigation", { name: "Étapes de création de l'événement" }).scrollIntoViewIfNeeded()
      })

      await scene("autosave", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${createdEventId}/edit`); await settle(page)
        const description = page.getByLabel("Description")
        await description.scrollIntoViewIfNeeded()
        await at(0.48)
        await tap(page, description)
        await description.fill("Deux jours de rencontres, de musique, de repas partagés et d’activités pour les familles du quartier.")
        await page.getByText("Enregistré ✓").waitFor({ timeout: 10_000 })
      })

      await scene("result", async (at) => {
        await page.getByLabel("Statut").scrollIntoViewIfNeeded()
        await at(0.48)
        await page.getByText(/Un événement ne peut être publié qu'avec au moins un créneau/).scrollIntoViewIfNeeded()
        await at(0.74)
        await page.goto(`${baseUrl}/admin/events`); await settle(page)
        await page.getByRole("link", { name: "Fête du quartier des Tilleuls", exact: true }).scrollIntoViewIfNeeded()
      })
    } else if (slug === "org-team-permissions") {
      await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
      await scene("welcome", async (at) => {
        await page.screencast.showChapter(manifest.title, { description: "Le bon accès pour chaque personne", duration: 2_300 })
        await page.getByRole("heading", { name: /^Administrateurs/ }).waitFor()
        await at(0.48)
        await page.getByText("Samira Diallo", { exact: true }).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Deux rôles complémentaires", { description: "Protéger les réglages sans bloquer l’équipe", duration: 1_400 })
      await scene("roles", async (at) => {
        await at(0.12)
        await tap(page, page.getByRole("button", { name: "Inviter" }))
        await page.getByRole("heading", { name: "Inviter un administrateur" }).waitFor()
        await at(0.34)
        await page.getByText(/Tous les droits, dont l'équipe/).scrollIntoViewIfNeeded()
        await at(0.66)
        await page.getByText(/Événements, créneaux, inscriptions/).scrollIntoViewIfNeeded()
      })

      await scene("invite", async (at) => {
        const form = page.getByRole("heading", { name: "Inviter un administrateur" }).locator("xpath=ancestor::form")
        await typeNaturally(page, form.getByLabel("Nom"), "Léa Martin")
        await typeNaturally(page, form.getByLabel("Email"), "lea.pending@example.org")
        await at(0.62)
        await tap(page, form.getByRole("radio", { name: /Organisateur/ }))
        await at(0.78)
        await tap(page, form.getByRole("button", { name: "Envoyer l'invitation" }))
        await page.getByText("Invitation envoyée à lea.pending@example.org.").waitFor()
      })

      await scene("invite-result", async (at) => {
        await page.getByRole("heading", { name: "Lien d'invitation créé" }).scrollIntoViewIfNeeded()
        await at(0.42)
        await tap(page, page.getByRole("button", { name: "Copier le lien" }))
        await page.getByText("Un email a été envoyé. Ce lien expire dans 7 jours.").scrollIntoViewIfNeeded()
        await at(0.72)
        await page.getByText("Léa Martin", { exact: true }).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Faire évoluer un rôle", { description: "Choisir, puis confirmer explicitement", duration: 1_400 })
      await scene("change-role", async (at) => {
        const row = page.locator("div.px-4.py-3").filter({ hasText: "Léa Martin" })
        const role = row.getByLabel("Rôle de Léa Martin")
        await role.scrollIntoViewIfNeeded()
        await at(0.20)
        await role.selectOption("admin")
        await at(0.46)
        await tap(page, row.getByRole("button", { name: /Appliquer/ }))
        await page.getByRole("status").filter({ hasText: /Léa Martin : propriétaire/ }).waitFor()
        await at(0.74)
        await page.getByText("Léa Martin", { exact: true }).scrollIntoViewIfNeeded()
      })

      await scene("organizer-view", async (at) => {
        await page.context().clearCookies()
        await page.goto(`${baseUrl}/admin/login`); await settle(page)
        await typeNaturally(page, page.getByLabel("Email"), "sam.organizer@example.org")
        await typeNaturally(page, page.getByLabel("Mot de passe"), process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
        await tap(page, page.getByRole("button", { name: "Se connecter" }))
        await page.waitForURL(/\/admin\/events/)
        await at(0.48)
        await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
        await page.getByText(/Votre rôle : organisateur\. Seuls les propriétaires/).waitFor()
        await at(0.76)
        await page.getByText(/Seuls les propriétaires invitent/).scrollIntoViewIfNeeded()
      })

      await scene("limits", async (at) => {
        await page.getByText(/Votre rôle : organisateur\. Seuls les propriétaires/).scrollIntoViewIfNeeded()
        await at(0.48)
        await page.goto(`${baseUrl}/admin/events`); await settle(page)
        await page.getByRole("heading", { name: "Événements" }).waitFor()
        await at(0.74)
        await page.getByRole("link", { name: "Fête du village de Montvert" }).first().scrollIntoViewIfNeeded()
      })

      await scene("result", async () => {
        await page.screencast.showChapter("Une équipe autonome et maîtrisée", { description: "Des comptes nominatifs, des droits adaptés", duration: 2_300 })
      })
    } else if (slug === "org-email-settings") {
      await page.goto(`${baseUrl}/admin/settings/notifications`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Rappels, alertes et réponses", duration: 2_300 })
        await page.getByRole("heading", { name: "Réglages des emails" }).waitFor()
      })

      await page.screencast.showChapter("Les rappels automatiques", { description: "Choisir les moments vraiment utiles", duration: 1_400 })
      await scene("reminders", async (at) => {
        const group = page.getByRole("group", { name: "Rappels automatiques aux bénévoles inscrits" })
        await group.scrollIntoViewIfNeeded()
        await at(0.18)
        const j2 = page.getByRole("checkbox", { name: /Rappel J-2/ })
        if (await j2.isChecked()) await tap(page, j2)
        await at(0.46)
        await tap(page, j2)
        await at(0.70)
        await page.getByText(/un événement peut en plus couper tous ses rappels/).scrollIntoViewIfNeeded()
      })

      await scene("admin-alert", async (at) => {
        const alert = page.getByRole("checkbox", { name: /Prévenir les administrateurs/ })
        await alert.scrollIntoViewIfNeeded()
        await at(0.30)
        if (await alert.isChecked()) await tap(page, alert)
        await at(0.62)
        await tap(page, alert)
      })

      await page.screencast.showChapter("Les réponses", { description: "Une adresse suivie par l’association", duration: 1_400 })
      await scene("reply-to", async (at) => {
        const replyTo = page.getByLabel("Adresse de réponse")
        await replyTo.scrollIntoViewIfNeeded()
        await at(0.22)
        await tap(page, replyTo)
        await replyTo.fill("")
        await replyTo.pressSequentially("benevoles@example.org", { delay: 115 })
        await at(0.72)
        await page.getByText(/Cette adresse figure aussi sur la page personnelle/).scrollIntoViewIfNeeded()
      })

      await scene("save", async (at) => {
        await at(0.14)
        await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true }))
        await page.getByRole("status").filter({ hasText: "Réglages enregistrés." }).waitFor()
        await at(0.52)
        await page.getByRole("status").filter({ hasText: "Réglages enregistrés." }).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Tester avant d’envoyer", { description: "Contrôler le transport et l’expéditeur", duration: 1_400 })
      await scene("test", async (at) => {
        const testButton = page.getByRole("button", { name: "M'envoyer un email de test" })
        await testButton.scrollIntoViewIfNeeded()
        await at(0.18)
        await tap(page, testButton)
        await page.getByRole("status").filter({ hasText: /Email de test envoyé/ }).waitFor()
        await at(0.54)
        await page.goto("http://localhost:48026"); await settle(page)
        await page.getByText("Email de test", { exact: false }).first().waitFor()
      })

      await scene("result", async (at) => {
        await at(0.44)
        await page.goto(`${baseUrl}/admin/settings/notifications`); await settle(page)
        await page.getByRole("heading", { name: "Réglages des emails" }).waitFor()
        await at(0.72)
        await page.getByLabel("Adresse de réponse").scrollIntoViewIfNeeded()
      })
    } else if (slug === "organizer-create-publish") {
      let organizerEventId = ""
      let organizerPublicUrl = ""

      await scene("overview", async () => {
        await page.screencast.showChapter(manifest.title, { description: "De l’idée à la page d’inscription", duration: 2_300 })
        await tap(page, page.getByRole("link", { name: "+ Nouvel événement" }))
        await page.getByRole("heading", { name: "Nouvel événement" }).waitFor()
        await page.getByText("Comment commencer ?").scrollIntoViewIfNeeded()
        await page.waitForTimeout(1_200)
        await tap(page, page.getByRole("radio", { name: /Page blanche/ }))
      })

      await scene("basics", async () => {
        await typeNaturally(page, page.getByLabel("Titre *"), "Fête des voisins")
        await typeNaturally(page, page.getByLabel("Description"), "Une journée conviviale organisée par le quartier.")
        await typeNaturally(page, page.getByLabel("Lieu"), "Place du village, Montvert")
        await fillVisibly(page, page.getByLabel("Date début *"), "2031-05-10", 1_100)
        await fillVisibly(page, page.getByLabel("Date fin *"), "2031-05-10", 1_100)
        const create = page.getByRole("button", { name: "Créer l'événement" })
        await create.scrollIntoViewIfNeeded()
        await tap(page, create)
        await page.waitForURL(/\/admin\/events\/[^/]+\/shifts\?wizard=1$/)
        organizerEventId = new URL(page.url()).pathname.split("/")[3]
      })

      await scene("series", async () => {
        await tap(page, page.getByRole("button", { name: "Créer une série" }))
        const series = page.getByRole("region", { name: "Créer une série de créneaux" })
        await typeNaturally(page, series.getByLabel("Poste *"), "Accueil")
        await fillVisibly(page, series.getByLabel("Début *"), "10:00", 1_100)
        await fillVisibly(page, series.getByLabel("Fin *"), "14:00", 1_100)
        await series.getByRole("button", { name: /^Créer 2 créneaux$/ }).scrollIntoViewIfNeeded()
        await page.waitForTimeout(1_000)
        await tap(page, series.getByRole("button", { name: /^Créer 2 créneaux$/ }))
        await page.getByRole("status").filter({ hasText: /2 créneaux créés/ }).waitFor()
      })

      await scene("delivery", async () => {
        await tap(page, page.getByRole("button", { name: "+ Ajouter un créneau" }))
        const editor = page.getByRole("group", { name: "Nouveau créneau" })
        await typeNaturally(page, editor.getByLabel("Poste *"), "Livraison")
        await fillVisibly(page, editor.getByLabel("Libellé"), "Livraison — permis B requis")
        await fillVisibly(page, editor.getByLabel("Début *"), "09:00", 1_000)
        await fillVisibly(page, editor.getByLabel("Fin *"), "12:00", 1_000)
        await fillVisibly(page, editor.getByLabel("Âge minimum (optionnel)"), "18", 1_000)
        await fillVisibly(page, editor.getByLabel("Description"), "Permis B valide obligatoire")
        await fillVisibly(page, editor.getByLabel("Consigne pratique"), "Permis de conduire valide obligatoire. Véhicule fourni.", 1_200)
        await tap(page, editor.getByRole("button", { name: "Ajouter", exact: true }))
        await page.getByRole("status").filter({ hasText: /Créneau ajouté : Livraison/ }).waitFor()
      })

      await scene("cash", async () => {
        await tap(page, page.getByRole("button", { name: "+ Ajouter un créneau" }))
        const editor = page.getByRole("group", { name: "Nouveau créneau" })
        await typeNaturally(page, editor.getByLabel("Poste *"), "Caisse")
        await editor.getByLabel("Libellé").fill("Gestion de la caisse")
        await editor.getByLabel("Début *").fill("12:00")
        await editor.getByLabel("Fin *").fill("16:00")
        await editor.getByLabel("Description").fill("Encaissements et clôture")
        await tap(page, editor.getByLabel("Sur validation (chaque inscription est une demande à accepter ou refuser)"))
        await tap(page, editor.getByRole("button", { name: "Ajouter", exact: true }))
        await page.getByRole("status").filter({ hasText: /Créneau ajouté : Caisse/ }).waitFor()
      })

      await scene("registration", async () => {
        await page.goto(`${baseUrl}/admin/events/${organizerEventId}/edit`)
        await settle(page)
        await fillVisibly(page, page.getByLabel("Ouverture programmée (facultatif)"), "2026-10-01T09:00", 1_000)
        await fillVisibly(page, page.getByLabel("Fermeture programmée (facultatif)"), "2031-05-09T18:00", 1_000)
        await page.getByText("Enregistré ✓").waitFor({ timeout: 10_000 })
        await page.getByText(/Heures du fuseau de l'organisation/).scrollIntoViewIfNeeded()
      })

      await scene("review", async () => {
        await page.goto(`${baseUrl}/admin/events/${organizerEventId}/review`)
        await page.waitForURL(/\/review$/)
        await page.getByText("4 créneaux, 3 postes, 8 places").first().scrollIntoViewIfNeeded()
      })

      await scene("preview", async () => {
        await tap(page, page.getByRole("link", { name: "Prévisualiser comme un bénévole" }))
        await page.waitForURL(/\/preview$/)
        await page.getByText(/Aperçu : la page telle que la verront les bénévoles/).waitFor()
        const previewShift = page.getByRole("button", { name: /Sélectionner — Accueil/ }).first()
        await tap(page, previewShift)
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        await page.getByRole("heading", { name: "Vos informations" }).waitFor()
        await typeNaturally(page, page.getByRole("textbox", { name: "Prénom *", exact: true }), "Alex")
        await typeNaturally(page, page.getByRole("textbox", { name: "Nom *", exact: true }), "Martin")
        await typeNaturally(page, page.getByRole("textbox", { name: "Email *", exact: true }), "alex.martin@example.org")
        const charter = page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox")
        await tap(page, charter)
        const privacy = page.locator("label").filter({ hasText: "J'accepte que mes données" }).getByRole("checkbox")
        await tap(page, privacy)
        await tap(page, page.getByRole("button", { name: "Voir la confirmation (aperçu)" }))
        await page.getByRole("heading", { name: /Aperçu de la confirmation/ }).waitFor()
      })

      await scene("preview-result", async () => {
        await page.getByText("Message affiché après l'inscription").scrollIntoViewIfNeeded()
        await page.waitForTimeout(1_400)
        await page.getByRole("heading", { name: /Email de confirmation/ }).scrollIntoViewIfNeeded()
        await page.waitForTimeout(1_400)
        await page.goto(`${baseUrl}/admin/events/${organizerEventId}/review`)
        await settle(page)
      })

      await scene("publish", async () => {
        await tap(page, page.getByRole("button", { name: "Publier" }))
        await page.getByText("L'événement est publié : les bénévoles peuvent s'inscrire.").waitFor()
        organizerPublicUrl = await page.locator('a[target="_blank"][href*="?org="]').getAttribute("href") ?? ""
        if (!organizerPublicUrl) throw new Error("Published event has no public URL")
      })

      await scene("qr", async () => {
        await tap(page, page.getByRole("link", { name: "QR code" }))
        await page.getByRole("heading", { name: "QR code" }).waitFor()
        await page.getByText("Scanner pour s'inscrire").scrollIntoViewIfNeeded()
      })

      await scene("import", async () => {
        await page.goto(`${baseUrl}/admin/members`)
        await tap(page, page.getByRole("button", { name: "Importer CSV/Excel" }))
        const csv = [
          "Prénom,Nom,Email,Téléphone,Tags",
          "Sophie,Roch,sophie.roch@example.org,0790000001,caisse",
          "Malik,Diallo,malik.diallo@example.org,0790000002,livraison; permis-b",
          "Ana,Silva,ana.silva@example.org,0790000003,accueil",
          "Léa,Morel,lea.morel@example.org,0790000004,accueil; matin",
          "Hugo,Bernard,hugo.bernard@example.org,0790000005,logistique",
          "Camille,Dubois,camille.dubois@example.org,0790000006,caisse; soir",
          "Noah,Petit,noah.petit@example.org,0790000007,accueil",
          "Emma,Garcia,emma.garcia@example.org,0790000008,logistique",
          "Lucas,Robert,lucas.robert@example.org,0790000009,livraison; permis-b",
          "Chloé,Richard,chloe.richard@example.org,0790000010,accueil",
          "Adam,Durand,adam.durand@example.org,0790000011,caisse",
          "Inès,Laurent,ines.laurent@example.org,0790000012,logistique",
        ].join("\n")
        await page.getByLabel("Fichier CSV ou Excel").setInputFiles({ name: "membres-fete.csv", mimeType: "text/csv", buffer: Buffer.from(csv) })
        await tap(page, page.getByRole("button", { name: "Analyser le fichier" }))
        await page.getByText("Analyse du fichier, rien n'est encore enregistré.").waitFor()
        await tap(page, page.getByRole("button", { name: "Importer 12 membres" }))
        await page.getByText(/Import terminé :/).waitFor()
        await tap(page, page.getByRole("button").filter({ hasText: /^Fermer$/ }))
        await page.getByText("Sophie").first().waitFor()
      })

      await scene("invite", async () => {
        await page.goto(`${baseUrl}/admin/events/${organizerEventId}/invitations`)
        await tap(page, page.getByRole("button", { name: "+ Inviter des membres" }))
        await page.getByLabel("Filtrer par tag").selectOption("caisse")
        await tap(page, page.getByLabel("Inviter Sophie Roch"))
        await typeNaturally(page, page.getByLabel("Message (optionnel)"), "Bonjour Sophie, peux-tu nous aider à la caisse ?")
        await tap(page, page.getByRole("button", { name: "Envoyer 1 invitation" }))
        await page.waitForTimeout(1_800)
        await page.getByRole("table").getByText("Sophie Roch").waitFor()
      })

      await scene("public", async () => {
        await page.goto(organizerPublicUrl)
        await page.waitForLoadState("networkidle")
        await page.getByRole("heading", { name: "Fête des voisins" }).waitFor()
      })
    } else if (slug === "admin-features-tour") {
      await scene("intro", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Les outils utiles, sans détour", duration: 2_300 })
        await page.getByRole("heading", { name: "Événements" }).waitFor()
      })

      await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
      await page.screencast.showChapter("Configurer l’organisation", { description: "Identité, équipe et accès", duration: 1_400 })
      await scene("organization", async (at) => {
        await page.getByRole("heading", { name: "Paramètres" }).waitFor()
        await page.getByLabel("Identifiant", { exact: true }).fill("fetes-de-montvert")
        // The local demo runs on localhost. Show the production-shaped public address in the
        // recording so the screen matches the narration without changing any persisted setting.
        await page.evaluate(() => {
          for (const el of document.querySelectorAll<HTMLElement>("p, span, code")) {
            if (el.textContent?.includes(".localhost:3100")) el.textContent = el.textContent.replace(".localhost:3100", ".benevol.app")
          }
        })
        const show = async (name: string, fraction: number) => {
          await at(fraction)
          await page.getByRole("heading", { name, exact: true }).evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }))
        }
        await show("Identifiant public (slug)", 0.12)
        await show("Titre de la page publique", 0.48)
        await show("Fuseau horaire", 0.68)
        await show("Convention des Bénévoles", 0.82)
      })

      await scene("team", async (at) => {
        await at(0.05)
        await page.getByRole("heading", { name: /Administrateurs/ }).scrollIntoViewIfNeeded()
        await at(0.52)
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/sector-leaders`); await settle(page)
        await page.getByRole("heading", { name: "Responsables de secteur" }).waitFor()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}`); await settle(page)
      await page.screencast.showChapter("Préparer l’événement", { description: "Publication, inscriptions et apparence", duration: 1_400 })
      await scene("lifecycle", async (at) => {
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).waitFor()
        await at(0.45)
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/edit`); await settle(page)
        await page.getByText("Visibilité", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.72)
        await page.getByText("Inscriptions", { exact: true }).scrollIntoViewIfNeeded()
      })

      await scene("appearance", async (at) => {
        await at(0.08)
        const editHeading = page.getByRole("heading", { name: "Modifier l'événement" })
        if (await editHeading.isVisible()) await editHeading.scrollIntoViewIfNeeded()
        await at(0.42)
        await page.getByText("Couleur de la page publique").scrollIntoViewIfNeeded()
        await at(0.62)
        await page.getByLabel("Lieu").scrollIntoViewIfNeeded()
        await at(0.76)
        const coordinates = page.getByText(/coordonnées/i).first()
        if (await coordinates.isVisible()) await coordinates.scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/duplicate`); await settle(page)
      await scene("duplicate", async () => {
        await page.getByRole("heading", { name: "Dupliquer l'événement" }).waitFor()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`)
      await settle(page)
      await page.screencast.showChapter("Construire le planning", { description: "Postes, créneaux et horaires", duration: 1_400 })
      await scene("shift-methods", async (at) => {
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
        await at(0.10)
        const listButton = page.getByRole("button", { name: "Liste" })
        if (await listButton.isVisible()) await tap(page, listButton)
        await at(0.17)
        await tap(page, page.getByRole("button", { name: "+ Ajouter un créneau" }))
        const quickEditor = page.getByRole("group", { name: "Nouveau créneau" })
        await at(0.25)
        await tap(page, quickEditor.getByRole("button", { name: "Annuler" }))
        await at(0.30)
        const timelineButton = page.getByRole("button", { name: "Timeline" })
        if (await timelineButton.isVisible()) await tap(page, timelineButton)
        await at(0.36)
        await tap(page, page.getByRole("button", { name: /Montage.*modifier/i }).first())
        await at(0.42)
        await tap(page, page.getByRole("button", { name: "Dupliquer" }))
        await at(0.49)
        await tap(page, page.getByRole("button", { name: "Fermer et enregistrer" }))

        await at(0.55)
        const firstPlanning = page.getByRole("region", { name: /Planning du/ }).first()
        const firstRow = firstPlanning.locator(".cursor-crosshair").first()
        const rowBox = await firstRow.boundingBox()
        if (!rowBox) throw new Error("Timeline row is not visible")
        const beforeDraw = await firstPlanning.locator("[data-shift-bar]").count()
        const drawFrom = { x: Math.min(rowBox.x + rowBox.width - 180, rowBox.x + 720), y: rowBox.y + rowBox.height / 2 }
        await dragVisibly(page, drawFrom, { x: drawFrom.x + 90, y: drawFrom.y })
        await page.waitForFunction((before) => document.querySelectorAll('[role="region"][aria-label^="Planning du"] [data-shift-bar]').length > before, beforeDraw)

        await at(0.69)
        const newBar = firstRow.locator("[data-shift-bar]").last()
        const resizeHandle = newBar.locator(".cursor-ew-resize").last()
        const handleBox = await resizeHandle.boundingBox()
        if (!handleBox) throw new Error("Timeline resize handle is not visible")
        const resizeFrom = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 }
        await dragVisibly(page, resizeFrom, { x: resizeFrom.x + 48, y: resizeFrom.y })

        await at(0.82)
        await tap(page, page.getByRole("button", { name: "Créer une série" }))
      })

      await scene("shift-fields", async (at) => {
        await tap(page, page.getByRole("button", { name: "+ Ajouter un créneau" }))
        const editor = page.getByRole("group", { name: "Nouveau créneau" })
        await at(0.12)
        await editor.getByLabel("Poste *").scrollIntoViewIfNeeded()
        await at(0.48)
        await editor.getByLabel("Lieu de rendez-vous").scrollIntoViewIfNeeded()
        await at(0.72)
        await editor.getByLabel("Âge minimum (optionnel)").scrollIntoViewIfNeeded()
        await at(0.86)
        await editor.getByLabel(/liste d'attente/i).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations`)
      await settle(page)
      await page.screencast.showChapter("Accueillir les bénévoles", { description: "Inscriptions, membres et questions", duration: 1_400 })
      await scene("registrations", async () => {
        await page.getByRole("heading", { name: "Inscriptions" }).waitFor()
        await page.getByRole("button", { name: "+ Ajouter manuellement" }).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/members`); await settle(page)
      await scene("members", async () => {
        await page.getByRole("heading", { name: "Membres" }).waitFor()
        await page.getByRole("button", { name: /Nouveau membre/ }).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/questions`); await settle(page)
      await scene("questions", async (at) => {
        await page.getByRole("heading", { name: "Questions aux bénévoles" }).waitFor()
        await at(0.18)
        await tap(page, page.getByRole("button", { name: "Ajouter une question" }))
        await at(0.30)
        await fillVisibly(page, page.getByLabel("Question posée aux bénévoles *"), "Taille de t-shirt")
        await at(0.54)
        await page.getByLabel("Type de réponse").selectOption("single")
        await page.getByLabel("Choix proposés *").fill("S\nM\nL\nXL")
        await at(0.78)
        await page.getByLabel("Réponse obligatoire").scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/pages`); await settle(page)
      await scene("pages", async (at) => {
        await page.getByRole("heading", { name: "Pages" }).waitFor()
        await at(0.20)
        await tap(page, page.getByRole("button", { name: "+ Ajouter une page" }))
        await at(0.34)
        await fillVisibly(page, page.getByLabel("Titre *"), "Accès et parking")
        await at(0.52)
        await fillVisibly(page, page.getByLabel(/Contenu/), "## Venir sur place\n\n- Parking au nord\n- Entrée bénévoles côté scène")
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/message`); await settle(page)
      await page.screencast.showChapter("Communiquer", { description: "Messages, modèles et rappels", duration: 1_400 })
      await scene("messages", async (at) => {
        await page.getByRole("heading", { name: "Écrire aux bénévoles" }).waitFor()
        await page.getByText("Destinataires", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.38)
        await page.goto(`${baseUrl}/admin/settings/message-templates`); await settle(page)
        await page.getByRole("heading", { name: "Modèles de messages" }).waitFor()
        await at(0.72)
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/message`); await settle(page)
        const preview = page.getByText(/aperçu/i).first()
        if (await preview.isVisible()) await preview.scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/settings/notifications`); await settle(page)
      await scene("reminders", async () => {
        await page.getByRole("heading", { name: "Emails", exact: true }).waitFor()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/print`); await settle(page)
      await page.screencast.showChapter("Préparer le jour J", { description: "Rapports, listes et badges", duration: 1_400 })
      await scene("reports", async (at) => {
        await page.getByRole("heading", { name: "Rapports" }).waitFor()
        await at(0.12)
        await page.getByRole("heading", { name: "À afficher ou à remettre aux bénévoles" }).scrollIntoViewIfNeeded()
        await at(0.62)
        await page.getByRole("heading", { name: "Badges" }).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/log`); await settle(page)
      await page.screencast.showChapter("Suivre l’activité", { description: "Historique et recherche", duration: 1_400 })
      await scene("activity", async (at) => {
        await page.getByRole("heading", { name: "Journal" }).waitFor()
        await at(0.68)
        const searchButton = page.getByRole("button", { name: "Rechercher" })
        await tap(page, searchButton)
        const search = page.getByRole("searchbox", { name: /Rechercher un bénévole/ })
        await typeNaturally(page, search, "buvette")
        await search.press("Enter")
        await page.waitForURL(/\/admin\/search/)
        await settle(page)
      })
    } else if (slug === "organizer-monitor-followup") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}`); await settle(page)
      await scene("overview", async (at) => {
        await page.screencast.showChapter(manifest.title, { description: "Du premier inscrit au jour J", duration: 2_300 })
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).waitFor()
        await at(0.58)
        await page.getByText("Communications", { exact: true }).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/staffing`); await settle(page)
      await page.screencast.showChapter("Lire le planning", { description: "Places, demandes et listes d’attente", duration: 1_400 })
      await scene("coverage", async (at) => {
        await page.getByRole("heading", { name: "Où manque-t-il du monde ?" }).waitFor()
        await at(0.25)
        await page.getByRole("heading", { name: /Créneaux à compléter/ }).scrollIntoViewIfNeeded()
        await at(0.62)
        await page.getByRole("heading", { name: /Personnes en liste d'attente/ }).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations`); await settle(page)
      await scene("registrations", async (at) => {
        await page.getByRole("heading", { name: "Inscriptions" }).waitFor()
        await at(0.24)
        await page.getByText("Camille Rochat", { exact: true }).first().scrollIntoViewIfNeeded()
        await at(0.65)
        const answer = page.getByText(/Taille de t-shirt/).first()
        if (await answer.isVisible()) await answer.scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations?demandes=1`); await settle(page)
      await scene("requests", async (at) => {
        await page.getByText(/Demande à traiter/).first().waitFor()
        await at(0.28)
        await tap(page, page.getByRole("button", { name: /Accepter la demande de/ }).first())
        await page.getByRole("dialog").waitFor()
        await at(0.72)
        await tap(page, page.getByRole("button", { name: "Annuler" }))
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations`); await settle(page)
      await scene("filters", async (at) => {
        await at(0.12)
        await page.getByLabel("Filtrer par poste").selectOption("Buvette")
        await at(0.42)
        const registrationSearch = page.locator("#reg-search")
        await fillVisibly(page, registrationSearch, "Camille")
        await at(0.72)
        await registrationSearch.fill("")
        await page.getByLabel("Filtrer par poste").selectOption("")
      })

      await scene("actions", async (at) => {
        const selectCamille = page.getByLabel(/Sélectionner l'inscription de Camille Rochat/).first()
        await tap(page, selectCamille)
        await at(0.42)
        await page.getByRole("group", { name: "Actions sur la sélection" }).scrollIntoViewIfNeeded()
        await at(0.78)
        await tap(page, page.getByRole("button", { name: "Désélectionner" }))
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/message`); await settle(page)
      await page.screencast.showChapter("Relancer sans arroser tout le monde", { description: "Le bon message aux bonnes personnes", duration: 1_400 })
      await scene("audience", async (at) => {
        await page.getByRole("heading", { name: "Écrire aux bénévoles" }).waitFor()
        await at(0.16)
        await tap(page, page.getByLabel("Les bénévoles d'un poste"))
        await at(0.38)
        await page.getByLabel("Poste", { exact: true }).selectOption("Buvette")
        await at(0.58)
        await tap(page, page.getByLabel("Les personnes en liste d'attente"))
        await at(0.72)
        await tap(page, page.getByLabel("Les invités sans créneau confirmé"))
        await at(0.88)
        await tap(page, page.getByLabel("Les personnes en liste d'attente"))
      })

      await scene("message", async (at) => {
        await page.getByText(/personnes? recevr(?:a|ont) ce message/).waitFor()
        await at(0.10)
        await page.getByLabel("Partir d'un modèle").selectOption({ label: "Point de rendez-vous" })
        await tap(page, page.getByRole("button", { name: "Utiliser ce modèle" }))
        await at(0.46)
        await page.getByLabel("Objet *").scrollIntoViewIfNeeded()
        await at(0.70)
        await page.getByLabel("Message *").scrollIntoViewIfNeeded()
      })

      await scene("channels", async (at) => {
        await at(0.10)
        const push = page.getByLabel("Envoyer aussi une notification (téléphone ou ordinateur)")
        await tap(page, push)
        await at(0.42)
        await tap(page, page.getByRole("button", { name: "Voir l'aperçu et envoyer" }))
        const previewHeading = page.getByRole("heading", { name: "Aperçu de l'email" })
        await page.waitForTimeout(1_000)
        if (!(await previewHeading.isVisible())) {
          const alerts = await page.locator('[role="alert"]').allTextContents()
          const formText = await page.locator("form").last().innerText()
          throw new Error(`Message preview did not open. Alerts: ${alerts.join(" | ") || "none"}. Form: ${formText.slice(0, 800)}`)
        }
        await at(0.78)
        await tap(page, page.getByRole("button", { name: "Retour au message" }))
      })

      await page.goto(`${baseUrl}/admin/settings/notifications`); await settle(page)
      await scene("reminders", async (at) => {
        await page.getByRole("heading", { name: "Emails", exact: true }).waitFor()
        await at(0.18)
        await page.getByText("Rappels automatiques aux bénévoles inscrits").scrollIntoViewIfNeeded()
        await at(0.62)
        await page.getByText(/Pour toute l'organisation/).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/print`); await settle(page)
      await page.screencast.showChapter("Préparer le jour J", { description: "Listes, plannings et badges", duration: 1_400 })
      await scene("reports", async (at) => {
        await page.getByRole("heading", { name: "Rapports" }).waitFor()
        await at(0.14)
        await page.getByRole("heading", { name: "À afficher ou à remettre aux bénévoles" }).scrollIntoViewIfNeeded()
        await at(0.46)
        await page.getByRole("heading", { name: "Pour les organisateurs seulement" }).scrollIntoViewIfNeeded()
        await at(0.72)
        await page.getByRole("heading", { name: "Badges" }).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/log`); await settle(page)
      await scene("history", async (at) => {
        await page.getByRole("heading", { name: "Journal" }).waitFor()
        await at(0.20)
        await page.getByRole("button", { name: "Voir le récit" }).first().waitFor()
        await at(0.58)
        await page.evaluate(() => window.scrollBy({ top: 520, behavior: "smooth" }))
      })

      await scene("done", async () => {
        await page.screencast.showChapter("Un suivi clair jusqu’au jour J", { description: "Voir, cibler, préparer", duration: 2_300 })
      })
    } else {
      let onboardingEventId = ""
      let onboardingPublicUrl = ""

      await page.goto(`${baseUrl}/admin/events`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "De l’espace vide au premier parcours vérifié", duration: 2_300 })
        await page.getByRole("heading", { name: "Premiers pas" }).waitFor()
      })

      await scene("checklist", async (at) => {
        const checklist = page.getByRole("region", { name: "Premiers pas" })
        await checklist.scrollIntoViewIfNeeded()
        await at(0.30)
        await checklist.getByText("Créer votre premier événement").scrollIntoViewIfNeeded()
        await at(0.70)
        await checklist.getByText("Faire une inscription de test").scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
      await scene("identity", async (at) => {
        const titleField = page.getByLabel("Titre affiché en haut de la page de vos événements")
        await fillVisibly(page, titleField, "Les bénévoles du Parc")
        const titleForm = titleField.locator("xpath=ancestor::form")
        await tap(page, titleForm.getByRole("button", { name: "Enregistrer" }))
        await titleForm.getByText("Titre enregistré.").waitFor()
        await at(0.46)
        const charterHeading = page.getByRole("heading", { name: "Convention des Bénévoles" })
        await charterHeading.scrollIntoViewIfNeeded()
        const charterBox = charterHeading.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')]")
        const charter = charterBox.locator("textarea")
        await charter.fill("Je m’engage à venir à l’heure, à prévenir en cas d’empêchement et à respecter les consignes de sécurité et les autres bénévoles.")
        await at(0.72)
        await tap(page, charterBox.getByRole("button", { name: "Enregistrer" }))
        await charterBox.getByText("Enregistré ✓").waitFor()
      })

      await scene("timezone", async (at) => {
        const timezone = page.getByLabel("Fuseau horaire de vos événements")
        await timezone.scrollIntoViewIfNeeded()
        await at(0.22)
        await timezone.selectOption("Europe/Zurich")
        const timezoneForm = timezone.locator("xpath=ancestor::form")
        await at(0.55)
        await tap(page, timezoneForm.getByRole("button", { name: "Enregistrer" }))
        await timezoneForm.getByText(/Fuseau horaire enregistré/).waitFor()
      })

      await page.goto(`${baseUrl}/admin/events`); await settle(page)
      await scene("event", async (at) => {
        const checklist = page.getByRole("region", { name: "Premiers pas" })
        await checklist.getByText(/Personnaliser la page publique.*fait/).waitFor()
        await at(0.12)
        await tap(page, page.getByRole("link", { name: "+ Nouvel événement" }))
        await page.getByRole("heading", { name: "Nouvel événement" }).waitFor()
        await tap(page, page.getByRole("radio", { name: /Page blanche/ }))
        await at(0.24)
        await typeNaturally(page, page.getByLabel("Titre *"), "Fête du parc")
        await fillVisibly(page, page.getByLabel("Lieu"), "Kiosque du parc, Montvert")
        await fillVisibly(page, page.getByLabel("Date début *"), "2031-06-14")
        await fillVisibly(page, page.getByLabel("Date fin *"), "2031-06-14")
        await tap(page, page.getByRole("button", { name: "Créer l'événement" }))
        await page.waitForURL(/\/admin\/events\/[^/]+\/shifts\?wizard=1$/)
        onboardingEventId = new URL(page.url()).pathname.split("/")[3]
      })

      await scene("shift", async (at) => {
        await at(0.10)
        await tap(page, page.getByRole("button", { name: "+ Ajouter un créneau" }))
        const editor = page.getByRole("group", { name: "Nouveau créneau" })
        await typeNaturally(page, editor.getByLabel("Poste *"), "Accueil")
        await at(0.38)
        await editor.getByLabel("Début *").fill("09:00")
        await editor.getByLabel("Fin *").fill("12:00")
        await editor.getByLabel("Capacité *").fill("3")
        await at(0.68)
        await tap(page, editor.getByRole("button", { name: "Ajouter", exact: true }))
        await page.getByRole("status").filter({ hasText: /Créneau ajouté/ }).waitFor()
      })

      await scene("publish", async (at) => {
        await at(0.10)
        const continueButton = page.getByRole("link", { name: /Continuer : vérification et publication/ })
        await tap(page, continueButton)
        await page.waitForURL(/\/review$/)
        await page.getByRole("heading", { name: "Fête du parc" }).waitFor()
        await at(0.50)
        await tap(page, page.getByRole("button", { name: "Publier" }))
        await page.getByText("L'événement est publié : les bénévoles peuvent s'inscrire.").waitFor()
        onboardingPublicUrl = await page.locator('a[target="_blank"][href*="?org="]').getAttribute("href") ?? ""
        if (!onboardingPublicUrl) throw new Error("Onboarding event has no public URL")
      })

      await page.goto(onboardingPublicUrl); await settle(page)
      await scene("test", async (at) => {
        await page.getByRole("heading", { name: "Fête du parc" }).waitFor()
        await tap(page, page.getByRole("button", { name: /Sélectionner — Accueil/ }))
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        await page.getByRole("heading", { name: "Vos informations" }).waitFor()
        await at(0.28)
        await typeNaturally(page, page.getByRole("textbox", { name: "Prénom *", exact: true }), "Alex")
        await typeNaturally(page, page.getByRole("textbox", { name: "Nom *", exact: true }), "Martin")
        await typeNaturally(page, page.getByRole("textbox", { name: "Email *", exact: true }), "alex.masterclass@example.org")
        await at(0.62)
        await tap(page, page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox"))
        await tap(page, page.locator("label").filter({ hasText: "J'accepte que mes données" }).getByRole("checkbox"))
        await tap(page, page.getByRole("button", { name: "Confirmer mon inscription" }))
        await page.getByRole("heading", { name: /inscription confirmée/i }).waitFor()
      })

      await page.goto(`${baseUrl}/admin/events`); await settle(page)
      await scene("result", async (at) => {
        await page.getByRole("heading", { name: "Événements" }).waitFor()
        if (await page.getByRole("heading", { name: "Premiers pas" }).isVisible()) {
          throw new Error("Onboarding checklist should be complete after the test registration")
        }
        await at(0.42)
        await page.getByRole("link", { name: "Fête du parc", exact: true }).scrollIntoViewIfNeeded()
        await at(0.72)
        await page.goto(`${baseUrl}/admin/events/${onboardingEventId}/registrations`); await settle(page)
        await page.getByText("Alex Martin").first().waitFor()
      })
    }
  } finally {
    if (recording) await page.screencast.stop()
    await context.close()
    await browser.close()
  }

  const timeline: Timeline = {
    slug: manifest.slug,
    recordedAt: new Date().toISOString(),
    video: path.basename(rawVideo),
    cues,
  }
  await writeFile(timelineFile, `${JSON.stringify(timeline, null, 2)}\n`)
  console.log(`Capture ready: ${rawVideo}`)
  console.log(`Timeline ready: ${timelineFile}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
