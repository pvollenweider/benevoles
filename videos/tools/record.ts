// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium, type Locator, type Page } from "playwright"
import { catalogEntry, loadManifest, videoDir, type AudioMetadata, type Timeline } from "../lib/manifest"
import { verifyProductBuild } from "../lib/product-build"

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
const rehearsal = process.argv.includes("--rehearse")
const quickRehearsal = process.argv.includes("--quick-rehearse")
if (quickRehearsal && !rehearsal) throw new Error("--quick-rehearse requires --rehearse; never use accelerated timing for narrated captures")

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
  const product = await verifyProductBuild(baseUrl)
  if ((await catalogEntry(reference!)).captureReady === false) throw new Error(`${manifest.id}: real UI recorder and fixture are not ready; refusing a substitute capture`)
  const slug = manifest.slug
  const dir = videoDir(manifest.slug)
  const rawVideo = path.join(dir, "capture.webm")
  const timelineFile = path.join(dir, "timeline.json")
  const audio = await metadata(path.join(dir, "audio-metadata.json"))
  if (slug === "email-delivery-failures" && !rehearsal) await (await import("../lib/record-delivery")).validateDeliveryNarration(dir)
  if (slug === "volunteer-confirmation-errors" && !rehearsal) await (await import("../lib/record-registration-errors")).validateRegistrationErrorNarration(dir)
  if (slug === "platform-internal-administration" && !rehearsal) {
    await (await import("../lib/record-operator")).validateOperatorNarration(dir)
  }
  const durations = new Map(manifest.segments.map((segment) => [segment.id, rehearsal ? segment.fallbackDurationMs : audio?.segments[segment.id]?.durationMs ?? segment.fallbackDurationMs]))
  await mkdir(dir, { recursive: true })
  await rm(rawVideo, { force: true })

  // Native date controls also depend on Chromium's UI/process locale, not just
  // the context's Accept-Language. Keep French narration separate from this.
  const browser = await chromium.launch({
    headless: true,
    args: ["--lang=fr-FR"],
    env: { ...process.env, LANG: "fr_FR.UTF-8", LC_ALL: "fr_FR.UTF-8" },
  })
  const context = await browser.newContext({
    viewport: { width: manifest.viewport.width, height: manifest.viewport.height },
    deviceScaleFactor: manifest.viewport.deviceScaleFactor,
    isMobile: manifest.viewport.width < 600,
    hasTouch: manifest.viewport.width < 600,
    locale: "fr-FR",
    timezoneId: "Europe/Zurich",
    colorScheme: "light",
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  })
  const page = await context.newPage()
  const cues: Timeline["cues"] = []
  const portraitFrames: NonNullable<Timeline["portraitFrames"]> = []
  const detailFrames: NonNullable<Timeline["detailFrames"]> = []
  let startedAt = 0
  let recording = false
  const inputEvents: NonNullable<Timeline["inputEvents"]> = []
  await context.exposeBinding("videoInputSound", (_source, kind: "click" | "key") => {
    if (recording && (kind === "click" || kind === "key")) inputEvents.push({ kind, atMs: Math.round(performance.now() - startedAt) })
  })
  // String source avoids transpiler helpers leaking into the browser script.
  await context.addInitScript(`
    document.addEventListener("pointerdown", () => {
      void window.videoInputSound("click").catch(() => {});
    }, true);
    document.addEventListener("keydown", () => {
      void window.videoInputSound("key").catch(() => {});
    }, true);
  `)

  const scene = async (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => {
    console.log(`Scene ${id}: ${rehearsal ? "rehearsal" : "narration-timed"}`)
    const audioDuration = durations.get(id)
    if (!audioDuration) throw new Error(`Missing duration for ${id}`)
    // The TTS take contains a short tail, the recorder adds a chapter gap, and the next take has
    // a short lead-in. Overlap the silent tails at this transition so the next sentence follows
    // naturally without clipping or overlapping spoken words.
    const expected = audioDuration - (id === "lifecycle" ? 1_300 : 0)
    // Chapter cards separate subjects; they must not cover the first narrated
    // action or consume its timing budget.
    const title = manifest.chapterTitles?.[id]
    if (title) await page.screencast.showChapter(title, { duration: 1500 })
    const start = performance.now()
    cues.push({ id, startMs: Math.round(start - startedAt), endMs: 0 })
    const at = async (fraction: number) => {
      if (quickRehearsal) return
      const remaining = start + expected * fraction - performance.now()
      if (remaining > 0) await page.waitForTimeout(remaining)
    }
    try {
      await action(at)
    } catch (error) {
      throw new Error(`Scene ${id} failed`, { cause: error })
    }
    const elapsed = performance.now() - start
    if (!quickRehearsal && elapsed > expected + 1_000) {
      throw new Error(`Scene ${id} overruns its narration by ${Math.round(elapsed - expected)} ms`)
    }
    if (!quickRehearsal && elapsed < expected) await page.waitForTimeout(expected - elapsed)
    cues.at(-1)!.endMs = Math.round(performance.now() - startedAt)
    await page.waitForTimeout(gapMs)
  }

  try {
    let featureEventId = ""
    if (slug === "volunteer-confirmation-errors") {
      await (await import("../lib/record-registration-errors")).prepareRegistrationErrorRecording(page, baseUrl, dir)
      await settle(page)
    }
    if (slug === "volunteer-form-recap") {
      await page.goto(`${baseUrl}/admin/login`)
      await page.getByLabel("Email").fill(process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost")
      await page.getByLabel("Mot de passe").fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
      await page.getByRole("button", { name: "Se connecter" }).click()
      await page.waitForURL(/\/admin\/events/)
      const href = await page.getByRole("link", { name: "Fête du village de Montvert" }).first().getAttribute("href")
      featureEventId = href!.split("/").at(-1)!
      await page.evaluate(async (eventId) => {
        const event = await (await fetch(`/api/admin/events/${eventId}`)).json()
        const date = event.startDate.slice(0, 10)
        for (const shift of [
          { roleName: "Logistique", label: "Logistique", startTime: "12:00", endTime: "18:00", minAge: null },
          { roleName: "Rangement", label: "Rangement de nuit", startTime: "22:00", endTime: "02:00", minAge: 18 },
        ]) {
          const response = await fetch("/api/admin/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, date, capacity: 4, instructions: "Prévoir des chaussures fermées et passer au stand d’accueil.", ...shift }) })
          if (!response.ok) throw new Error(await response.text())
        }
      }, featureEventId)
      await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
    }
    if (slug === "volunteer-register-mobile") {
      await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`)
      await settle(page)
      const heading = page.getByRole("heading", { level: 1, name: "Fête du village de Montvert" })
      if (!(await heading.isVisible())) throw new Error("Demo event not found; run scripts/seed-demo.ts on the local database first")
    } else if (slug !== "volunteer-form-recap" && slug !== "volunteer-confirmation-errors") {
      await page.goto(`${baseUrl}/admin/login`)
      await page.getByLabel("Email").fill(slug === "platform-internal-administration" ? "video.operator.platform@example.org" : slug === "privacy-personal-links" ? "video.privacy.a.owner@example.org" : slug === "last-minute-changes" ? "video.last-minute.owner@example.org" : slug === "organization-activity-log" ? "video.org-activity.owner@example.org" : slug === "data-exports-archives" ? "video.exports.owner@example.org" : process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost")
      await page.getByLabel("Mot de passe").fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
      await page.getByRole("button", { name: "Se connecter" }).click()
      await page.waitForURL(slug === "platform-internal-administration" ? /\/super-admin\/organizations/ : /\/admin\/(events|dashboard)/)
      if (slug !== "platform-internal-administration") await page.goto(`${baseUrl}/admin/events`)
      await settle(page)
      if (slug === "admin-features-tour" || slug === "organizer-monitor-followup" || slug === "admin-navigation" || slug === "global-search" || slug === "org-public-identity" || slug === "org-timezone-charter" || slug === "event-review-publish" || slug === "event-visibility-registration-window" || slug === "event-duplicate" || slug === "event-program-pages-qr" || slug === "event-milestones" || slug === "event-archive-delete" || slug === "shifts-roles-views" || slug === "shift-create-edit-detail" || slug === "shift-create-series" || slug === "shift-timeline-quick-actions" || slug === "shift-night-dst" || slug === "shift-waitlist-offer" || slug === "shift-approval" || slug === "shift-eligibility-rules" || slug === "volunteer-discover-event" || slug === "volunteer-choose-shifts") {
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
        ] : slug === "admin-navigation" || slug === "global-search" || slug === "org-public-identity" || slug === "org-timezone-charter" || slug === "event-review-publish" || slug === "event-visibility-registration-window" || slug === "event-duplicate" || slug === "event-program-pages-qr" || slug === "event-milestones" || slug === "event-archive-delete" || slug === "shifts-roles-views" || slug === "shift-create-edit-detail" || slug === "shift-create-series" || slug === "shift-timeline-quick-actions" || slug === "shift-night-dst" || slug === "shift-waitlist-offer" || slug === "shift-approval" || slug === "shift-eligibility-rules" || slug === "volunteer-discover-event" || slug === "volunteer-choose-shifts" ? [
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

    if (slug === "targeted-messages" || slug === "staffing-gaps" || slug === "registrations-management" || slug === "members-reminders" || slug === "members-invitations" || slug === "sector-leaders" || slug === "volunteer-personal-registrations" || slug === "volunteer-session-availability" || slug === "volunteer-calendar") {
      const href = await page.getByRole("link", { name: "Fête du village de Montvert" }).first().getAttribute("href")
      if (!href) throw new Error("Seed event link not found")
      featureEventId = href.split("/").filter(Boolean).at(-1)!
      await page.goto(slug === "targeted-messages" ? `${baseUrl}/admin/events/${featureEventId}/message` : slug === "staffing-gaps" ? `${baseUrl}/admin/events/${featureEventId}` : slug === "registrations-management" ? `${baseUrl}/admin/events/${featureEventId}/registrations` : slug === "members-invitations" || slug === "members-reminders" ? `${baseUrl}/admin/events/${featureEventId}/invitations` : slug === "sector-leaders" ? `${baseUrl}/admin/events/${featureEventId}/sector-leaders` : `${baseUrl}/my/demo-volunteer-camille-0001`); await settle(page)
    }

    if (slug === "event-activity-log") {
      const href = await page.getByRole("link", { name: "Comprendre le journal de la fête", exact: true }).getAttribute("href")
      if (!href) throw new Error("Dedicated event-log fixture missing")
      featureEventId = href.split("/").filter(Boolean).at(-1)!
      await page.goto(`${baseUrl}/admin/events/${featureEventId}`); await settle(page)
    }
    if (slug === "attendance-check-in") {
      const href = await page.getByRole("link", { name: "Accueil des bénévoles — pointage", exact: true }).getAttribute("href")
      if (!href) throw new Error("Dedicated attendance fixture missing")
      featureEventId = href.split("/").filter(Boolean).at(-1)!
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations`); await settle(page)
    }
    if (slug === "volunteer-badges" || slug === "event-reports") {
      const href = await page.getByRole("link", { name: "Fête des associations — documents terrain", exact: true }).getAttribute("href")
      if (!href) throw new Error("Dedicated document fixture missing")
      featureEventId = href.split("/").filter(Boolean).at(-1)!
      await page.goto(`${baseUrl}/admin/events/${featureEventId}${slug === "event-reports" ? "" : "/print"}`); await settle(page)
    }

    if (slug === "reminders-changes") {
      const href = await page.getByRole("link", { name: "Atelier des rappels", exact: true }).getAttribute("href")
      if (!href) throw new Error("Fresh reminder fixture missing")
      featureEventId = href.split("/").filter(Boolean).at(-1)!
      for (const route of [`/admin/events/${featureEventId}/edit`, `/admin/events/${featureEventId}/shifts`, `/admin/events/${featureEventId}/registrations`, "/admin/settings/notifications", `/admin/events/${featureEventId}`]) {
        await page.goto(`${baseUrl}${route}`); await settle(page)
      }
    }

    if (slug === "members-management" || slug === "members-import") {
      await page.goto(`${baseUrl}/admin/members`); await settle(page)
      await page.getByRole("heading", { name: "Membres", exact: true }).waitFor()
    }

    // Recorder-owned demo data must be cleaned before capture starts. These scenarios are often
    // retried while tuning synchronization; doing it here keeps both the database and the first
    // frame deterministic, without showing maintenance actions in the finished lesson.
    if (slug === "event-milestones") {
      if (featureEventId !== "video-foundation-milestones-event-0" || org !== "formation-milestones") throw new Error("Milestone cleanup must remain in its explicitly owned synthetic fixture")
      await page.goto(`${baseUrl}/admin/events/${featureEventId}`); await settle(page)
      while (await page.getByRole("checkbox", { name: "Fermer les inscriptions", exact: true }).count()) {
        await page.getByRole("button", { name: "Supprimer le jalon Fermer les inscriptions", exact: true }).first().click()
        const dialog = page.getByRole("alertdialog")
        await dialog.waitFor()
        await dialog.getByRole("button", { name: /^Supprimer/ }).click()
        await dialog.waitFor({ state: "hidden" })
      }
    } else if (slug === "event-program-pages-qr") {
      if (featureEventId !== "video-foundation-pages-event-0" || org !== "formation-pages") throw new Error("Page cleanup must remain in its explicitly owned synthetic fixture")
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

    const privacyRecording = slug === "privacy-personal-links"
      ? await (await import("../lib/record-privacy")).preparePrivacyRecording(page, baseUrl, dir)
      : undefined
    const operatorRecording = slug === "platform-internal-administration"
      ? await (await import("../lib/record-operator")).prepareOperatorRecording(page, baseUrl, dir, rehearsal)
      : undefined

    await page.screencast.start({
      path: rawVideo,
      size: { width: manifest.viewport.width, height: manifest.viewport.height },
      quality: 90,
    })
    recording = true
    startedAt = performance.now()

    if (slug === "platform-internal-administration" && operatorRecording) {
      const { recordOperator } = await import("../lib/record-operator")
      await recordOperator({ page, base: baseUrl, directory: dir, title: manifest.title, setup: operatorRecording, scene, tap, settle })
    } else if (slug === "volunteer-register-mobile") {
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
      await page.getByRole("heading", { name: "Tes informations" }).waitFor()
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
      const privacy = page.getByRole("checkbox", { name: /^J'accepte que l'association qui organise cet événement/ })
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
        await at(0.04)
        await tap(page, page.getByRole("link", { name: "Tableau de bord", exact: true }).first())
        await settle(page)
        await at(0.28)
        await tap(page, page.getByRole("link", { name: "Événements", exact: true }).first())
        await at(0.43)
        await tap(page, page.getByRole("link", { name: "Membres", exact: true }).first())
        await page.getByRole("heading", { name: "Membres" }).waitFor()
        await at(0.63)
        await tap(page, page.getByRole("link", { name: "Paramètres", exact: true }).first())
        await page.getByRole("heading", { name: "Paramètres" }).waitFor()
        await at(0.91)
        await tap(page, page.getByRole("link", { name: "Événements", exact: true }).first())
        await page.getByRole("heading", { name: "Événements" }).waitFor()
      })

      await page.screencast.showChapter("Un événement précis", { description: "Planning, inscriptions et suivi", duration: 1_400 })
      await scene("event-navigation", async (at) => {
        await tap(page, page.getByRole("link", { name: "Fête du village de Montvert" }).first())
        await page.waitForURL(new RegExp(`/admin/events/${featureEventId}$`))
        await page.getByRole("link", { name: "Gérer les créneaux", exact: true }).scrollIntoViewIfNeeded()
        await at(0.34)
        await page.getByRole("link", { name: "QR code", exact: true }).scrollIntoViewIfNeeded()
        await at(0.63)
        await page.getByRole("heading", { name: "Jalons", exact: true }).scrollIntoViewIfNeeded()
        await at(0.73)
        await page.getByRole("heading", { name: "Communications", exact: true }).scrollIntoViewIfNeeded()
        await at(0.82)
        await page.getByRole("heading", { name: "Où manque-t-il du monde ?", exact: true }).scrollIntoViewIfNeeded()
        await at(0.94)
        await tap(page, page.getByRole("link", { name: "← Événements", exact: true }))
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
        await at(0.52)
        const result = page.getByRole("link", { name: /Buvette.*village/ }).first()
        const href = await result.getAttribute("href")
        if (!href?.startsWith(`/admin/events/${featureEventId}/`)) throw new Error("Search result does not belong to this video event")
        const pendingPage = await result.getAttribute("target") === "_blank" ? page.waitForEvent("popup") : null
        await tap(page, result)
        if (pendingPage) {
          const openedPage = await pendingPage
          await openedPage.waitForLoadState("domcontentloaded")
          await page.goto(openedPage.url())
          await openedPage.close()
        }
        await page.waitForURL(new RegExp(`/admin/events/${featureEventId}/`))
        await settle(page)
        await at(0.76)
        await page.goto(`${baseUrl}/admin/search?q=buvette`); await settle(page)
        const refined = page.getByRole("searchbox").first()
        await refined.fill("")
        await typeNaturally(page, refined, "buvette village")
        await refined.press("Enter")
        await page.getByRole("link", { name: /Buvette.*village/ }).waitFor()
      })

      await page.goto(`${baseUrl}/admin/events`); await settle(page)
      await scene("account-help", async (at) => {
        const accountMenu = page.locator('button[aria-haspopup="menu"]:visible').last()
        await tap(page, accountMenu)
        await page.getByRole("menu", { name: "Menu du compte" }).waitFor()
        await at(0.44)
        await page.getByRole("menuitem", { name: "Mon compte" }).hover()
        await at(0.35)
        await page.keyboard.press("Escape")
        const help = page.getByRole("link", { name: /Aide/ }).filter({ visible: true }).first()
        const popupPromise = page.waitForEvent("popup")
        await tap(page, help)
        const guide = await popupPromise
        await guide.waitForLoadState("domcontentloaded")
        const guideUrl = guide.url()
        if (!guideUrl.startsWith(baseUrl)) throw new Error("Help must remain on the isolated local application")
        await page.goto(guideUrl); await settle(page)
        await guide.close()
        await at(0.77)
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
        await page.getByRole("link", { name: /Aide/ }).filter({ visible: true }).last().scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Mobile et clavier", { description: "Les mêmes repères pour tout le monde", duration: 1_400 })
      await scene("mobile-keyboard", async (at) => {
        await page.setViewportSize({ width: 390, height: 800 })
        const portraitStart = Math.round(performance.now() - startedAt)
        await at(0.10)
        await tap(page, page.getByRole("button", { name: /Menu/ }))
        await page.getByRole("link", { name: "Membres", exact: true }).waitFor()
        await at(0.48)
        portraitFrames.push({ startMs: portraitStart, endMs: Math.round(performance.now() - startedAt), width: 390, height: 800 })
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
        const detailStart = Math.round(performance.now() - startedAt)
        await tap(page, page.getByRole("button", { name: "Rechercher", exact: true }).filter({ visible: true }))
        const field = page.getByLabel("Rechercher un bénévole, un événement ou un poste").filter({ visible: true })
        await field.waitFor()
        await at(0.30)
        await page.keyboard.press("Escape")
        await at(0.42)
        await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K")
        await field.waitFor()
        if (!(await field.evaluate(element => element === document.activeElement))) throw new Error("Shortcut did not focus the search field")
        await at(0.75)
        await page.keyboard.press("Escape")
        detailFrames.push({ startMs: detailStart, endMs: Math.round(performance.now() - startedAt), x: 640, y: 0, width: 640, height: 400 })
      })

      await page.screencast.showChapter("Retrouver une personne", { description: "Fiche membre ou inscription", duration: 1_400 })
      await scene("person", async (at) => {
        await tap(page, page.getByRole("button", { name: "Rechercher" }).filter({ visible: true }))
        const field = page.getByLabel("Rechercher un bénévole, un événement ou un poste").filter({ visible: true })
        await typeNaturally(page, field, "Léa Morel")
        await field.press("Enter")
        await page.waitForURL(/\/admin\/search/)
        await page.getByRole("heading", { name: "Recherche" }).waitFor()
        const resultsUrl = page.url()
        await at(0.30)
        await tap(page, page.locator("#search-volunteers").locator("..").getByRole("link", { name: "Léa Morel", exact: true }))
        await page.waitForURL(/\/admin\/members\?q=/); await settle(page)
        await page.getByRole("row").filter({ hasText: /Léa\s+Morel/ }).first().waitFor()
        await at(0.50)
        await page.goto(resultsUrl); await settle(page)
        await tap(page, page.locator("#search-registrations").locator("..").getByRole("link", { name: /Léa Morel/ }).first())
        await page.waitForURL(new RegExp(`/admin/events/${featureEventId}/registrations\\?q=`)); await settle(page)
        await page.getByRole("row").filter({ hasText: /Léa\s+Morel/ }).first().waitFor()
        await at(0.75)
        await page.getByText("Liste d'attente", { exact: true }).scrollIntoViewIfNeeded()
      })

      await scene("shift", async (at) => {
        await page.goto(`${baseUrl}/admin/search?q=Buvette`); await settle(page)
        const search = page.getByLabel("Nom, email, téléphone, événement ou poste")
        await at(0.32)
        await page.getByRole("heading", { name: /Créneaux/ }).scrollIntoViewIfNeeded()
        await at(0.46)
        await search.fill("")
        await typeNaturally(page, search, "Buvette village")
        await search.press("Enter")
        await page.getByRole("link", { name: /Buvette.*village/ }).waitFor()
        await at(0.72)
        await tap(page, page.getByRole("link", { name: /Buvette.*village/ }))
        await page.waitForURL(new RegExp(`/admin/events/${featureEventId}/registrations\\?shift=`)); await settle(page)
      })

      await scene("limits", async (at) => {
        await page.goto(`${baseUrl}/admin/search?q=Morel`); await settle(page)
        await page.getByText(/Seuls les 20 premiers résultats/).scrollIntoViewIfNeeded()
        const search = page.getByLabel("Nom, email, téléphone, événement ou poste")
        await at(0.46)
        await search.fill("")
        await typeNaturally(page, search, "Léa Morel")
        await search.press("Enter")
        await page.getByRole("heading", { name: /^Bénévoles \(1\)/ }).waitFor()
        await at(0.72)
        const narrowed = page.getByLabel("Nom, email, téléphone, événement ou poste")
        await narrowed.fill("")
        await typeNaturally(page, narrowed, "zoe")
        await narrowed.press("Enter")
        await page.waitForURL(/q=zoe/)
        await page.getByText("Zoé Perrin").first().scrollIntoViewIfNeeded()
      })

      await scene("result", async (at) => {
        await page.getByRole("heading", { name: "Recherche" }).waitFor()
        await at(0.72)
        await page.goto(`${baseUrl}/admin/members`); await settle(page)
        await page.getByRole("heading", { name: "Membres", exact: true }).waitFor()
        await at(0.87)
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations`); await settle(page)
        await page.getByRole("heading", { name: "Inscriptions", exact: true }).waitFor()
      })
    } else if (slug === "org-public-identity") {
      if (featureEventId !== "video-foundation-identity-event-0" || org !== "fetes-de-montvert") throw new Error("Identity recording requires its explicitly owned fixture")
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
        await field.fill("")
        await typeNaturally(page, field, "Les bénévoles des Fêtes de Montvert")
        await at(0.70)
        await tap(page, form.getByRole("button", { name: "Enregistrer" }))
        await form.getByText("Titre enregistré.", { exact: true }).waitFor()
      })

      await scene("logo", async (at) => {
        const panel = page.getByRole("heading", { name: "Logo de l'organisation", exact: true }).locator("..")
        await panel.scrollIntoViewIfNeeded()
        await at(0.20)
        await panel.locator('input[type="file"]').setInputFiles(path.resolve("videos/fixtures/montvert-demo-logo.png"))
        await panel.getByAltText("Aperçu de l'image choisie").waitFor()
        await at(0.46)
        await tap(page, panel.getByRole("button", { name: "Enregistrer le logo", exact: true }))
        await panel.getByText("Logo enregistré. Il apparaît maintenant sur vos pages publiques et vos documents.", { exact: true }).waitFor()
        await panel.getByText("Logo actuel", { exact: true }).scrollIntoViewIfNeeded()
      })

      await scene("slug", async (at) => {
        const heading = page.getByRole("heading", { name: "Identifiant public (slug)" })
        await heading.scrollIntoViewIfNeeded()
        await at(0.10)
        const identifier = page.getByLabel("Identifiant", { exact: true })
        await tap(page, identifier)
        await page.getByText(/Adresse de votre espace/).scrollIntoViewIfNeeded()
        await at(0.32)
        await identifier.fill("fetes-de-montvert-rencontres")
        await tap(page, heading.locator("..").getByRole("button", { name: "Modifier", exact: true }))
        await page.getByText(/Des événements publiés existent/).waitFor()
        await at(0.90)
        await tap(page, page.getByRole("button", { name: "Annuler", exact: true }))
        await identifier.fill("fetes-de-montvert")
        await at(0.94)
        await page.getByText("Anciens identifiants (redirigent vers l'actuel)", { exact: true }).scrollIntoViewIfNeeded()
        await page.getByText("montvert-ancien", { exact: true }).waitFor()
        await page.getByText(/supprimer un ancien identifiant cassera les liens/).waitFor()
      })

      await page.goto(`${baseUrl}/?org=${encodeURIComponent(org)}`); await settle(page)
      await scene("public-page", async (at) => {
        await page.getByText("Les bénévoles des Fêtes de Montvert").first().waitFor()
        await page.locator('img[src^="/api/public/organizations/video-foundation-identity/logo?"]').waitFor()
        await page.getByRole("link", { name: "Marché solidaire" }).waitFor()
        if (await page.getByRole("link", { name: "Rencontre des organisateurs" }).count()) throw new Error("Unlisted event leaked into public organization list")
        await at(0.40)
        await page.getByRole("link", { name: "Fête du village de Montvert" }).scrollIntoViewIfNeeded()
        await at(0.62)
        await page.goto(`${baseUrl}/rencontre-2?org=${encodeURIComponent(org)}`); await settle(page)
        await page.getByRole("heading", { name: "Rencontre des organisateurs", exact: true }).waitFor()
      })

      await scene("event-result", async (at) => {
        await page.goto(`${baseUrl}/?org=${encodeURIComponent(org)}`); await settle(page)
        const eventLink = page.getByRole("link", { name: "Fête du village de Montvert" })
        await tap(page, eventLink)
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).waitFor()
        await at(0.58)
        await page.getByText("Place du Collège, Montvert").first().scrollIntoViewIfNeeded()
      })

      await scene("remove-logo", async (at) => {
        await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
        const panel = page.getByRole("heading", { name: "Logo de l'organisation", exact: true }).locator("..")
        await panel.scrollIntoViewIfNeeded()
        await at(0.25)
        await tap(page, panel.getByRole("button", { name: "Retirer le logo", exact: true }))
        const confirmation = page.getByRole("alertdialog", { name: "Retirer le logo de l'organisation ?" })
        await confirmation.waitFor()
        await at(0.48)
        await tap(page, confirmation.getByRole("button", { name: "Retirer le logo", exact: true }))
        await panel.getByText("Logo retiré. Le nom de l'organisation reste affiché.", { exact: true }).waitFor()
        await at(0.67)
        await page.goto(`${baseUrl}/?org=${encodeURIComponent(org)}`); await settle(page)
        await page.getByText("Les bénévoles des Fêtes de Montvert", { exact: true }).waitFor()
      })

      await scene("result", async (at) => {
        await page.goto(`${baseUrl}/?org=${encodeURIComponent(org)}`); await settle(page)
        await page.getByText("Les bénévoles des Fêtes de Montvert").first().waitFor()
        await at(0.34)
        await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
        await page.getByRole("heading", { name: "Nom de l'organisation", exact: true }).scrollIntoViewIfNeeded()
        await at(0.58)
        await page.getByRole("heading", { name: "Titre de la page publique", exact: true }).scrollIntoViewIfNeeded()
        await at(0.76)
        await page.getByText("Anciens identifiants (redirigent vers l'actuel)", { exact: true }).scrollIntoViewIfNeeded()
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
        await at(0.24)
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
        const unchangedSlot = page.getByRole("button", { name: /Accueil.*09h.*12h/ })
        await unchangedSlot.waitFor()
        await unchangedSlot.scrollIntoViewIfNeeded()
        await at(0.84)
        await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
      })

      await page.screencast.showChapter("La convention", { description: "Le cadre accepté par chaque bénévole", duration: 1_400 })
      await scene("charter", async (at) => {
        const heading = page.getByRole("heading", { name: "Convention des Bénévoles" })
        await heading.scrollIntoViewIfNeeded()
        const panel = heading.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')]")
        const charter = panel.locator("textarea")
        const insurance = panel.getByRole("switch", { name: "Assurance RC fournie par l'organisation" })
        await at(0.12)
        await tap(page, insurance)
        await at(0.23)
        await tap(page, insurance)
        await at(0.72)
        await tap(page, panel.getByRole("button", { name: "Réinitialiser la convention par défaut", exact: true }))
        const completeText = await charter.inputValue()
        if (!completeText.includes("dès que possible") || !completeText.includes("3. L'organisation")) {
          throw new Error("Current complete convention required: do not capture the obsolete build or the one-sentence test text")
        }
        await tap(page, charter)
        await at(0.85)
        await tap(page, panel.getByRole("button", { name: "Enregistrer" }))
        await panel.getByText("Enregistré ✓").waitFor()
      })

      await page.screencast.showChapter("Côté bénévole", { description: "Vérifier le texte réellement présenté", duration: 1_400 })
      await scene("public-setup", async (at) => {
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).waitFor()
        await at(0.22)
        await tap(page, page.getByRole("button", { name: /Accueil.*09h.*12h/ }))
        await at(0.52)
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        await page.getByRole("heading", { name: "Tes informations" }).waitFor()
      })

      await scene("public-result", async (at) => {
        await page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).scrollIntoViewIfNeeded()
        await at(0.08)
        await tap(page, page.getByRole("button", { name: "convention des bénévoles" }))
        await page.getByRole("dialog", { name: "Convention des Bénévoles" }).waitFor()
        await at(0.32)
        const dialog = page.getByRole("dialog", { name: "Convention des Bénévoles" })
        const box = await dialog.boundingBox()
        if (!box) throw new Error("Convention dialog is not visible")
        const previousScroll = await dialog.evaluate(element => [element, ...element.querySelectorAll("*")].reduce((sum, node) => sum + node.scrollTop, 0))
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.wheel(0, 650)
        await page.waitForTimeout(450)
        await page.mouse.wheel(0, 250)
        await page.waitForTimeout(450)
        const currentScroll = await dialog.evaluate(element => [element, ...element.querySelectorAll("*")].reduce((sum, node) => sum + node.scrollTop, 0))
        if (currentScroll <= previousScroll) throw new Error("Convention body did not actually scroll")
        await at(0.66)
        await tap(page, page.getByRole("button", { name: "J'ai lu et j'accepte" }))
        await page.getByRole("heading", { name: "Tes informations" }).waitFor()
      })

      await scene("attention", async (at) => {
        await page.getByRole("heading", { name: "Tes informations" }).scrollIntoViewIfNeeded()
        await at(0.24)
        await page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).scrollIntoViewIfNeeded()
        await at(0.36)
        await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
        await page.getByRole("heading", { name: "Convention des Bénévoles", exact: true }).scrollIntoViewIfNeeded()
        await at(0.80)
        await page.goto(`${baseUrl}/admin/events/${featureEventId}`); await settle(page)
        await page.getByRole("heading", { name: "Communications", exact: true }).scrollIntoViewIfNeeded()
      })

      await scene("result", async () => {
        await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
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
        await at(0.22)
        await tap(page, waitlist)
        await at(0.64)
        await page.getByRole("checkbox", { name: /Sur validation/ }).scrollIntoViewIfNeeded()
      })
      await scene("practical", async (at) => {
        await page.getByRole("group", { name: "Infos pratiques pour les bénévoles" }).scrollIntoViewIfNeeded()
        await at(0.05)
        await typeNaturally(page, page.getByLabel("Lieu de rendez-vous"), "Entrée artistes, portail nord")
        await typeNaturally(page, page.getByLabel("Consigne pratique"), "Venir dix minutes avant avec des chaussures fermées.")
        await typeNaturally(page, page.getByLabel("Personne de contact"), "Léa, accueil artistes")
        await typeNaturally(page, page.getByLabel("Téléphone du contact"), "079 000 01 24")
        await at(0.63)
        await typeNaturally(page, page.getByLabel("Coordonnées GPS ou lien de carte"), "46.1805734, 6.1228285")
      })
      await scene("save", async (at) => {
        await page.getByRole("button", { name: "Ajouter", exact: true }).scrollIntoViewIfNeeded()
        await at(0.08)
        await tap(page, page.getByRole("button", { name: "Ajouter", exact: true }))
        await page.getByText("Accueil des artistes", { exact: true }).first().waitFor()
        await at(0.60)
        await tap(page, page.getByRole("button", { name: "Liste", exact: true }))
        await tap(page, page.getByRole("row").filter({ hasText: "Accueil des artistes" }).getByRole("button", { name: "Modifier", exact: true }))
        await page.getByLabel("Consigne pratique").scrollIntoViewIfNeeded()
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
        await page.getByRole("button", { name: "Frise", exact: true }).scrollIntoViewIfNeeded()
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
        const indigo = palette.getByRole("button", { name: "Indigo", exact: true })
        // Retakes retain their own data. Always demonstrate a real change,
        // rather than clicking an already-selected colour without an effect.
        const choice = await indigo.getAttribute("aria-pressed") === "true"
          ? palette.getByRole("button", { name: "Automatique", exact: false })
          : indigo
        await tap(page, choice)
        await palette.waitFor({ state: "hidden" })
      })
      // Save outside the narrated cue: its first sentence already refers to
      // the Frise, not to the still-open management panel.
      await tap(page, page.getByRole("button", { name: "Enregistrer l'ordre" }))
      await page.getByRole("heading", { name: "Gérer les postes" }).waitFor({ state: "hidden" })
      await scene("result", async (at) => {
        const timeline = page.getByRole("button", { name: "Frise", exact: true })
        await timeline.scrollIntoViewIfNeeded()
        await at(0.03)
        await tap(page, timeline)
        await page.getByRole("region", { name: /^Planning du/ }).first().waitFor()
        await at(0.38)
        await tap(page, page.getByRole("button", { name: "Liste", exact: true }))
        await at(0.78)
        await tap(page, timeline)
        if (await timeline.getAttribute("aria-pressed") !== "true") throw new Error("Timeline view was not selected")
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
    } else if (slug === "volunteer-choose-shifts") {
      await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Essayer, comprendre, puis confirmer", duration: 2_300 })
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).waitFor()
      })

      await page.screencast.showChapter("Composer son planning", { description: "Ajouter et retirer avant tout envoi", duration: 1_400 })
      await scene("select", async (at) => {
        const accueil = page.getByRole("button", { name: /Sélectionner — Accueil 15h–18h/ })
        await accueil.scrollIntoViewIfNeeded()
        await tap(page, accueil)
        await at(0.28)
        const demontage = page.getByRole("button", { name: /Sélectionner — Démontage 15h–18h/ })
        await demontage.scrollIntoViewIfNeeded()
        await tap(page, demontage)
        await at(0.55)
        await page.getByText("Créneaux sélectionnés").scrollIntoViewIfNeeded()
        await at(0.72)
        await tap(page, page.getByRole("button", { name: "Retirer Démontage de la sélection" }))
      })

      await scene("capacity", async (at) => {
        const available = page.getByRole("button", { name: /Accueil 15h–18h.*2 places libres sur 3/ })
        await available.scrollIntoViewIfNeeded()
        await available.focus()
        await at(0.34)
        const full = page.getByRole("button", { name: /Accueil 12h–15h/ })
        await full.scrollIntoViewIfNeeded()
        await full.focus()
        await at(0.68)
      })

      await scene("waitlist", async (at) => {
        const waiting = page.getByRole("button", { name: /Rejoindre la file d'attente — Buvette 10h–14h/ })
        await waiting.scrollIntoViewIfNeeded()
        await tap(page, waiting)
        await at(0.40)
        await page.getByText(/Complet · liste d'attente si place libérée/).filter({ visible: true }).first().scrollIntoViewIfNeeded()
        await at(0.68)
        await tap(page, page.getByRole("button", { name: "Retirer Buvette de la sélection" }))
      })

      await scene("approval-reserved", async (at) => {
        const approval = page.getByRole("button", { name: /Sélectionner — Navette.*sur validation/ }).first()
        await approval.scrollIntoViewIfNeeded()
        await approval.focus()
        await at(0.38)
        const reserved = page.getByRole("button", { name: /Sécurité.*réservé à certains membres/ }).first()
        await reserved.scrollIntoViewIfNeeded()
        await reserved.focus()
        await at(0.70)
      })

      await page.screencast.showChapter("Éviter les incompatibilités", { description: "Chevauchements et engagements existants", duration: 1_400 })
      await scene("conflict", async (at) => {
        const current = page.getByRole("button", { name: /Désélectionner — Accueil 15h–18h/ })
        if (await current.count()) await tap(page, current)
        const morning = page.getByRole("button", { name: /Sélectionner — Accueil 09h–12h/ })
        await morning.scrollIntoViewIfNeeded()
        await tap(page, morning)
        await at(0.40)
        const overlapping = page.getByRole("button", { name: /Navette.*08h–12h/ }).first()
        await overlapping.scrollIntoViewIfNeeded()
        await overlapping.focus()
        await at(0.72)
        await tap(page, page.getByRole("button", { name: /Désélectionner — Accueil 09h–12h/ }))
      })

      await scene("known", async (at) => {
        await page.goto(`${baseUrl}/my/demo-waitlist-camille-0001`); await settle(page)
        await page.getByRole("heading", { name: /Mes inscriptions/ }).waitFor()
        await at(0.22)
        await page.getByText(/Camille Rochat/).first().scrollIntoViewIfNeeded()
        await at(0.44)
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
        await page.getByText(/Camille Rochat/).first().waitFor()
        await at(0.70)
        await page.getByText("Créneaux sélectionnés").scrollIntoViewIfNeeded()
      })

      await scene("limit", async (at) => {
        const limited = page.getByRole("button", { name: /Buvette.*limite de 2 par personne atteinte/ }).first()
        await limited.scrollIntoViewIfNeeded()
        await at(0.30)
        await limited.focus()
        await at(0.62)
        const cancel = page.getByRole("button", { name: /Annuler l'inscription à Buvette/ }).first()
        await cancel.scrollIntoViewIfNeeded()
        await cancel.focus()
      })

      await scene("result", async (at) => {
        const extra = page.getByRole("button", { name: /Sélectionner — Montage 07h–09h/ })
        await extra.scrollIntoViewIfNeeded()
        await tap(page, extra)
        await page.getByText("Créneaux sélectionnés").scrollIntoViewIfNeeded()
        await at(0.28)
        const continueButton = page.getByRole("button", { name: /^Continuer/ })
        await continueButton.scrollIntoViewIfNeeded()
        await at(0.64)
        await continueButton.focus()
      })
    } else if (slug === "volunteer-confirmation-errors") {
      await (await import("../lib/record-registration-errors")).recordRegistrationErrors({ page, base: baseUrl, directory: dir, title: manifest.title, scene, tap, settle })
    } else if (slug === "volunteer-form-recap") {
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Les bonnes informations et un engagement réaliste", duration: 2_300 })
      })
      await scene("selection", async (at) => {
        for (const name of [/Sélectionner — Accueil 09h–12h/, /Sélectionner — Logistique/, /Sélectionner — Rangement/, /Sélectionner — Buvette 10h–14h/]) {
          const button = page.getByRole("button", { name }).last()
          await tap(page, button)
          await page.waitForTimeout(800)
        }
        await at(0.64)
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        await page.getByRole("heading", { name: "Tes informations" }).waitFor()
      })
      await scene("identity", async (at) => {
        await typeNaturally(page, page.getByLabel("Prénom *", { exact: true }), "Alex")
        await typeNaturally(page, page.getByLabel("Nom *", { exact: true }), "Martin")
        await typeNaturally(page, page.getByLabel("Email *", { exact: true }), "alex.martin@example.org")
        await typeNaturally(page, page.getByLabel("Téléphone *", { exact: true }), "079 000 12 34")
        await at(0.72)
        await fillVisibly(page, page.getByLabel("Date de naissance *"), "1994-06-12")
      })
      await scene("questions", async (at) => {
        await tap(page, page.getByRole("radio", { name: "M", exact: true }))
        await at(0.24)
        await typeNaturally(page, page.getByLabel(/Régime alimentaire/), "Végétarien")
        await at(0.48)
        await typeNaturally(page, page.getByLabel("Permis de conduire"), "Permis B")
        await at(0.68)
        await typeNaturally(page, page.getByLabel(/Commentaire/), "Je prévois une pause avant la nuit.")
      })
      await scene("agreement", async (at) => {
        await tap(page, page.getByRole("button", { name: "convention des bénévoles" }))
        await page.getByRole("dialog", { name: "Convention des Bénévoles" }).waitFor()
        await at(0.44)
        await tap(page, page.getByRole("button", { name: "J'ai lu et j'accepte" }))
        await at(0.70)
        await tap(page, page.getByRole("checkbox", { name: /^J'accepte que l'association qui organise cet événement/ }))
      })
      const recap = page.locator(".lg\\:col-start-2").filter({ hasText: "Vos créneaux" }).first()
      await scene("recap", async (at) => {
        await recap.getByText(/fin le lendemain/).scrollIntoViewIfNeeded()
        await at(0.34)
        await recap.getByRole("link", { name: /Voir sur la carte/ }).first().scrollIntoViewIfNeeded()
        await at(0.68)
        await recap.getByText("Transmis à l'organisation").scrollIntoViewIfNeeded()
      })
      await scene("workload", async (at) => {
        await recap.getByText("Journée chargée").scrollIntoViewIfNeeded()
        await at(0.50)
        await tap(page, page.getByRole("button", { name: "Retour", exact: true }))
        await at(0.70)
        await tap(page, page.getByRole("button", { name: /Désélectionner — Logistique/ }))
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
      })
      await scene("result", async (at) => {
        await page.getByRole("heading", { name: "Tes informations" }).scrollIntoViewIfNeeded()
        await at(0.30)
        await page.getByLabel("Email *", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.64)
        await page.getByRole("button", { name: "Confirmer mon inscription" }).scrollIntoViewIfNeeded()
      })
    } else if (slug === "volunteer-personal-registrations") {
      const initial = await page.evaluate(async () => (await fetch("/api/public/registrations/demo-volunteer-camille-0001")).json())
      for (const status of ["active", "waiting", "offered", "requested"]) {
        if (!initial.registrations.some((r: { status: string }) => r.status === status)) throw new Error(`Personal demo missing ${status}`)
      }
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Ton planning et tes choix, depuis ton lien personnel", duration: 2_300 })
        await page.getByRole("heading", { name: "Mes inscriptions" }).waitFor()
      })
      await scene("practical", async (at) => {
        await page.getByText("Arrive 15 minutes avant, au stand bleu.", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.40)
        await page.getByRole("link", { name: /Voir sur la carte/ }).first().scrollIntoViewIfNeeded()
        await at(0.65)
        await page.getByText(/Manon Aebi/).first().scrollIntoViewIfNeeded()
      })
      await scene("states", async (at) => {
        await page.getByRole("button", { name: "Quitter la liste d'attente du créneau Buvette", exact: true }).scrollIntoViewIfNeeded()
        await at(0.30)
        await page.getByRole("link", { name: "Prendre la place : Buvette", exact: true }).scrollIntoViewIfNeeded()
        await at(0.65)
        await page.getByText(/Créneau sur validation/).scrollIntoViewIfNeeded()
      })
      await scene("cancel", async (at) => {
        const button = page.getByRole("button", { name: "Annuler le créneau Accueil", exact: true })
        await tap(page, button)
        await at(0.22)
        await tap(page, page.getByRole("alertdialog").getByRole("button", { name: "Non, garder", exact: true }))
        await page.getByRole("alertdialog").waitFor({ state: "hidden" })
        await at(0.45)
        await tap(page, button)
        await at(0.62)
        await tap(page, page.getByRole("alertdialog").getByRole("button", { name: "Oui, annuler", exact: true }))
        await button.waitFor({ state: "hidden" })
      })
      const withdraw = async (at: (fraction: number) => Promise<void>, buttonName: string, confirmName: string) => {
        const button = page.getByRole("button", { name: buttonName, exact: true })
        await tap(page, button)
        await at(0.50)
        await tap(page, page.getByRole("alertdialog").getByRole("button", { name: confirmName, exact: true }))
        await button.waitFor({ state: "hidden" })
      }
      await scene("waiting", async at => withdraw(at, "Quitter la liste d'attente du créneau Buvette", "Oui, quitter"))
      await scene("offer", async at => withdraw(at, "Refuser la place proposée sur le créneau Buvette", "Oui, refuser"))
      await scene("request", async at => {
        await withdraw(at, "Retirer ma demande pour le créneau Navette du dimanche", "Oui, retirer")
        await page.getByRole("heading", { name: "Toutes tes inscriptions ont été annulées" }).waitFor()
        if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Refusing personal state verification outside video DB")
        const { PrismaClient } = await import("../../src/generated/prisma/client")
        const { PrismaPg } = await import("@prisma/adapter-pg")
        const verificationDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
        try {
          const remaining = await verificationDb.registration.count({ where: {
            eventId: featureEventId, volunteer: { email: "camille.rochat@example.org" },
            status: { in: ["active", "waiting", "offered", "requested"] },
          } })
          if (remaining) throw new Error("Server still has live personal registrations after withdrawal")
        } finally {
          await verificationDb.$disconnect()
        }
      })
      await scene("return", async at => {
        // On localhost tenant selection uses ?org=; production links resolve the tenant from
        // its domain. Supply that local routing context without changing application code.
        await page.route(`${baseUrl}/${eventSlug}**`, async route => {
          const target = new URL(route.request().url())
          target.searchParams.set("org", org)
          await route.continue({ url: target.toString() })
        })
        await tap(page, page.getByRole("link", { name: "Retour à l'accueil", exact: true }))
        await settle(page)
        await page.getByRole("heading", { name: "Fête du village de Montvert", exact: true }).waitFor()
        await at(0.48)
        await page.getByRole("button", { name: /Sélectionner —/ }).first().scrollIntoViewIfNeeded()
      })
    } else if (slug === "volunteer-calendar") {
      const personalUrl = `${baseUrl}/my/demo-volunteer-camille-0001`
      const folder = path.join(dir, "downloads")
      await mkdir(folder, { recursive: true })
      const download = async (link: Locator, filename: string) => {
        const pending = page.waitForEvent("download")
        await tap(page, link)
        const file = await pending
        const target = path.join(folder, filename)
        await file.saveAs(target)
        return (await readFile(target, "utf8")).replace(/\r\n[ \t]/g, "")
      }
      const allLink = () => page.getByRole("link", { name: /^Ajouter tout mon planning/ })
      const events = (ics: string) => ics.split("BEGIN:VEVENT").slice(1).map(block => block.split("END:VEVENT")[0])
      let oldPlanning = ""
      let newPlanning = ""
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Un fichier pour les créneaux confirmés", duration: 2_300 })
        await allLink().waitFor()
      })
      await scene("one", async at => {
        const one = await download(page.getByRole("link", { name: /Ajouter à mon calendrier.*Accueil/ }), "accueil.ics")
        if (events(one).length !== 1 || !one.includes("Accueil")) throw new Error("Single calendar download is not exactly Accueil")
        await at(0.55)
        await page.getByText(/Le fichier s'ouvre avec l'agenda/).scrollIntoViewIfNeeded()
      })
      await scene("all", async at => {
        oldPlanning = await download(allLink(), "planning-original.ics")
        if (events(oldPlanning).length !== 3) throw new Error("Calendar export must contain exactly three confirmed registrations")
        if (!oldPlanning.includes("Rangement de nuit") || !oldPlanning.includes("Accueil")) throw new Error("Calendar export is missing a confirmed shift")
        await at(0.55)
        await page.getByRole("button", { name: "Quitter la liste d'attente du créneau Buvette", exact: true }).scrollIntoViewIfNeeded()
      })
      await scene("import", async at => {
        // User requested no native Calendar access. Explain import over the real download
        // control and its hint; do not fabricate or claim a calendar-client result.
        await allLink().scrollIntoViewIfNeeded()
        await at(0.48)
        await page.getByText(/Le fichier s'ouvre avec l'agenda/).scrollIntoViewIfNeeded()
      })
      await scene("details", async at => {
        for (const expected of ["Arrive 15 minutes avant", "Manon Aebi", "/my/", "GEO:"]) {
          if (!oldPlanning.includes(expected)) throw new Error(`Calendar download missing ${expected}`)
        }
        await page.getByText("Arrive 15 minutes avant, au stand bleu.", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.38)
        await page.getByText(/Manon Aebi/).scrollIntoViewIfNeeded()
        await at(0.66)
        await page.getByRole("heading", { name: "Ton lien personnel", exact: true }).scrollIntoViewIfNeeded()
      })
      await scene("night", async () => {
        await page.getByText("Rangement de nuit — calendrier", { exact: true }).scrollIntoViewIfNeeded()
        const night = events(oldPlanning).find(event => event.includes("Rangement de nuit"))
        if (!night?.includes("DTSTART:20261010T200000Z") || !night.includes("DTEND:20261011T000000Z")) throw new Error("Overnight calendar dates or Zurich conversion incorrect")
      })
      await scene("change", async at => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
        await tap(page, page.getByRole("button", { name: "Liste", exact: true }))
        const row = page.getByRole("row").filter({ hasText: "Rangement de nuit — calendrier" })
        await tap(page, row.getByRole("button", { name: "Modifier", exact: true }))
        await fillVisibly(page, page.getByLabel("Début *"), "23:00")
        await at(0.45)
        await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true }))
        await page.getByRole("heading", { name: "Modifier le créneau", exact: true }).waitFor({ state: "hidden" })
        if ((await readFile(path.join(folder, "planning-original.ics"), "utf8")).replace(/\r\n[ \t]/g, "") !== oldPlanning) throw new Error("Previously downloaded calendar changed unexpectedly")
        await at(0.75)
        await page.goto(personalUrl); await settle(page)
        await page.getByText("Rangement de nuit — calendrier", { exact: true }).scrollIntoViewIfNeeded()
      })
      await scene("reimport", async at => {
        newPlanning = await download(allLink(), "planning-modifie.ics")
        const uids = (ics: string) => [...ics.matchAll(/^UID:(.+)$/gm)].map(match => match[1].trim()).sort()
        if (JSON.stringify(uids(oldPlanning)) !== JSON.stringify(uids(newPlanning))) throw new Error("Calendar registration identifiers changed")
        const night = events(newPlanning).find(event => event.includes("Rangement de nuit"))
        if (!night?.includes("DTSTART:20261010T210000Z")) throw new Error("Updated calendar does not contain 23:00 Zurich start")
        await at(0.52)
        await page.getByText(/Le fichier s'ouvre avec l'agenda/).scrollIntoViewIfNeeded()
      })
      await scene("result", async at => {
        await page.getByRole("heading", { name: "Mes inscriptions", exact: true }).scrollIntoViewIfNeeded()
        await at(0.50)
        await page.getByRole("button", { name: "Quitter la liste d'attente du créneau Buvette", exact: true }).scrollIntoViewIfNeeded()
      })
      await writeFile(path.join(dir, "calendar-download-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), originalEvents: events(oldPlanning).length, updatedEvents: events(newPlanning).length, stableRegistrationIds: true, overnightUtcVerified: true, originalFileUnchanged: true, nativeCalendarImport: "Not performed, per user request" }, null, 2))
    } else if (slug === "privacy-personal-links") {
      if (!privacyRecording) throw new Error("Privacy recording preparation missing")
      const { recordPrivacy } = await import("../lib/record-privacy")
      await recordPrivacy({ page, base: baseUrl, directory: dir, title: manifest.title, setup: privacyRecording, scene, tap, settle })
    } else if (slug === "email-delivery-failures") {
      const { recordDelivery } = await import("../lib/record-delivery")
      const { prisma: db } = await import("../../src/lib/prisma")
      try { await recordDelivery({ page, base: baseUrl, directory: dir, title: manifest.title, db, scene, tap, settle }) }
      finally { await db.$disconnect() }
    } else if (slug === "last-minute-changes") {
      const { recordLastMinute } = await import("../lib/record-last-minute")
      await recordLastMinute({ page, base: baseUrl, directory: dir, title: manifest.title, scene, tap, settle })
    } else if (slug === "data-exports-archives") {
      const { recordDataExports } = await import("../lib/record-data-exports")
      await recordDataExports({ page, base: baseUrl, directory: dir, title: manifest.title, scene, tap, settle })
    } else if (slug === "organization-activity-log") {
      const { recordOrgActivity } = await import("../lib/record-org-activity")
      await recordOrgActivity({ page, base: baseUrl, directory: dir, title: manifest.title, scene, tap, settle })
    } else if (slug === "event-activity-log") {
      const { recordEventLog } = await import("../lib/record-event-log")
      await recordEventLog({ page, base: baseUrl, eventId: featureEventId, directory: dir, title: manifest.title, scene, tap, settle })
    } else if (slug === "attendance-check-in") {
      const { recordAttendance } = await import("../lib/record-attendance")
      await recordAttendance({ page, base: baseUrl, eventId: featureEventId, directory: dir, title: manifest.title, scene, tap, settle })
    } else if (slug === "event-reports") {
      const { recordReports } = await import("../lib/record-reports")
      await recordReports({ page, base: baseUrl, eventId: featureEventId, directory: dir, title: manifest.title, scene, tap, settle })
    } else if (slug === "volunteer-badges") {
      const { recordBadges } = await import("../lib/record-badges")
      await recordBadges({ page, base: baseUrl, eventId: featureEventId, title: manifest.title, scene, tap, settle })
    } else if (slug === "reminders-changes") {
      const { recordReminders } = await import("../lib/record-reminders")
      await recordReminders({ page, base: baseUrl, eventId: featureEventId, directory: dir, title: manifest.title, scene, tap, settle })
    } else if (slug === "targeted-messages") {
      if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Messages require isolated video DB")
      const { PrismaClient } = await import("../../src/generated/prisma/client")
      const { PrismaPg } = await import("@prisma/adapter-pg")
      const { selectRecipients, selectInvitedWithoutShift } = await import("../../src/lib/targeted-message")
      const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
      const url = `${baseUrl}/admin/events/${featureEventId}/message`
      const templatesUrl = `${baseUrl}/admin/settings/message-templates`
      const modelName = "Briefing avant le créneau"
      const subject = "Ton briefing pour {poste}"
      const body = "Bonjour {prénom},\n\nPour {événement}, retrouve-nous quinze minutes avant {créneau}.\nLe responsable te montrera le matériel et répondra à tes questions.\n\nMerci pour ton aide et à très vite !"
      const checks: Record<string, unknown> = { pushReceptionVerified: false }
      const shift = await db.shift.findFirstOrThrow({ where: { eventId: featureEventId, roleName: "Buvette", status: "open" }, orderBy: [{ date: "asc" }, { startTime: "asc" }] })
      const registrations = await db.registration.findMany({ where: { eventId: featureEventId }, include: { volunteer: true, shift: true } })
      const invites = await db.memberInvite.findMany({ where: { eventId: featureEventId }, include: { volunteer: true } })
      const roleRecipients = selectRecipients(registrations, { kind: "role", roleName: "Buvette" })
      const recipients = selectRecipients(registrations, { kind: "shift", shiftId: shift.id })
      const historyBefore = await db.targetedMessage.count({ where: { eventId: featureEventId } })
      const outboxBefore = await db.notificationOutbox.count({ where: { organizationId: "default" } })
      const writeField = async (field: Locator, value: string) => {
        await tap(page, field)
        await field.press("ControlOrMeta+A")
        await field.pressSequentially(value, { delay: 95 })
        await page.waitForTimeout(180)
      }
      const chooseShift = async () => {
        await tap(page, page.getByRole("radio", { name: "Les bénévoles d'un créneau", exact: true }))
        await page.getByLabel("Créneau", { exact: true }).selectOption(shift.id); await settle(page)
      }
      const preview = async () => { await tap(page, page.getByRole("button", { name: "Voir l'aperçu et envoyer", exact: true })); await page.getByRole("dialog", { name: "Aperçu de l'email", exact: true }).waitFor() }
      const confirm = async () => { await tap(page, page.getByRole("dialog").getByRole("button", { name: /^Envoyer à/ })); await page.getByRole("dialog", { name: "Confirmer l'envoi", exact: true }).waitFor() }
      try {
        await scene("welcome", async () => { await page.screencast.showChapter(manifest.title, { description: "Choisir, personnaliser, vérifier", duration: 2400 }); await page.getByRole("heading", { name: "Écrire aux bénévoles", exact: true }).waitFor() })
        await scene("audiences", async at => {
          const choices = [
            ["Tous les bénévoles inscrits", selectRecipients(registrations, { kind: "event" }).length],
            ["Les bénévoles d'un poste", roleRecipients.length],
            ["Les bénévoles d'un créneau", recipients.length],
            ["Les personnes en liste d'attente", selectRecipients(registrations, { kind: "waitlist" }).length],
            ["Les invités sans créneau confirmé", selectInvitedWithoutShift(invites, registrations).length],
          ] as const
          for (const [index, [label, expected]] of choices.entries()) {
            await at(index * 0.18); await tap(page, page.getByRole("radio", { name: label, exact: true }))
            if (index === 1) await page.getByLabel("Poste", { exact: true }).selectOption("Buvette")
            if (index === 2) await page.getByLabel("Créneau", { exact: true }).selectOption(shift.id)
            await page.getByText(new RegExp(`^${expected} personnes? recevr`)).waitFor()
          }
          checks.fiveAudienceCounts = true
        })
        await scene("count", async at => {
          const lea = roleRecipients.filter(r => r.volunteerId === "video-message-lea")
          if (lea.length !== 1 || lea[0].registrations.length !== 2) throw new Error("Léa deduplication fixture missing")
          await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations`); await settle(page)
          await typeNaturally(page, page.getByRole("textbox", { name: "Rechercher un bénévole", exact: true }), "Léa Giroud")
          if (await page.locator("tbody tr").count() !== 2) throw new Error("Expected two Léa registrations")
          await at(0.55); await page.goto(url); await settle(page)
          await tap(page, page.getByRole("radio", { name: "Les bénévoles d'un poste", exact: true })); await page.getByLabel("Poste", { exact: true }).selectOption("Buvette"); await settle(page)
          checks.multipleRegistrationsOneRecipient = true
        })
        await scene("template-create", async at => {
          await page.goto(templatesUrl); await settle(page)
          if (await db.messageTemplate.count({ where: { organizationId: "default", name: modelName } })) throw new Error("Model already exists; reset scenario")
          await tap(page, page.getByRole("button", { name: "Nouveau modèle", exact: true }))
          await writeField(page.getByLabel("Nom du modèle *", { exact: true }), modelName)
          await writeField(page.getByLabel("Objet *", { exact: true }), subject)
          await writeField(page.getByLabel("Message *", { exact: true }), body)
          await at(0.8); await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true })); await page.getByText(modelName, { exact: true }).waitFor()
        })
        await scene("variables", async at => {
          await tap(page, page.getByRole("button", { name: `Modifier le modèle « ${modelName} »`, exact: true }))
          await page.getByLabel("Objet *", { exact: true }).scrollIntoViewIfNeeded()
          await at(0.35); await writeField(page.getByLabel("Objet *", { exact: true }), "Ton briefing pour {lieu}")
          await page.getByText(/Variable inconnue : \{lieu\}/).waitFor()
          await at(0.62); await writeField(page.getByLabel("Objet *", { exact: true }), subject)
          await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true }))
          checks.unknownVariableVisible = true
        })
        await scene("apply", async at => {
          await page.goto(url); await settle(page)
          await writeField(page.getByLabel("Objet *", { exact: true }), "Merci pour ton aide")
          await writeField(page.getByLabel("Message *", { exact: true }), "On se retrouve au stand d'accueil.")
          await page.getByLabel("Partir d'un modèle", { exact: true }).selectOption({ label: modelName })
          if (await page.getByLabel("Objet *", { exact: true }).inputValue() !== "Merci pour ton aide") throw new Error("Selection replaced text prematurely")
          await at(0.35); await tap(page, page.getByRole("button", { name: "Utiliser ce modèle", exact: true }))
          await at(0.53); await tap(page, page.getByRole("button", { name: "Rétablir le texte précédent", exact: true }))
          if (await page.getByLabel("Objet *", { exact: true }).inputValue() !== "Merci pour ton aide") throw new Error("Text restore failed")
          await at(0.72); await tap(page, page.getByRole("button", { name: "Utiliser ce modèle", exact: true })); await chooseShift()
          checks.modelApplyAndRestore = true
        })
        await scene("context", async at => {
          await tap(page, page.getByRole("radio", { name: "Tous les bénévoles inscrits", exact: true }))
          await page.getByLabel("Message *", { exact: true }).scrollIntoViewIfNeeded()
          if (await page.getByLabel("Message *", { exact: true }).getAttribute("aria-invalid") !== "true") throw new Error("Context error not exposed")
          await at(0.57); await chooseShift()
          if (await page.getByLabel("Message *", { exact: true }).getAttribute("aria-invalid") === "true") throw new Error("Context error not cleared")
          checks.contextVariableErrorVisible = true
        })
        await scene("preview", async at => {
          await preview()
          const text = await page.frameLocator('iframe[title="Contenu de l\'email"]').locator("body").innerText()
          if (text.includes("{prénom}") || !text.includes(recipients[0].volunteer.firstName) || !text.includes(shift.startTime)) throw new Error("Preview variables not rendered")
          await at(0.64); await tap(page, page.getByRole("button", { name: "Retour au message", exact: true }))
          const message = page.getByLabel("Message *", { exact: true })
          await tap(page, message); await message.press("ControlOrMeta+A"); await message.press("ArrowRight")
          await message.pressSequentially("\nPrends aussi une gourde.", { delay: 95 })
          if (await message.inputValue() !== body + "\nPrends aussi une gourde.") throw new Error("Preview correction wasn't appended as intended")
          checks.personalizedPreviewVisible = true
        })
        await scene("push", async at => {
          const checkbox = page.getByRole("checkbox", { name: "Envoyer aussi une notification (téléphone ou ordinateur)", exact: true })
          await checkbox.scrollIntoViewIfNeeded(); await at(0.25); await tap(page, checkbox)
          await at(0.7); await tap(page, checkbox)
          checks.pushOptionExplainedNotReceipt = true
        })
        await scene("confirm", async at => {
          await preview(); await at(0.18); await confirm()
          await at(0.35); await tap(page, page.getByRole("dialog").getByRole("button", { name: "Annuler", exact: true }))
          if (await db.targetedMessage.count({ where: { eventId: featureEventId } }) !== historyBefore || await db.notificationOutbox.count({ where: { organizationId: "default" } }) !== outboxBefore) throw new Error("Cancelled send created notification")
          checks.cancelCreatedNoSend = true
          await at(0.48); await preview(); await confirm()
          await at(0.7)
          const response = page.waitForResponse(r => r.url().endsWith(`/api/admin/events/${featureEventId}/message`) && r.request().method() === "POST" && !r.request().postDataJSON().dryRun)
          await tap(page, page.getByRole("dialog").getByRole("button", { name: "Confirmer l'envoi", exact: true }))
          const result = await response; if (!result.ok()) throw new Error("Actual message send failed")
          const sent = await result.json(); if (sent.sent !== recipients.length) throw new Error("Actual send count differs")
          checks.sent = sent
        })
        await scene("result", async at => {
          await page.getByRole("heading", { name: new RegExp(`Message envoyé à ${recipients.length}`) }).waitFor()
          const history = await db.targetedMessage.findFirstOrThrow({ where: { eventId: featureEventId, subject }, orderBy: { createdAt: "desc" } })
          let delivered = false
          for (let attempt = 0; attempt < 30; attempt++) {
            if (await db.notificationOutbox.count({ where: { targetedMessageId: history.id, status: "sent" } }) === recipients.length) { delivered = true; break }
            await page.waitForTimeout(200)
          }
          if (!delivered) throw new Error("Campaign not delivered to local SMTP")
          const inbox = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json() as { messages: { ID: string; Subject: string; To: { Address: string }[]; Created: string }[] }
          const mails = inbox.messages.filter(m => m.Subject.includes("Ton briefing pour Buvette") && Date.parse(m.Created) >= history.createdAt.getTime() - 1000)
          if (mails.length !== recipients.length || mails.filter(m => m.To.some(t => t.Address === "lea.giroud@example.org")).length !== 1) throw new Error("Actual campaign mail deduplication failed")
          for (const [index, recipient] of recipients.slice(0, 2).entries()) {
            await at(0.23 + index * 0.3)
            const mail = mails.find(m => m.To.some(t => t.Address === recipient.volunteer.email)); if (!mail) throw new Error("Recipient mail missing")
            await page.goto(`http://localhost:48026/view/${mail.ID}`); await settle(page)
            const text = await page.frameLocator("iframe").locator("body").innerText()
            if (!text.includes(recipient.volunteer.firstName) || !text.includes("Prends aussi une gourde")) throw new Error("Actual personalized mail missing content")
          }
          await at(0.84); await page.goto(url); await settle(page); await page.getByRole("heading", { name: "Messages envoyés", exact: true }).scrollIntoViewIfNeeded()
          checks.realEmailsPersonalizedAndDeduplicated = true
        })
        await scene("maintain", async at => {
          await page.goto(templatesUrl); await settle(page)
          await tap(page, page.getByRole("button", { name: `Modifier le modèle « ${modelName} »`, exact: true }))
          await writeField(page.getByLabel("Nom du modèle *", { exact: true }), modelName + " — équipe")
          await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true }))
          await at(0.35); await tap(page, page.getByRole("button", { name: `Supprimer le modèle « ${modelName} — équipe »`, exact: true }))
          await at(0.48); await tap(page, page.getByRole("alertdialog").getByRole("button", { name: "Annuler", exact: true }))
          await at(0.62); await tap(page, page.getByRole("button", { name: `Supprimer le modèle « ${modelName} — équipe »`, exact: true }))
          await tap(page, page.getByRole("alertdialog").getByRole("button", { name: "Supprimer", exact: true }))
          if (await db.targetedMessage.count({ where: { eventId: featureEventId } }) !== historyBefore + 1) throw new Error("Deleting model changed campaign history")
          await at(0.84); await page.goto(url); await settle(page); await page.getByRole("heading", { name: "Messages envoyés", exact: true }).scrollIntoViewIfNeeded()
          checks.modelDeletedHistoryRetained = true
        })
        await writeFile(path.join(dir, "targeted-message-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...checks }, null, 2))
      } finally { await db.$disconnect() }
    } else if (slug === "staffing-gaps") {
      if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Staffing checks require isolated video DB")
      const { PrismaClient } = await import("../../src/generated/prisma/client")
      const { PrismaPg } = await import("@prisma/adapter-pg")
      const { staffingSummary } = await import("../../src/lib/staffing")
      const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
      const staffingUrl = `${baseUrl}/admin/events/${featureEventId}/staffing`
      const readSummary = async () => {
        const shifts = await db.shift.findMany({ where: { eventId: featureEventId, status: { not: "cancelled" } }, include: { registrations: true } })
        const leaders = await db.sectorLeader.findMany({ where: { eventId: featureEventId } })
        return staffingSummary(shifts.map(s => ({ id: s.id, roleName: s.roleName, label: s.label, date: s.date.toISOString().slice(0, 10), startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, active: s.registrations.filter(r => r.status === "active").length, waiting: s.registrations.filter(r => r.status === "waiting" || r.status === "offered").length, requested: s.registrations.filter(r => r.status === "requested").length, closed: s.status === "closed" })), leaders.map(l => l.roleName))
      }
      const initial = await readSummary()
      const checks: Record<string, unknown> = { initialTotals: initial.totals }
      const section = (id: string) => page.locator(`section[aria-labelledby="${id}"]`)
      const returnToReport = async () => { await page.goto(staffingUrl); await settle(page) }
      try {
        await scene("welcome", async at => {
          await page.screencast.showChapter(manifest.title, { description: "Concentrer son énergie sur les bons horaires", duration: 2300 })
          await page.getByRole("heading", { name: "Où manque-t-il du monde ?", exact: true }).scrollIntoViewIfNeeded()
          await at(0.3)
          await tap(page, page.getByRole("link", { name: /^Voir les créneaux à compléter/ }))
          await settle(page)
          await page.getByRole("heading", { level: 1, name: "Où manque-t-il du monde ?", exact: true }).waitFor()
        })
        await scene("overview", async () => {
          await section("staffing-overview").scrollIntoViewIfNeeded()
          if (!initial.totals.waiting || initial.totals.requested !== 2) throw new Error("Missing waitlist/request examples")
          await section("staffing-overview").getByRole("link", { name: "2 demandes à traiter", exact: true }).waitFor()
        })
        await scene("empty", async at => {
          await section("staffing-empty").scrollIntoViewIfNeeded()
          await section("staffing-empty").getByText("6 places", { exact: true }).waitFor()
          await at(0.34)
          await tap(page, section("staffing-empty").getByRole("link", { name: /^Photos/ }))
          await settle(page)
          await tap(page, page.getByRole("button", { name: "Liste", exact: true }))
          await page.getByText("Photos — reportage bénévole", { exact: true }).first().scrollIntoViewIfNeeded()
          await at(0.82); await returnToReport()
        })
        await scene("needs", async at => {
          await section("staffing-underfilled").scrollIntoViewIfNeeded()
          const closed = await db.shift.findFirstOrThrow({ where: { eventId: featureEventId, roleName: "Accueil", startTime: "15:00" } })
          if (initial.underfilled.some(s => s.id === closed.id)) throw new Error("Closed shift counted as recruitment need")
          checks.closedShiftExcludedFromMissing = true
          await at(0.38)
          await tap(page, section("staffing-underfilled").getByRole("link", { name: /Buvette.*18:00.*22:00/ }))
          await settle(page)
          if (await page.locator("tbody tr").count() !== 2) throw new Error("Shift link didn't filter actual evening registrations")
          await at(0.62); await tap(page, page.getByRole("link", { name: "Écrire à ce créneau", exact: true }))
          await settle(page)
          if (!await page.getByRole("radio", { name: "Les bénévoles d'un créneau", exact: true }).isChecked()) throw new Error("Message audience wasn't prefilled by shift")
          checks.messageAudiencePrefilled = true
          await at(0.87); await returnToReport()
        })
        await scene("requests", async at => {
          await section("staffing-full").getByRole("link", { name: /Navette.*08:00.*12:00/ }).scrollIntoViewIfNeeded()
          const held = initial.full.find(s => s.roleName === "Navette" && s.startTime === "08:00")
          if (!held || held.active !== 0 || held.requested !== 2 || held.missing !== 0) throw new Error("Requests didn't hold exactly two places")
          checks.requestsHoldPlacesWithoutConfirmations = true
          await at(0.45)
          await section("staffing-overview").scrollIntoViewIfNeeded()
          await tap(page, section("staffing-overview").getByRole("link", { name: "2 demandes à traiter", exact: true }))
          await settle(page)
          if (await page.locator("tbody tr").count() !== 2) throw new Error("Requests link didn't filter list")
          await page.getByRole("row").filter({ hasText: "Lucas Girard" }).waitFor()
          await page.getByRole("row").filter({ hasText: "Marc Duc" }).waitFor()
          await at(0.84); await returnToReport()
        })
        await scene("waiting", async at => {
          await section("staffing-waitlist").scrollIntoViewIfNeeded()
          await section("staffing-waitlist").getByText("3 personnes en attente", { exact: false }).waitFor()
          await at(0.41)
          await tap(page, section("staffing-waitlist").getByRole("link", { name: /Buvette.*14:00.*18:00/ }))
          await settle(page)
          await page.getByRole("row").filter({ hasText: "Camille Rochat" }).getByText("#1", { exact: true }).waitFor()
          await page.getByRole("row").filter({ hasText: "Anna Bühler" }).getByText("#2", { exact: true }).waitFor()
          await page.getByRole("row").filter({ hasText: "Eva Clerc" }).getByText("#3", { exact: true }).waitFor()
          checks.realWaitingPositions = [1, 2, 3]
          await at(0.84); await returnToReport()
        })
        await scene("leaders", async at => {
          await section("staffing-leaders").scrollIntoViewIfNeeded()
          await at(0.35)
          await tap(page, section("staffing-leaders").getByRole("link", { name: /^Photos/ }))
          await settle(page)
          await page.getByText("Élodie Rochat", { exact: true }).last().waitFor()
          await page.getByText("Manon Aebi", { exact: true }).waitFor()
          checks.existingLeadersVisible = true
          await at(0.82); await returnToReport()
        })
        await scene("full", async () => {
          await section("staffing-full").scrollIntoViewIfNeeded()
          await section("staffing-full").getByRole("link", { name: /Accueil.*12:00.*15:00/ }).waitFor()
          await section("staffing-full").getByRole("link", { name: /Navette.*08:00.*12:00/ }).waitFor()
        })
        await scene("action", async at => {
          await section("staffing-underfilled").scrollIntoViewIfNeeded()
          await tap(page, section("staffing-underfilled").getByRole("link", { name: /Photos.*sam\..*10:00.*12:00/ }))
          await settle(page)
          await tap(page, page.getByRole("button", { name: "+ Ajouter manuellement", exact: true }))
          await typeNaturally(page, page.getByLabel("Prénom *", { exact: true }), "Julien")
          await typeNaturally(page, page.getByLabel("Nom *", { exact: true }), "Favre")
          await typeNaturally(page, page.getByLabel("Email", { exact: true }), "julien.favre@example.org")
          await tap(page, page.getByRole("combobox", { name: "Créneau *", exact: true }))
          await tap(page, page.getByRole("option", { name: /^sam\..*de 10h à 12h, Photos/ }))
          await at(0.59)
          const response = page.waitForResponse(r => r.url().endsWith("/api/admin/registrations") && r.request().method() === "POST")
          await tap(page, page.getByRole("button", { name: "Ajouter", exact: true }))
          const result = await response
          if (result.status() !== 201) throw new Error("Actual photo assignment failed")
          await page.getByRole("row").filter({ hasText: "Julien Favre" }).waitFor()
          await at(0.76); await returnToReport()
          const after = await readSummary()
          if (after.totals.missing !== initial.totals.missing - 1 || after.totals.active !== initial.totals.active + 1 || after.emptyRoles.some(r => r.roleName === "Photos")) throw new Error("Report didn't reflect actual assignment")
          checks.finalTotals = after.totals
          checks.photoRoleNoLongerEntirelyEmpty = true
          await section("staffing-overview").scrollIntoViewIfNeeded()
        })
        await writeFile(path.join(dir, "staffing-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...checks }, null, 2))
      } finally { await db.$disconnect() }
    } else if (slug === "registrations-management") {
      if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Registration checks require isolated video DB")
      const { PrismaClient } = await import("../../src/generated/prisma/client")
      const { PrismaPg } = await import("@prisma/adapter-pg")
      const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
      const checks: Record<string, unknown> = {}
      const adminUrl = `${baseUrl}/admin/events/${featureEventId}/registrations`
      const search = () => page.getByRole("textbox", { name: "Rechercher un bénévole", exact: true })
      const toolbar = () => page.getByRole("group", { name: "Actions sur la sélection", exact: true })
      const row = (name: string, role: string, hours: string) => page.getByRole("row").filter({ hasText: name }).filter({ hasText: role }).filter({ hasText: hours })
      const chooseShift = async (name: "Créneau *" | "Filtrer par créneau", option: RegExp) => {
        await tap(page, page.getByRole("combobox", { name, exact: true }))
        await tap(page, page.getByRole("option", { name: option }))
      }
      const inbox = async () => {
        const response = await page.request.get("http://localhost:48026/api/v1/messages", { headers: { "Cache-Control": "no-cache" } })
        if (!response.ok()) throw new Error("Local mail evidence unavailable")
        return await response.json() as { messages: { ID: string; To: { Address: string }[]; Subject: string; Created: string }[] }
      }
      const openNewMail = async (email: string, before: Set<string>) => {
        let match: { ID: string } | undefined
        for (let attempt = 0; attempt < 20; attempt++) {
          match = (await inbox()).messages.find(m => !before.has(m.ID) && m.To.some(t => t.Address === email))
          if (match) break
          await page.waitForTimeout(250)
        }
        if (!match) throw new Error("New actual email not found")
        await page.goto(`http://localhost:48026/view/${match.ID}`); await settle(page)
      }
      const bulkResponse = (action: string) => page.waitForResponse(r => r.url().endsWith("/registrations/bulk") && r.request().method() === "POST" && r.request().postDataJSON().action === action)
      const camille = await db.volunteer.findFirstOrThrow({ where: { organizationId: "default", email: "camille.rochat@example.org" } })
      const afternoon = await db.shift.findFirstOrThrow({ where: { eventId: featureEventId, roleName: "Accueil", startTime: "15:00" } })
      const initialCount = await db.registration.count({ where: { eventId: featureEventId, status: { in: ["active", "waiting", "offered", "requested"] } } })
      if (initialCount !== 80) throw new Error(`Expected 80 live registrations, got ${initialCount}`)
      let addedId = "", logHref = ""
      try {
        await scene("welcome", async at => {
          await page.screencast.showChapter(manifest.title, { description: "Retrouver les bonnes personnes et agir en confiance", duration: 2300 })
          await at(0.48)
          await page.getByRole("row").nth(6).scrollIntoViewIfNeeded()
          await at(0.73); await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }))
        })
        await scene("columns", async at => {
          await fillVisibly(page, search(), "Camille")
          await page.getByText("Taille de t-shirt :", { exact: true }).first().waitFor()
          await at(0.63); await fillVisibly(page, search(), "Inès")
          await page.getByText('"Inscrite par téléphone"', { exact: true }).waitFor()
          await at(0.84); await fillVisibly(page, search(), "Camille")
        })
        await scene("filters", async at => {
          await fillVisibly(page, search(), "camille.rochat@example.org")
          await at(0.27); await fillVisibly(page, search(), "")
          await page.getByRole("combobox", { name: "Filtrer par poste", exact: true }).selectOption({ label: "Accueil" })
          await at(0.43); await chooseShift("Filtrer par créneau", /de 15h à 18h, Accueil/)
          await page.getByRole("link", { name: "Écrire à ce créneau", exact: true }).waitFor()
          checks.filteredAfternoonRows = await page.locator("tbody tr").count()
          await at(0.75); await page.getByRole("combobox", { name: "Filtrer par poste", exact: true }).selectOption("")
          await chooseShift("Filtrer par créneau", /^Tous les créneaux$/)
          if (await page.locator("tbody tr").count() !== 80) throw new Error("Filters did not restore full list")
        })
        await scene("requests", async at => {
          await tap(page, page.getByRole("checkbox", { name: /^Demandes à traiter/ }))
          await fillVisibly(page, search(), "Lucas")
          await page.getByText("Permis B depuis 2021", { exact: false }).waitFor()
          await at(0.44)
          await tap(page, page.getByRole("button", { name: /^Accepter la demande de Lucas/ }))
          const decision = page.getByRole("dialog")
          await decision.waitFor()
          await at(0.77); await tap(page, decision.getByRole("button", { name: "Annuler", exact: true }))
          const current = await db.registration.findFirstOrThrow({ where: { eventId: featureEventId, volunteer: { email: "lucas.girard@example.org" } } })
          if (current.status !== "requested") throw new Error("Cancelling decision changed request")
          checks.requestDecisionCancelled = true
          await tap(page, page.getByRole("checkbox", { name: /^Demandes à traiter/ }))
          await fillVisibly(page, search(), "")
        })
        await scene("manual-identity", async at => {
          await tap(page, page.getByRole("button", { name: "+ Ajouter manuellement", exact: true }))
          await typeNaturally(page, page.getByLabel("Prénom *", { exact: true }), "Camille")
          await typeNaturally(page, page.getByLabel("Nom *", { exact: true }), "Rochat")
          await at(0.26); await typeNaturally(page, page.getByLabel("Email", { exact: true }), "camille.rochat@example.org")
          await typeNaturally(page, page.getByLabel("Téléphone", { exact: true }), "079 555 10 20")
          await at(0.48); await typeNaturally(page, page.getByLabel("Note", { exact: true }), "Horaire convenu par téléphone")
        })
        await scene("manual-check", async at => {
          await chooseShift("Créneau *", /de 9h à 12h, Accueil.*déjà inscrit/)
          await at(0.23)
          const response = page.waitForResponse(r => r.url().endsWith("/api/admin/registrations") && r.request().method() === "POST")
          await tap(page, page.getByRole("button", { name: "Ajouter", exact: true }))
          const result = await response
          if (result.status() !== 409) throw new Error("Duplicate registration was not refused")
          await page.getByText("Cette personne est déjà inscrite sur ce créneau.", { exact: true }).waitFor()
          checks.duplicateRejected = true
          await at(0.43); await chooseShift("Créneau *", /de 10h à 14h, Buvette.*conflit d'horaire/)
          await page.locator("#add-shift-conflict").waitFor()
          checks.overlapWarningObservedWithoutSubmitting = true
        })
        await scene("manual-result", async at => {
          await chooseShift("Créneau *", /de 15h à 18h, Accueil/)
          await at(0.23)
          const response = page.waitForResponse(r => r.url().endsWith("/api/admin/registrations") && r.request().method() === "POST")
          await tap(page, page.getByRole("button", { name: "Ajouter", exact: true }))
          const result = await response
          if (result.status() !== 201) throw new Error(`Manual compatible addition failed: ${result.status()}`)
          const data = await result.json()
          addedId = data.id
          if (data.volunteer.id !== camille.id || data.source !== "admin_manual" || data.comment !== "Horaire convenu par téléphone") throw new Error("Manual addition did not reuse expected member")
          await row("Camille Rochat", "Accueil", "15h–18h").waitFor()
          checks.manualAdditionReusesMember = true
        })
        await scene("selection", async at => {
          await fillVisibly(page, search(), "Camille")
          await tap(page, row("Camille Rochat", "Accueil", "9h–12h").getByRole("checkbox"))
          await at(0.25); await tap(page, row("Camille Rochat", "Buvette", "10h–14h").getByRole("checkbox"))
          await at(0.46); await fillVisibly(page, search(), "Sarah")
          await toolbar().getByText("2 sélectionnées", { exact: true }).waitFor()
          checks.selectionSurvivesFiltering = true
          await at(0.74); await tap(page, toolbar().getByRole("button", { name: "Désélectionner", exact: true }))
          await fillVisibly(page, search(), "Camille")
        })
        await scene("resend", async at => {
          await tap(page, row("Camille Rochat", "Accueil", "9h–12h").getByRole("checkbox"))
          await tap(page, row("Camille Rochat", "Buvette", "10h–14h").getByRole("checkbox"))
          const before = new Set((await inbox()).messages.map(m => m.ID))
          await tap(page, toolbar().getByRole("button", { name: "Renvoyer le lien", exact: true }))
          await page.getByRole("dialog").getByText(/un seul email par personne/).waitFor()
          await at(0.43)
          const response = bulkResponse("resend_link")
          await tap(page, page.getByRole("dialog").getByRole("button", { name: "Renvoyer", exact: true }))
          const result = await response
          const data = await result.json()
          if (!result.ok() || data.done !== 1 || data.failed) throw new Error("Expected one successful personal-link email")
          checks.resend = data
          await at(0.65); await openNewMail(camille.email!, before)
          const received = (await inbox()).messages.filter(m => !before.has(m.ID) && m.To.some(t => t.Address === camille.email))
          if (received.length !== 1) throw new Error("Resend produced multiple emails for one person")
          checks.singleEmailForTwoRows = true
        })
        await scene("leader", async at => {
          await page.goto(adminUrl); await settle(page)
          await fillVisibly(page, search(), "Sarah")
          await tap(page, row("Sarah Jaquet", "Accueil", "15h–18h").getByRole("checkbox"))
          await tap(page, toolbar().getByRole("button", { name: "Rendre responsable", exact: true }))
          const dialog = page.getByRole("dialog", { name: "Rendre Sarah Jaquet responsable", exact: true })
          await dialog.waitFor()
          const before = new Set((await inbox()).messages.map(m => m.ID))
          await at(0.4)
          const response = page.waitForResponse(r => r.url().endsWith("/sector-leaders") && r.request().method() === "POST")
          await tap(page, dialog.getByRole("button", { name: "Rendre responsable", exact: true }))
          const result = await response
          if (result.status() !== 201) throw new Error("Leader nomination failed")
          await at(0.56); await openNewMail("sarah.jaquet@example.org", before)
          await at(0.79); await page.goto(adminUrl); await settle(page)
          await fillVisibly(page, search(), "Sarah")
          await row("Sarah Jaquet", "Accueil", "15h–18h").getByText("Responsable", { exact: true }).waitFor()
          checks.leaderNominationAndBadge = true
        })
        await scene("undo", async at => {
          await fillVisibly(page, search(), "Camille")
          await tap(page, row("Camille Rochat", "Accueil", "15h–18h").getByRole("checkbox"))
          const before = new Set((await inbox()).messages.map(m => m.ID))
          await tap(page, toolbar().getByRole("button", { name: "Retirer de leur créneau (1)", exact: true }))
          await at(0.28); await tap(page, page.getByRole("alertdialog").getByRole("button", { name: "Retirer", exact: true }))
          await page.getByRole("button", { name: "Annuler le retrait", exact: true }).waitFor()
          await at(0.72); await tap(page, page.getByRole("button", { name: "Annuler le retrait", exact: true }))
          await row("Camille Rochat", "Accueil", "15h–18h").waitFor()
          const current = await db.registration.findUniqueOrThrow({ where: { id: addedId } })
          const logged = await db.eventLog.count({ where: { entityId: addedId, action: "registration.cancelled" } })
          const received = (await inbox()).messages.filter(m => !before.has(m.ID) && m.To.some(t => t.Address === camille.email))
          if (current.status !== "active" || logged !== 0 || received.length !== 0) throw new Error("Undo had a committed cancellation side effect")
          checks.undoWithoutDatabaseOrEmailEffect = true
        })
        await scene("remove", async at => {
          const before = new Set((await inbox()).messages.map(m => m.ID))
          const occupiedBefore = await db.registration.count({ where: { shiftId: afternoon.id, status: "active" } })
          await tap(page, row("Camille Rochat", "Accueil", "15h–18h").getByRole("checkbox"))
          await tap(page, toolbar().getByRole("button", { name: "Retirer de leur créneau (1)", exact: true }))
          await at(0.22); await tap(page, page.getByRole("alertdialog").getByRole("button", { name: "Retirer", exact: true }))
          await at(0.33)
          const response = bulkResponse("cancel")
          await tap(page, page.getByRole("button", { name: "Retirer maintenant", exact: true }))
          const result = await response
          const data = await result.json()
          if (!result.ok() || data.done !== 1 || !data.cancelledIds.includes(addedId)) throw new Error("Final removal failed")
          const current = await db.registration.findUniqueOrThrow({ where: { id: addedId } })
          const occupiedAfter = await db.registration.count({ where: { shiftId: afternoon.id, status: "active" } })
          if (current.status !== "cancelled" || occupiedAfter !== occupiedBefore - 1) throw new Error("Removal did not free actual place")
          const journal = page.getByRole("link", { name: "Voir cette action dans le journal", exact: true })
          await journal.waitFor(); logHref = (await journal.getAttribute("href"))!
          await at(0.7)
          const received = (await inbox()).messages.filter(m => !before.has(m.ID) && m.To.some(t => t.Address === camille.email))
          // Known product discrepancy: recap promises an email, helper doesn't send it.
          // Do not fabricate a cancellation email to make the tutorial look complete.
          if (received.length !== 0) throw new Error("Cancellation email behaviour changed: update narration before recording")
          checks.removal = { ...data, occupiedBefore, occupiedAfter, cancellationEmailsObserved: received.length, recapEmailPromiseNotMet: true }
        })
        await scene("workload", async () => {
          await fillVisibly(page, search(), "Noah")
          await page.getByText("Charge élevée :", { exact: true }).first().waitFor()
          await page.getByText(/10 h de créneaux dans la journée/).first().waitFor()
          checks.realWorkloadWarning = true
        })
        await scene("result", async at => {
          if (!logHref) throw new Error("No actual journal link from cancellation")
          await page.goto(`${baseUrl}${logHref}`); await settle(page)
          await at(0.66); await page.goto(adminUrl); await settle(page)
          if (await page.locator("tbody tr").count() !== 80) throw new Error("Final live list did not return to 80 rows")
          checks.finalLiveCount = 80
        })
        await writeFile(path.join(dir, "registration-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), initialLiveCount: initialCount, ...checks }, null, 2))
      } finally { await db.$disconnect() }
    } else if (slug === "members-reminders") {
      const adminUrl = `${baseUrl}/admin/events/${featureEventId}/invitations`
      const checks: Record<string, unknown> = {}
      const summary = async () => {
        const response = await page.request.get(`${baseUrl}/api/admin/events/${featureEventId}/invitations`)
        if (!response.ok()) throw new Error("Cannot read invitation summary")
        return (await response.json()).summary
      }
      const initialSummary = await summary()
      if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Reminder checks require isolated video DB")
      const { PrismaClient } = await import("../../src/generated/prisma/client")
      const { PrismaPg } = await import("@prisma/adapter-pg")
      const { linkToken } = await import("../../src/lib/token-vault")
      const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
      const originalInvites = await db.memberInvite.findMany({ where: { eventId: featureEventId }, select: { id: true, volunteerId: true, ...linkToken.select } })
      const originalTokens = new Map(originalInvites.map(i => [i.id, linkToken.reveal(i)]))
      await db.$disconnect()
      const openMail = async (subject: string, email?: string) => {
        const response = await page.request.get("http://localhost:48026/api/v1/messages")
        const inbox = await response.json() as { messages: { ID: string; To: { Address: string }[]; Subject: string; Created: string }[] }
        const mail = inbox.messages.filter(m => m.Subject.includes(subject) && (!email || m.To.some(t => t.Address === email))).sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0]
        if (!mail) throw new Error("Real reminder email not found")
        await page.goto(`http://localhost:48026/view/${mail.ID}`); await settle(page)
      }
      await scene("welcome", async () => { await page.screencast.showChapter(manifest.title, { description: "Un rappel utile, sans pression", duration: 2_300 }) })
      await scene("statuses", async at => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations`); await settle(page)
        const search = page.getByRole("textbox", { name: "Rechercher un bénévole", exact: true })
        await fillVisibly(page, search, "Anna")
        await page.getByRole("row").filter({ hasText: "Anna" }).waitFor()
        await at(0.26); await fillVisibly(page, search, "Tom")
        await at(0.46); await fillVisibly(page, search, "Lucas")
        await page.getByRole("row").filter({ hasText: "Lucas" }).getByText("Demande à traiter", { exact: true }).first().waitFor()
        await at(0.67); await fillVisibly(page, search, "Camille")
      })
      await scene("confirm", async at => {
        await page.goto(adminUrl); await settle(page)
        const button = page.getByRole("button", { name: /^Relancer .*sans créneau/ })
        await tap(page, button)
        await at(0.22)
        await tap(page, page.getByRole("dialog", { name: /^Relancer .*sans créneau confirmé/ }).getByRole("button", { name: "Annuler", exact: true }))
        await at(0.32); await tap(page, button)
        await at(0.45)
        const response = page.waitForResponse(r => r.url().endsWith("/invitations/remind") && r.request().method() === "POST")
        await tap(page, page.getByRole("dialog", { name: /^Relancer .*sans créneau confirmé/ }).getByRole("button", { name: "Relancer", exact: true }))
        const result = await response
        const sent = await result.json()
        if (!result.ok() || sent.failed || sent.sent < 1) throw new Error("Reminder delivery failed")
        checks.simpleReminder = sent
        await page.getByText(`${sent.sent} relances envoyées`, { exact: true }).waitFor()
      })
      await scene("link", async at => {
        await openMail("On a besoin de toi", "anna.buhler@example.org")
        const href = await page.frameLocator("iframe").getByRole("link", { name: /Voir les missions/ }).getAttribute("href")
        if (!href) throw new Error("Reminder has no real invitation link")
        const token = new URL(href.replace("?token=", "&token=")).searchParams.get("token")
        if (!token || ![...originalTokens.values()].includes(token)) throw new Error("Reminder changed invitation token")
        checks.originalInvitationTokenRetained = true
        await at(0.67)
        const current = await summary()
        if (JSON.stringify(current) !== JSON.stringify(initialSummary)) throw new Error("Reminder changed participation counts")
      })
      await scene("message", async at => {
        await page.goto(adminUrl); await settle(page)
        await tap(page, page.getByRole("link", { name: /^Écrire un message .*sans créneau/ }))
        await settle(page)
        if (!await page.getByRole("radio", { name: "Les invités sans créneau confirmé", exact: true }).isChecked()) throw new Error("Wrong prefilled message audience")
        await typeNaturally(page, page.getByLabel("Objet *", { exact: true }), "Un horaire qui te convient")
        await typeNaturally(page, page.getByLabel("Message *", { exact: true }), "Tu peux choisir un horaire si tu le souhaites. Merci !")
        await at(0.78)
        await tap(page, page.getByRole("button", { name: "Voir l'aperçu et envoyer", exact: true }))
        await page.getByRole("dialog", { name: "Aperçu de l'email", exact: true }).waitFor()
      })
      await scene("waitlist", async at => {
        await tap(page, page.getByRole("dialog").getByRole("button", { name: "Retour au message", exact: true }))
        await page.getByText(/dont .*en liste d'attente/).scrollIntoViewIfNeeded()
        await at(0.27)
        await typeNaturally(page, page.getByLabel("Message *", { exact: true }), "Tu peux choisir un horaire si tu le souhaites. Si tu es en attente, ta demande reste enregistrée. Merci !")
        await at(0.83)
        await tap(page, page.getByRole("button", { name: "Voir l'aperçu et envoyer", exact: true }))
      })
      await scene("send", async at => {
        await tap(page, page.getByRole("dialog", { name: "Aperçu de l'email", exact: true }).getByRole("button", { name: /^Envoyer à/ }))
        const response = page.waitForResponse(r => r.url().endsWith(`/events/${featureEventId}/message`) && r.request().method() === "POST" && !r.request().postDataJSON().dryRun)
        await tap(page, page.getByRole("dialog", { name: "Confirmer l'envoi", exact: true }).getByRole("button", { name: "Confirmer l'envoi", exact: true }))
        const result = await response
        if (!result.ok()) throw new Error("Targeted reminder failed")
        checks.targetedMessage = await result.json()
        await page.getByRole("heading", { name: /^Message envoyé à/ }).waitFor()
        await at(0.32)
        await openMail("Un horaire qui te convient")
        await at(0.68)
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/message`); await settle(page)
        await page.getByText("Un horaire qui te convient", { exact: true }).first().scrollIntoViewIfNeeded()
      })
      await scene("result", async () => {
        await page.goto(adminUrl); await settle(page)
        const current = await summary()
        if (JSON.stringify(current) !== JSON.stringify(initialSummary)) throw new Error("Targeted message changed invitations or registrations")
        checks.participationUnchanged = true
      })
      await writeFile(path.join(dir, "reminder-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...checks }, null, 2))
    } else if (slug === "members-invitations") {
      const adminUrl = `${baseUrl}/admin/events/${featureEventId}/invitations`
      const dialog = () => page.getByRole("dialog", { name: "Inviter des membres", exact: true })
      const open = async () => { await tap(page, page.getByRole("button", { name: "+ Inviter des membres", exact: true })); await dialog().waitFor() }
      const send = async (count: number) => {
        const response = page.waitForResponse(r => r.url().endsWith(`/events/${featureEventId}/invitations`) && r.request().method() === "POST")
        await tap(page, dialog().getByRole("button", { name: `Envoyer ${count} invitation${count > 1 ? "s" : ""}`, exact: true }))
        const result = await response
        if (!result.ok()) throw new Error(`Invitation send failed: ${result.status()}`)
        const data = await result.json()
        if (data.emailsFailed) throw new Error("Invitation email failed in local SMTP")
        await dialog().waitFor({ state: "hidden" })
        return data
      }
      const mail = async (email: string) => {
        // Retried takes leave older emails with revoked seed tokens. Open the newest
        // exact recipient's message, not whichever matching item the UI renders first.
        const response = await page.request.get("http://localhost:48026/api/v1/messages", { headers: { "Cache-Control": "no-cache" } })
        const inbox = await response.json() as { messages: { ID: string; To: { Address: string }[]; Subject: string; Created: string }[] }
        const latest = inbox.messages.filter(m => m.To.some(to => to.Address === email) && m.Subject.includes("On a besoin de toi")).sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0]
        if (!latest) throw new Error("Current invitation email not found in local mailbox")
        await page.goto(`http://localhost:48026/view/${latest.ID}`); await settle(page)
        const link = page.frameLocator("iframe").getByRole("link", { name: "Voir les missions et m'inscrire", exact: true })
        await link.waitFor()
        const href = await link.getAttribute("href")
        if (!href) throw new Error("Invitation email link missing")
        // Local eventPublicUrl already has ?org=; the invitation renderer appends
        // ?token=. Normalize this development-only delimiter, preserving the real
        // emailed token. Production subdomain URLs do not have the org query.
        const localHref = href.includes("localhost") && href.includes("?org=") ? href.replace("?token=", "&token=") : href
        const url = new URL(localHref)
        if (!url.searchParams.get("token")) throw new Error("Invitation URL has no readable token")
        return `${baseUrl}${url.pathname}?org=${encodeURIComponent(org)}&token=${encodeURIComponent(url.searchParams.get("token") ?? "")}`
      }
      let alineLink = "", nicolasLink = ""
      const checks: Record<string, unknown> = {}
      await scene("welcome", async () => { await page.screencast.showChapter(manifest.title, { description: "Proposer une participation, sans réserver à la place des bénévoles", duration: 2_300 }) })
      await scene("test", async at => {
        await tap(page, page.getByRole("button", { name: "Tester l'envoi d'email", exact: true }))
        await typeNaturally(page, page.getByPlaceholder("votre@email.com"), "test.invitation@example.org")
        await tap(page, page.getByRole("button", { name: "Envoyer le test", exact: true }))
        await page.getByText("Envoyé.", { exact: true }).waitFor()
        await at(0.56)
        await mail("test.invitation@example.org")
        await page.frameLocator("iframe").getByText(/les liens sont fictifs/).waitFor()
      })
      await scene("individual", async at => {
        await page.goto(adminUrl); await settle(page); await open()
        await typeNaturally(page, dialog().getByRole("searchbox", { name: "Rechercher un membre", exact: true }), "Aline")
        await tap(page, dialog().getByRole("checkbox", { name: "Inviter Aline Mercier", exact: true }))
        await typeNaturally(page, dialog().getByLabel("Message (optionnel)", { exact: true }), "Bonjour Aline, nous serions ravis de te retrouver à l'accueil.")
        await at(0.83)
        checks.individual = await send(1)
        await page.getByRole("row").filter({ hasText: "Aline Mercier" }).waitFor()
      })
      await scene("group", async at => {
        await page.goto(adminUrl); await settle(page); await open()
        const tag = dialog().getByRole("combobox", { name: "Filtrer par tag", exact: true })
        await tap(page, tag); await tag.selectOption("accueil")
        await tap(page, dialog().getByRole("button", { name: "Tout sélectionner", exact: true }))
        await at(0.54)
        await tap(page, tag); await tag.selectOption("sécurité")
        await at(0.77)
        await tap(page, dialog().getByRole("button", { name: "Effacer", exact: true }))
        await tag.selectOption("")
      })
      await scene("send", async at => {
        await tap(page, dialog().getByRole("checkbox", { name: "Inviter Nicolas Renaud", exact: true }))
        await tap(page, dialog().getByRole("checkbox", { name: "Inviter Sébastien Morel 9", exact: true }))
        await typeNaturally(page, dialog().getByLabel("Message (optionnel)", { exact: true }), "Bonjour, choisis le créneau qui te convient. Merci pour ton aide !")
        await at(0.39)
        checks.group = await send(2)
        nicolasLink = await mail("video.membre.4@example.org")
        await at(0.70)
        await mail("video.membre.8@example.org")
      })
      await scene("personal-link", async at => {
        alineLink = await mail("video.membre.3@example.org")
        await at(0.15)
        await page.goto(alineLink); await settle(page)
        await tap(page, page.getByRole("button", { name: /Sélectionner — Démontage/ }).first())
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        if (await page.getByLabel("Email *", { exact: true }).inputValue() !== "video.membre.3@example.org") throw new Error("Invitation form not prefilled")
        await at(0.36)
        await tap(page, page.getByRole("radio", { name: "M", exact: true }))
        await tap(page, page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox"))
        await tap(page, page.getByRole("checkbox", { name: /^J'accepte que l'association qui organise cet événement/ }))
        await at(0.76)
        await tap(page, page.getByRole("button", { name: "Confirmer mon inscription", exact: true }))
        await page.getByRole("heading", { name: /inscription confirmée/i }).waitFor()
      })
      await scene("reserved", async at => {
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
        const quit = page.getByRole("button", { name: "Quitter la session", exact: true })
        if (await quit.count()) {
          await tap(page, quit)
          await quit.waitFor({ state: "hidden" })
        }
        await at(0.27)
        await page.goto(nicolasLink); await settle(page)
        await tap(page, page.getByRole("button", { name: /Sélectionner — Sécurité/ }).first())
        await at(0.52)
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        if (await page.getByLabel("Email *", { exact: true }).inputValue() !== "video.membre.4@example.org") throw new Error("Reserved invitation identity missing")
      })
      await scene("status", async at => {
        await page.goto(adminUrl); await settle(page)
        const row = page.getByRole("row").filter({ hasText: "Aline Mercier" })
        await row.getByText("Participation confirmée", { exact: false }).waitFor()
        await row.scrollIntoViewIfNeeded()
        await at(0.42)
        await page.getByRole("row").filter({ hasText: "Nicolas Renaud" }).getByText("Sans créneau confirmé", { exact: true }).scrollIntoViewIfNeeded()
      })
      await scene("existing", async at => {
        await open()
        await tap(page, dialog().getByLabel("Cacher déjà invités", { exact: true }))
        await typeNaturally(page, dialog().getByRole("searchbox", { name: "Rechercher un membre", exact: true }), "Aline")
        await at(0.45)
        await dialog().getByRole("checkbox", { name: "Inviter Aline Mercier", exact: true }).waitFor()
        await at(0.82)
        await tap(page, dialog().getByRole("button", { name: "Annuler", exact: true }))
      })
      await scene("no-email", async at => {
        await open()
        await typeNaturally(page, dialog().getByRole("searchbox", { name: "Rechercher un membre", exact: true }), "Sansmail")
        await tap(page, dialog().getByRole("checkbox", { name: "Inviter René Sansmail", exact: true }))
        await at(0.29)
        const result = await send(1)
        if (result.membersWithoutEmail !== 1 || result.emailsSent !== 0) throw new Error("No-email invitation demonstration incorrect")
        checks.noEmail = result
        await page.getByRole("row").filter({ hasText: "René Sansmail" }).scrollIntoViewIfNeeded()
      })
      await writeFile(path.join(dir, "invitation-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...checks }, null, 2))
    } else if (slug === "members-import") {
      const form = () => page.getByRole("dialog", { name: "Importer des membres", exact: true })
      const fixture = (name: string) => path.resolve("videos/fixtures/member-import", name)
      const analyse = async () => {
        const response = page.waitForResponse(r => r.url().endsWith("/api/admin/members/import/preview") && r.request().method() === "POST")
        await tap(page, form().getByRole("button", { name: "Analyser le fichier", exact: true }))
        const result = await response
        if (!result.ok()) throw new Error(`Import preview failed: ${result.status()}`)
        const body = await result.json()
        await form().getByText("Analyse du fichier, rien n'est encore enregistré.", { exact: true }).waitFor()
        return body
      }
      const open = async () => {
        await tap(page, page.getByRole("button", { name: "Importer CSV/Excel", exact: true }))
        await form().waitFor()
      }
      let initialCount = ""
      const checks: Record<string, unknown> = {}
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Analyser avant de confirmer", duration: 2_300 })
        initialCount = await page.getByText(/^\d+ membres$/).innerText()
      })
      await scene("file", async at => {
        await open()
        await at(0.17)
        await form().getByLabel("Fichier CSV ou Excel", { exact: true }).setInputFiles(fixture("membres-a-verifier.csv"))
        await form().getByText(/Colonnes attendues/).scrollIntoViewIfNeeded()
      })
      await scene("preview", async at => {
        await at(0.37)
        const body = await analyse()
        checks.firstPreview = body.plan.counts
        if (body.plan.counts.skip !== 2 || body.plan.counts.error !== 3) throw new Error("Expected two existing emails and three real file errors")
        if (await page.getByText(/^\d+ membres$/).innerText() !== initialCount) throw new Error("Preview changed member count")
        await at(0.72)
        await form().getByText(/Colonnes reconnues/).scrollIntoViewIfNeeded()
      })
      await scene("errors", async at => {
        await form().getByRole("region").filter({ has: page.getByText("Prénom manquant", { exact: true }) }).scrollIntoViewIfNeeded()
        await form().getByText("Même email que la ligne 8", { exact: true }).waitFor()
        await at(0.55)
        await form().getByText("Email invalide : adresse-incomplete", { exact: true }).scrollIntoViewIfNeeded()
      })
      await scene("update", async at => {
        await tap(page, form().getByRole("button", { name: "Retour", exact: true }))
        await tap(page, form().getByLabel("Mettre à jour", { exact: true }))
        await at(0.25)
        const body = await analyse()
        if (body.plan.counts.update !== 2 || body.plan.counts.skip !== 0) throw new Error("Update preview must target two existing members")
        checks.updatePreview = body.plan.counts
        await at(0.74)
        await form().getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Camille Rochat", exact: true }) }).scrollIntoViewIfNeeded()
      })
      await scene("corrected", async at => {
        await tap(page, form().getByRole("button", { name: "Retour", exact: true }))
        await form().getByLabel("Fichier CSV ou Excel", { exact: true }).setInputFiles(fixture("membres-corriges.xlsx"))
        await at(0.18)
        const body = await analyse()
        if (body.plan.counts.create !== 38 || body.plan.counts.update !== 2 || body.plan.counts.error !== 0) throw new Error("Corrected Excel must plan 38 creations and two updates")
        checks.correctedPreview = body.plan.counts
        await at(0.46)
        await form().getByRole("row").filter({ has: page.getByRole("rowheader", { name: "René Sansmail", exact: true }) }).scrollIntoViewIfNeeded()
      })
      await scene("confirm", async at => {
        const response = page.waitForResponse(r => r.url().endsWith("/api/admin/members/import") && r.request().method() === "POST")
        await tap(page, form().getByRole("button", { name: "Importer 40 membres", exact: true }))
        const result = await response
        if (!result.ok()) throw new Error(`Confirmed import failed: ${result.status()}`)
        const body = await result.json()
        if (body.created !== 38 || body.updated !== 2 || body.errors.length) throw new Error("Confirmed import differs from expected plan")
        checks.confirmed = body
        await form().getByText(/Import terminé/).waitFor()
        await at(0.36)
        await tap(page, form().getByRole("button", { name: "Fermer", exact: true }).last())
        await fillVisibly(page, page.getByPlaceholder("Rechercher (nom, email, téléphone)…"), "Maya")
        await tap(page, page.getByRole("button", { name: "Éditer Maya Mercier 9", exact: true }))
        const edit = page.getByRole("dialog", { name: "Modifier le membre", exact: true })
        if (!(await edit.getByLabel("Tags (séparés par des virgules)", { exact: true }).inputValue()).includes("permis-b")) throw new Error("Imported tags missing")
        await at(0.88)
        await tap(page, edit.getByRole("button", { name: "Annuler", exact: true }))
      })
      await scene("repeat", async at => {
        await fillVisibly(page, page.getByPlaceholder("Rechercher (nom, email, téléphone)…"), "")
        await open()
        await form().getByLabel("Fichier CSV ou Excel", { exact: true }).setInputFiles(fixture("membres-corriges.xlsx"))
        await tap(page, form().getByLabel("Ignorer", { exact: true }))
        const body = await analyse()
        if (body.plan.counts.skip !== 39 || body.plan.counts.create !== 1) throw new Error("Repeat preview must expose the no-email recreation risk")
        checks.repeatPreview = body.plan.counts
        await at(0.75)
        await tap(page, form().getByRole("button", { name: "Retour", exact: true }))
        await tap(page, form().getByRole("button", { name: "Annuler", exact: true }))
      })
      await scene("result", async () => {
        await page.getByRole("heading", { name: "Membres", exact: true }).scrollIntoViewIfNeeded()
      })
      await writeFile(path.join(dir, "import-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...checks }, null, 2))
    } else if (slug === "members-management") {
      const search = () => page.getByPlaceholder("Rechercher (nom, email, téléphone)…")
      const editMaya = async () => {
        await tap(page, page.getByRole("button", { name: "Éditer Maya Berger", exact: true }))
        await page.getByRole("dialog", { name: "Modifier le membre", exact: true }).waitFor()
      }
      const save = async () => {
        await tap(page, page.getByRole("dialog").getByRole("button", { name: "Enregistrer", exact: true }))
        await page.getByRole("dialog").waitFor({ state: "hidden" })
      }
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Des fiches utiles, sans complication", duration: 2_300 })
        await page.getByText("60 membres", { exact: true }).waitFor()
      })
      await scene("create", async at => {
        await tap(page, page.getByRole("button", { name: "+ Nouveau membre", exact: true }))
        const form = page.getByRole("dialog", { name: "Nouveau membre", exact: true })
        await typeNaturally(page, form.getByLabel(/^Prénom/), "Maya")
        await typeNaturally(page, form.getByLabel(/^Nom/), "Berger")
        await typeNaturally(page, form.getByLabel("Email", { exact: true }), "maya.berger@example.org")
        await typeNaturally(page, form.getByLabel("Téléphone", { exact: true }), "079 000 90 01")
        await at(0.80)
        await tap(page, form.getByRole("button", { name: "Créer", exact: true }))
        await page.getByRole("button", { name: "Éditer Maya Berger", exact: true }).waitFor()
        await page.getByText("61 membres", { exact: true }).waitFor()
      })
      await scene("edit", async at => {
        await editMaya()
        const form = page.getByRole("dialog")
        await typeNaturally(page, form.getByLabel("Tags (séparés par des virgules)", { exact: true }), "accueil, permis-b")
        await typeNaturally(page, form.getByLabel("Notes", { exact: true }), "Préfère le stand d'accueil.")
        await at(0.64)
        await save(); await editMaya()
        if (await form.getByLabel("Notes", { exact: true }).inputValue() !== "Préfère le stand d'accueil.") throw new Error("Member notes did not persist")
      })
      await scene("availability", async at => {
        const form = page.getByRole("dialog")
        await tap(page, form.getByLabel("Soir", { exact: true }))
        await typeNaturally(page, form.getByLabel(/Sauf \/ à savoir/), "Pas le vendredi")
        await at(0.52)
        await save()
        await page.getByText(/Soir.*Pas le vendredi/).waitFor()
      })
      await scene("no-email", async at => {
        await tap(page, page.getByRole("button", { name: "+ Nouveau membre", exact: true }))
        const form = page.getByRole("dialog")
        await typeNaturally(page, form.getByLabel(/^Prénom/), "René")
        await typeNaturally(page, form.getByLabel(/^Nom/), "Aubert")
        await typeNaturally(page, form.getByLabel("Téléphone", { exact: true }), "079 000 90 02")
        await at(0.63)
        await tap(page, form.getByRole("button", { name: "Créer", exact: true }))
        const row = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Éditer René Aubert", exact: true }) })
        await row.waitFor()
        if ((await row.textContent())?.includes("@")) throw new Error("No-email demonstration has an email")
      })
      await scene("search", async at => {
        await typeNaturally(page, search(), "Emilie")
        await page.getByText("Émilie", { exact: true }).first().waitFor()
        await at(0.43)
        await fillVisibly(page, search(), "Stephane Favre")
        if (await page.getByRole("button", { name: "Éditer Stéphane Favre", exact: true }).count() !== 2) throw new Error("Homonym demonstration must show two distinct members")
      })
      await scene("filter", async at => {
        await fillVisibly(page, search(), "")
        const tags = page.locator("select").first()
        await tap(page, tags); await tags.selectOption("accueil")
        await at(0.30)
        await tap(page, tags); await tags.selectOption("")
        await at(0.48)
        await tap(page, page.getByRole("button", { name: /^Nom/ }).first())
        await at(0.70)
        await tap(page, page.getByRole("button", { name: /^Heures planifiées/ }))
      })
      await scene("deactivate", async at => {
        await fillVisibly(page, search(), "Maya Berger")
        await tap(page, page.getByRole("button", { name: "Désactiver Maya Berger", exact: true }))
        await tap(page, page.getByRole("alertdialog").getByRole("button", { name: "Désactiver", exact: true }))
        await page.getByRole("button", { name: "Éditer Maya Berger", exact: true }).waitFor({ state: "hidden" })
        await at(0.43)
        await tap(page, page.getByLabel("Inclure inactifs", { exact: true }))
        await editMaya()
        await tap(page, page.getByRole("dialog").getByLabel("Membre actif", { exact: true }))
        await save()
        await tap(page, page.getByLabel("Inclure inactifs", { exact: true }))
        await page.getByRole("button", { name: "Désactiver Maya Berger", exact: true }).waitFor()
      })
      await scene("activity", async at => {
        await fillVisibly(page, search(), "Camille Rochat")
        await tap(page, page.getByRole("link", { name: "Activité de Camille Rochat", exact: true }))
        await settle(page)
        await page.getByRole("heading", { name: "Activité de Camille Rochat", exact: true }).waitFor()
        if (!await page.getByRole("list", { name: "Chronologie", exact: true }).getByRole("listitem").count()) throw new Error("Activity demonstration is empty")
        await at(0.50)
        await page.getByRole("list", { name: "Chronologie", exact: true }).getByRole("listitem").last().scrollIntoViewIfNeeded()
      })
      await scene("result", async () => {
        await page.goto(`${baseUrl}/admin/members`); await settle(page)
        await page.getByRole("heading", { name: "Membres", exact: true }).waitFor()
      })
    } else if (slug === "volunteer-session-availability") {
      const personalUrl = `${baseUrl}/my/demo-volunteer-camille-0001`
      const eventUrl = `${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`
      const invalidUrl = `${baseUrl}/my/demo-invalid-video-link?org=${encodeURIComponent(org)}`
      const section = () => page.locator("form").filter({ has: page.getByRole("heading", { name: "Mes disponibilités", exact: true }) })
      const startSeparateReadJourney = async () => {
        // Separate demonstrations share one local IP. Reset only the read counter between
        // journeys, never the resend counters whose real limit is demonstrated above.
        if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Read-counter fixture requires isolated video DB")
        const { PrismaClient } = await import("../../src/generated/prisma/client")
        const { PrismaPg } = await import("@prisma/adapter-pg")
        const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
        try { await db.rateLimit.deleteMany({ where: { key: { startsWith: "reg-token-read:" } } }) }
        finally { await db.$disconnect() }
      }
      await scene("welcome", async at => {
        await page.screencast.showChapter(manifest.title, { description: "Un lien privé et des informations utiles à l'équipe", duration: 2_300 })
        await at(0.45)
        await page.getByRole("heading", { name: "Ton lien personnel", exact: true }).scrollIntoViewIfNeeded()
      })
      await scene("session", async at => {
        await page.goto(eventUrl); await settle(page)
        await page.getByRole("button", { name: "Quitter la session", exact: true }).waitFor()
        await at(0.60)
        await tap(page, page.getByRole("button", { name: "Quitter la session", exact: true }))
        await page.getByRole("button", { name: "Quitter la session", exact: true }).waitFor({ state: "hidden" })
      })
      await scene("resend", async at => {
        await page.goto(personalUrl); await settle(page)
        await tap(page, page.getByRole("button", { name: "Recevoir ce lien par email", exact: true }))
        await page.getByText("Un nouvel email avec ton lien vient de partir.", { exact: true }).waitFor()
        await at(0.60)
        await page.goto("http://localhost:48026"); await settle(page)
        await tap(page, page.getByText(/Ton lien pour gérer ton inscription/).first())
        await page.frameLocator("iframe").locator('a[href*="/my/"]').first().waitFor()
      })
      await scene("recover", async at => {
        await page.goto(invalidUrl); await settle(page)
        await typeNaturally(page, page.getByLabel(/Adresse email utilisée/), "camille.rochat@example.org")
        await tap(page, page.getByRole("button", { name: "Recevoir un nouveau lien", exact: true }))
        const answer = page.getByText(/Si une inscription existe à cette adresse/)
        await answer.waitFor()
        const knownAnswer = await answer.textContent()
        await at(0.60)
        await fillVisibly(page, page.getByLabel(/Adresse email utilisée/), "personne.inconnue@example.org")
        await tap(page, page.getByRole("button", { name: "Recevoir un nouveau lien", exact: true }))
        if (await answer.textContent() !== knownAnswer) throw new Error("Link recovery exposes different answers")
      })
      await scene("limit", async at => {
        await page.goto(personalUrl); await settle(page)
        // Use real resend requests, not an intercepted or fabricated error response.
        for (let attempt = 0; attempt < 3; attempt++) {
          await tap(page, page.getByRole("button", { name: "Recevoir ce lien par email", exact: true }))
          await page.getByRole("button", { name: "Recevoir ce lien par email", exact: true }).waitFor()
        }
        await page.getByText(/Un email avec ton lien est déjà parti il y a peu/).waitFor()
        await at(0.70)
        await page.getByRole("link", { name: "Écrire à l'organisation" }).scrollIntoViewIfNeeded()
      })
      await scene("availability", async at => {
        await startSeparateReadJourney()
        await section().scrollIntoViewIfNeeded()
        await tap(page, section().getByLabel("Matin", { exact: true }))
        await tap(page, section().getByLabel("Soir", { exact: true }))
        await typeNaturally(page, section().getByLabel(/Sauf/), "Pas le dimanche matin")
        await at(0.57)
        await tap(page, section().getByRole("button", { name: "Enregistrer mes disponibilités", exact: true }))
        await page.getByText(/Disponibilités enregistrées/).waitFor()
        await at(0.80)
        await page.reload(); await settle(page)
        await section().scrollIntoViewIfNeeded()
        if (!await section().getByLabel("Matin", { exact: true }).isChecked() || !await section().getByLabel("Soir", { exact: true }).isChecked()) throw new Error("Availability did not persist")
        if (await section().getByLabel(/Sauf/).inputValue() !== "Pas le dimanche matin") throw new Error("Availability note did not persist")
      })
      await scene("organizer", async at => {
        await startSeparateReadJourney()
        await page.goto(`${baseUrl}/admin/members`); await settle(page)
        await page.getByText(/Pas le dimanche matin/).first().scrollIntoViewIfNeeded()
        await at(0.65)
        await page.goto(personalUrl); await settle(page)
        await section().scrollIntoViewIfNeeded()
      })
      await scene("result", async at => {
        await tap(page, section().getByLabel("Matin", { exact: true }))
        await tap(page, section().getByLabel("Soir", { exact: true }))
        await fillVisibly(page, section().getByLabel(/Sauf/), "")
        await tap(page, section().getByRole("button", { name: "Enregistrer mes disponibilités", exact: true }))
        await page.getByText("Disponibilités effacées.", { exact: true }).waitFor()
        await at(0.55)
        await page.getByRole("heading", { name: "Ton lien personnel", exact: true }).scrollIntoViewIfNeeded()
      })
    } else if (slug === "sector-leaders") {
      const leadersUrl = `${baseUrl}/admin/events/${featureEventId}/sector-leaders`
      const rosterUrl = `${baseUrl}/leader/demo-leader-buvette-0001`
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Un accès simple pour accompagner son équipe", duration: 2_300 })
      })
      await scene("nominate", async (at) => {
        await tap(page, page.getByRole("button", { name: "+ Ajouter un responsable", exact: true }))
        await at(0.12)
        await typeNaturally(page, page.getByLabel("Poste *", { exact: true }), "Montage")
        await typeNaturally(page, page.getByLabel("Nom *", { exact: true }), "Samira Perrin")
        await typeNaturally(page, page.getByLabel("Email *", { exact: true }), "samira.perrin@example.org")
        await at(0.72)
        await tap(page, page.getByRole("button", { name: "Ajouter et envoyer le lien" }))
        await page.getByText("Samira Perrin", { exact: true }).waitFor()
      })
      await scene("registered", async (at) => {
        await tap(page, page.getByRole("button", { name: "+ Ajouter un responsable", exact: true }))
        const picker = page.getByLabel("Depuis les inscrits (optionnel)")
        const option = picker.locator("option").filter({ hasText: "Camille" }).first()
        const value = await option.getAttribute("value")
        if (!value) throw new Error("Registered Camille missing")
        await tap(page, picker); await picker.selectOption(value)
        await at(0.40)
        await fillVisibly(page, page.getByLabel("Poste *", { exact: true }), "Démontage")
        await at(0.72)
        await tap(page, page.getByRole("button", { name: "Ajouter et envoyer le lien" }))
        await page.getByRole("heading", { name: "Démontage", exact: true }).waitFor()
      })
      await scene("email", async (at) => {
        await page.goto("http://localhost:48026"); await settle(page)
        const mail = page.getByText(/responsable/i).first()
        await mail.waitFor(); await tap(page, mail)
        await at(0.24)
        const link = page.frameLocator("iframe").locator('a[href*="/leader/"]').first()
        const href = await link.getAttribute("href")
        if (!href) throw new Error("Nomination email has no personal leader link")
        const personal = new URL(href)
        await page.goto(`${baseUrl}${personal.pathname}`); await settle(page)
        await page.getByRole("heading", { name: /^Responsable ·/ }).waitFor()
      })
      await scene("roster", async (at) => {
        await page.goto(rosterUrl); await settle(page)
        await page.getByRole("heading", { name: "Responsable · Buvette", exact: true }).waitFor()
        await at(0.42)
        await page.getByText("Liste d'attente", { exact: true }).first().scrollIntoViewIfNeeded()
        await at(0.72)
        await page.getByText("Liste d'attente", { exact: true }).first().scrollIntoViewIfNeeded()
      })
      await scene("mobile", async (at) => {
        await page.setViewportSize({ width: 390, height: 800 })
        await page.evaluate(() => window.scrollTo(0, 0))
        await at(0.45)
        await page.locator('a[href^="tel:"]').first().scrollIntoViewIfNeeded()
        await at(0.75)
        await page.locator("section").last().scrollIntoViewIfNeeded()
      })
      await scene("scope", async (at) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.evaluate(() => window.scrollTo(0, 0))
        if (await page.getByRole("button", { name: /Modifier|Retirer|Ajouter/ }).count()) throw new Error("Leader view unexpectedly has mutation controls")
        await at(0.60)
        await page.locator("section").last().scrollIntoViewIfNeeded()
      })
      await scene("new-signup", async (at) => {
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
        await tap(page, page.getByRole("button", { name: /Sélectionner — Buvette 10h–14h/ }).last())
        await at(0.18)
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        await at(0.24)
        await typeNaturally(page, page.getByLabel("Prénom *", { exact: true }), "Nora")
        await typeNaturally(page, page.getByLabel("Nom *", { exact: true }), "Perrin")
        await at(0.35)
        await typeNaturally(page, page.getByLabel("Email *", { exact: true }), "nora.team@example.org")
        await typeNaturally(page, page.getByLabel("Téléphone *", { exact: true }), "079 000 00 12")
        await at(0.50)
        await tap(page, page.getByRole("radio", { name: "M", exact: true }))
        await tap(page, page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox"))
        await tap(page, page.getByRole("checkbox", { name: /^J'accepte que l'association qui organise cet événement/ }))
        await at(0.74)
        await page.getByRole("button", { name: "Confirmer mon inscription" }).scrollIntoViewIfNeeded()
        await at(0.87)
        await tap(page, page.getByRole("button", { name: "Confirmer mon inscription" }))
        await page.getByRole("heading", { name: /inscription confirmée/i }).waitFor()
      })
      await page.goto("http://localhost:48026"); await settle(page)
      const notificationMail = page.getByText(/Nouvelle inscription.*Buvette/i).first()
      await notificationMail.waitFor(); await tap(page, notificationMail)
      await scene("notification", async (at) => {
        await at(0.55)
        await page.goto(rosterUrl); await settle(page)
        await page.getByText("Nora Perrin", { exact: true }).scrollIntoViewIfNeeded()
      })
      await scene("contact", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
        await tap(page, page.getByRole("button", { name: "+ Ajouter un créneau" }))
        const editor = page.getByRole("group", { name: "Nouveau créneau" })
        await editor.getByLabel("Personne de contact", { exact: true }).scrollIntoViewIfNeeded()
        await typeNaturally(page, editor.getByLabel("Personne de contact", { exact: true }), "Élodie Rochat")
        await typeNaturally(page, editor.getByLabel("Téléphone du contact", { exact: true }), "079 000 00 01")
        await at(0.60)
      })
      await scene("remove", async (at) => {
        await page.goto(leadersUrl); await settle(page)
        await tap(page, page.getByRole("button", { name: "Retirer Élodie Rochat des responsables de Buvette", exact: true }))
        const dialog = page.getByRole("alertdialog")
        await dialog.waitFor()
        await at(0.28)
        await tap(page, dialog.getByRole("button", { name: "Retirer", exact: true }))
        await dialog.waitFor({ state: "hidden" })
        await at(0.43)
        await page.goto(rosterUrl); await settle(page)
        await page.getByRole("heading", { name: "Lien introuvable", exact: true }).waitFor()
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
        await at(0.34)
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
        const deletionUrl = page.url()
        const backup = page.getByRole("link", { name: /Ouvrir l'export PDF/ })
        await backup.scrollIntoViewIfNeeded()
        await at(0.10)
        const ready = page.waitForEvent("popup")
        await tap(page, backup)
        const popup = await ready
        await popup.waitForLoadState("networkidle")
        const exportedUrl = new URL(popup.url())
        if (exportedUrl.origin !== new URL(baseUrl).origin || !exportedUrl.pathname.endsWith(`/export/pdf`)) throw new Error("Unexpected archival report destination")
        await popup.close()
        await page.goto(exportedUrl.href); await settle(page)
        await at(0.80)
        await page.goto(deletionUrl); await settle(page)
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
      await page.getByRole("heading", { name: "Jalons", exact: true }).scrollIntoViewIfNeeded()
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Les échéances essentielles, au même endroit", duration: 2_300 })
        await page.getByRole("heading", { name: "Jalons" }).waitFor()
      })

      await scene("create", async (at) => {
        await page.getByRole("heading", { name: "Jalons" }).scrollIntoViewIfNeeded()
        await at(0.03)
        await tap(page, page.getByRole("button", { name: "+ Ajouter un jalon" }))
        await at(0.08)
        await page.getByLabel("Titre *").fill("Fermer les inscriptions")
        await at(0.17)
        const due = new Date(); due.setDate(due.getDate() + 8)
        await page.getByLabel("Échéance *").fill(due.toISOString().slice(0, 10))
        await at(0.84)
        await tap(page, page.getByRole("button", { name: "Ajouter" }))
        await page.getByText("Fermer les inscriptions", { exact: true }).first().waitFor()
      })

      await scene("states", async (at) => {
        await page.getByRole("heading", { name: "Jalons" }).scrollIntoViewIfNeeded()
        await page.getByRole("checkbox", { name: "Préparer le matériel", exact: true }).waitFor()
        if (!(await page.getByRole("checkbox", { name: "Préparer le matériel", exact: true }).isChecked())) throw new Error("Finished milestone missing")
        if (await page.getByRole("checkbox", { name: "Valider le plan de sécurité", exact: true }).isChecked()) throw new Error("Overdue milestone must remain unfinished")
        await at(0.56)
        await page.getByText("Fermer les inscriptions", { exact: true }).first().scrollIntoViewIfNeeded()
      })

      await scene("toggle", async (at) => {
        const checkbox = page.getByRole("checkbox", { name: "Fermer les inscriptions", exact: true }).first()
        await checkbox.scrollIntoViewIfNeeded()
        const box = await checkbox.boundingBox()
        if (!box) throw new Error("Milestone checkbox must be visible")
        const detailStart = Math.round(performance.now() - startedAt)
        detailFrames.push({ startMs: detailStart, endMs: detailStart + durations.get("toggle")!, x: Math.max(0, Math.min(640, Math.floor(box.x - 60))), y: Math.max(0, Math.min(400, Math.floor(box.y - 100))), width: 640, height: 400 })
        await at(0.12)
        await tap(page, checkbox)
        if (!(await checkbox.isChecked())) throw new Error("Milestone did not become finished after the click")
        await at(0.44)
        await tap(page, checkbox)
        if (await checkbox.isChecked()) throw new Error("Milestone did not reopen after the click")
      })

      await scene("dashboard", async (at) => {
        await tap(page, page.getByRole("link", { name: "Tableau de bord", exact: true }).first()); await settle(page)
        await page.getByText(/1 jalon est en retard/).scrollIntoViewIfNeeded()
        const returnToMilestones = page.getByRole("link", { name: /Voir les jalons.*Fête du village de Montvert/ })
        await returnToMilestones.waitFor()
        await at(0.47)
        await tap(page, returnToMilestones); await settle(page)
        await page.getByRole("checkbox", { name: "Envoyer les consignes", exact: true }).scrollIntoViewIfNeeded()
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
        await at(0.08)
        await tap(page, page.getByRole("button", { name: "+ Ajouter", exact: true }))
        await at(0.18)
        await typeNaturally(page, page.getByLabel("Nom du spectacle", { exact: true }), "Concert du village")
        await fillVisibly(page, page.locator("#new-show-date"), "2026-11-14", 700)
        await fillVisibly(page, page.locator("#new-show-start"), "11:00", 700)
        await fillVisibly(page, page.locator("#new-show-end"), "12:30", 700)
        await at(0.59)
        const saved = page.waitForResponse(response => response.url().endsWith(`/api/admin/events/${featureEventId}`) && response.request().method() === "PATCH")
        await tap(page, page.getByRole("button", { name: "Ajouter", exact: true }))
        if (!(await saved).ok()) throw new Error("Program entry was not saved")
        await page.getByText("Concert du village", { exact: true }).waitFor()
      })

      await scene("program-edit", async (at) => {
        await at(0.16)
        await tap(page, page.getByRole("button", { name: "Modifier le spectacle Concert du village", exact: true }))
        await at(0.32)
        await fillVisibly(page, page.locator("#edit-show-end"), "13:00", 800)
        const saved = page.waitForResponse(response => response.url().endsWith(`/api/admin/events/${featureEventId}`) && response.request().method() === "PATCH")
        await tap(page, page.getByRole("button", { name: "Confirmer", exact: true }))
        if (!(await saved).ok()) throw new Error("Program correction was not saved")
        await page.getByText(/11:00–13:00/).waitFor()
        await at(0.76)
        await page.getByRole("button", { name: "Supprimer le spectacle Concert du village", exact: true }).focus()
      })

      await scene("pages", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/pages`); await settle(page)
        await page.getByRole("heading", { name: "Pages" }).waitFor()
        await at(0.05)
        await tap(page, page.getByRole("button", { name: "+ Ajouter une page", exact: true }))
        const form = page.getByRole("dialog", { name: "Nouvelle page", exact: true })
        await typeNaturally(page, form.getByLabel("Titre *"), "Ce qu’il faut apporter")
        await at(0.30)
        await tap(page, form.getByLabel(/Contenu/))
        await form.getByLabel(/Contenu/).pressSequentially("# Bien préparer sa mission\n\n- **Chaussures fermées**\n- Une veste", { delay: 100 })
        await at(0.79)
        await tap(page, form.getByRole("button", { name: "Enregistrer", exact: true }))
        await form.waitFor({ state: "hidden" })
        if (await page.getByRole("listitem").filter({ hasText: "Ce qu’il faut apporter" }).count() !== 1) throw new Error("Expected one newly created practical page")
      })

      await scene("page-order", async (at) => {
        await at(0.26)
        const saved = page.waitForResponse(response => response.url().endsWith(`/api/admin/events/${featureEventId}/pages/reorder`) && response.request().method() === "POST")
        await tap(page, page.getByRole("button", { name: "Monter la page « Ce qu’il faut apporter »", exact: true }))
        if (!(await saved).ok()) throw new Error("Page order was not saved")
        await at(0.30)
        await tap(page, page.getByRole("button", { name: "Modifier la page « Ce qu’il faut apporter »", exact: true }))
        const form = page.getByRole("dialog", { name: "Modifier la page", exact: true })
        await tap(page, form.getByLabel(/Contenu/))
        await form.getByLabel(/Contenu/).press("End")
        await form.getByLabel(/Contenu/).pressSequentially("\n- Une gourde", { delay: 120 })
        await at(0.57)
        await tap(page, form.getByRole("button", { name: "Enregistrer", exact: true }))
        await form.waitFor({ state: "hidden" })
        await at(0.77)
        await tap(page, page.getByRole("button", { name: "Supprimer la page « Ce qu’il faut apporter »", exact: true }))
        const confirmation = page.getByRole("alertdialog")
        await confirmation.waitFor()
        await at(0.91)
        await tap(page, confirmation.getByRole("button", { name: "Annuler", exact: true }))
      })

      await scene("public", async (at) => {
        // The public page links are relative. A host carrying the organization is
        // required, just as in production; ?org= on localhost isn't propagated by
        // those links. Chromium resolves *.localhost to loopback, never the network.
        const publicOrigin = "http://formation-pages.demo.localhost:43102"
        await page.goto(`${publicOrigin}/${eventSlug}`); await settle(page)
        await page.getByText(/Concert du village/).first().scrollIntoViewIfNeeded()
        await at(0.33)
        const link = page.getByRole("link", { name: "Ce qu’il faut apporter", exact: true })
        await link.scrollIntoViewIfNeeded()
        await at(0.47)
        const target = await link.getAttribute("target")
        const popup = target === "_blank" ? page.waitForEvent("popup") : undefined
        await tap(page, link)
        if (popup) {
          const opened = await popup
          await opened.waitForLoadState("domcontentloaded")
          const destination = opened.url()
          if (!destination.startsWith(publicOrigin + "/")) throw new Error("Public page left the local video environment")
          await page.goto(destination)
          await opened.close()
        }
        await settle(page)
        await page.getByRole("heading", { name: "Bien préparer sa mission", exact: true }).waitFor()
        await page.getByText("Une gourde", { exact: true }).waitFor()
      })

      await scene("qr", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/qr`); await settle(page)
        await page.getByRole("heading", { name: "QR code" }).waitFor()
        for (const [fraction, format] of [[0.20, "PNG"], [0.38, "SVG"]] as const) {
          await at(fraction)
          const pending = page.waitForEvent("download")
          await tap(page, page.getByRole("link", { name: `Télécharger ${format}`, exact: true }))
          const download = await pending
          if (!download.suggestedFilename().toLowerCase().endsWith(`.${format.toLowerCase()}`)) throw new Error("Unexpected QR download format")
          await download.saveAs(path.join(dir, `qr-demo.${format.toLowerCase()}`))
        }
        await at(0.60)
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
        await title.fill("")
        await typeNaturally(page, title, "Fête du village de Montvert 2027")
        // Non-ambiguous date makes the day/month order reviewable in the pilot.
        await fillVisibly(page, page.getByLabel("Premier jour de la copie"), "2027-11-28", 1_100)
        await page.getByLabel("Premier jour de la copie").blur()
        await page.screenshot({ path: path.join(dir, "date-locale-check.png") })
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
      let copiedInvitationIds = new Set<string>()
      await scene("create", async (at) => {
        const mailbox = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json() as { messages: { ID: string }[] }
        copiedInvitationIds = new Set(mailbox.messages.map(mail => mail.ID))
        await at(0.16)
        await tap(page, page.getByRole("button", { name: "Créer la copie" }))
        await page.waitForURL(/\/admin\/events\/[^/]+$/)
        copyId = new URL(page.url()).pathname.split("/").at(-1) ?? ""
        await page.getByRole("heading", { name: "Fête du village de Montvert 2027" }).waitFor()
        await at(0.54)
        await page.getByText(/Brouillon/).first().scrollIntoViewIfNeeded()
        await at(0.40)
        await page.goto(`${baseUrl}/admin/events/${copyId}/edit`); await settle(page)
        await page.getByRole("checkbox", { name: "Inscriptions ouvertes" }).scrollIntoViewIfNeeded()
        if (await page.getByRole("checkbox", { name: "Inscriptions ouvertes" }).isChecked()) throw new Error("Copied event registrations must be closed")
      })

      await scene("copied-details", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${copyId}/shifts`); await settle(page)
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
        await at(0.66)
        await page.goto(`${baseUrl}/admin/events/${copyId}/pages`); await settle(page)
        await page.getByText("Questions fréquentes", { exact: true }).first().waitFor()
      })

      await scene("leader-emails", async (at) => {
        const mailbox = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json() as { messages: { ID: string; To: { Address: string }[] }[] }
        let invitationId: string | undefined
        for (const mail of mailbox.messages.filter(mail => !copiedInvitationIds.has(mail.ID))) {
          if (mail.To.some(recipient => !recipient.Address.endsWith("@example.org"))) throw new Error("Non-training copied invitation recipient")
          const detail = await (await page.request.get(`http://localhost:48026/api/v1/message/${mail.ID}`)).json() as { Text: string }
          if (detail.Text.includes("Fête du village de Montvert 2027") && detail.Text.includes("/leader/")) { invitationId = mail.ID; break }
        }
        if (!invitationId) throw new Error("Actual copied leader invitation missing")
        await at(0.20)
        await page.goto(`http://localhost:48026/view/${invitationId}`); await settle(page)
        await page.frameLocator("iframe").locator('a[href*="/leader/"]').first().waitFor()
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
        await at(0.10)
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        await page.getByRole("heading", { name: "Tes informations" }).waitFor()
        await at(0.22)
        await typeNaturally(page, page.getByRole("textbox", { name: "Prénom *", exact: true }), "Alex")
        await typeNaturally(page, page.getByRole("textbox", { name: "Nom *", exact: true }), "Martin")
        await typeNaturally(page, page.getByRole("textbox", { name: "Email *", exact: true }), "alex.preview@example.org")
        await typeNaturally(page, page.getByRole("textbox", { name: /Téléphone \*/, exact: true }), "079 000 12 34")
        await tap(page, page.getByRole("radio", { name: "M", exact: true }))
        await at(0.75)
        await tap(page, page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox"))
        await tap(page, page.getByRole("checkbox", { name: /^J'accepte que l'association qui organise cet événement/ }))
      })

      await scene("preview-result", async (at) => {
        await at(0.08)
        await tap(page, page.getByRole("button", { name: "Voir la confirmation (aperçu)" }))
        await page.getByRole("heading", { name: /Aperçu de la confirmation/ }).waitFor()
        await at(0.40)
        await page.getByRole("heading", { name: /Email de confirmation/ }).scrollIntoViewIfNeeded()
      })

      await scene("publish", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/review`); await settle(page)
        await page.getByRole("heading", { name: "Publication" }).scrollIntoViewIfNeeded()
        await at(0.20)
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
      let templateEventId = ""
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
        await tap(page, page.getByRole("radio", { name: /Fête de village/ }))
        await at(0.78)
        await tap(page, page.getByRole("radio", { name: /Montage, exploitation, démontage/ }))
        await at(0.94)
        await tap(page, page.getByRole("radio", { name: /Page blanche/ }))
      })

      await scene("preview", async (at) => {
        await tap(page, page.getByRole("radio", { name: /Fête de village/ }))
        await page.getByRole("heading", { name: "Fête de village", exact: true }).scrollIntoViewIfNeeded()
        await at(0.20)
        await page.getByRole("heading", { name: "Ce qui sera créé" }).scrollIntoViewIfNeeded()
        await at(0.44)
        await fillVisibly(page, page.getByLabel("Titre"), "Fête villageoise de Bellevue", 1_000)
        await fillVisibly(page, page.getByLabel(/Premier jour/), "2026-11-21", 1_100)
        await at(0.78)
        await page.getByText(/Brouillon, non publié/).scrollIntoViewIfNeeded()
      })

      await scene("create", async (at) => {
        await at(0.14)
        await tap(page, page.getByRole("button", { name: /Créer le brouillon \(10 créneaux\)/ }))
        await page.waitForURL(/\/admin\/events\/[^/]+\/shifts\?wizard=1$/)
        templateEventId = new URL(page.url()).pathname.split("/")[3]
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
        await at(0.38)
        await page.goto(`${baseUrl}/admin/events/${templateEventId}`); await settle(page)
        await page.getByText("Brouillon", { exact: true }).first().waitFor()
        await at(0.78)
        await page.goto(`${baseUrl}/admin/events/${templateEventId}/shifts`); await settle(page)
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
        await at(0.67)
        const capacity = editor.getByLabel("Capacité *")
        await tap(page, capacity)
        await capacity.fill("5")
        await at(0.84)
        await tap(page, editor.getByRole("button", { name: "Enregistrer", exact: true }))
        await page.getByRole("status").filter({ hasText: /Créneau modifié/ }).waitFor()
        await row.getByText("0/5", { exact: true }).waitFor()
      })

      await page.screencast.showChapter("Un départ rapide, un planning maîtrisé", { description: "Le modèle propose, l’équipe décide", duration: 2_300 })
      await scene("result", async (at) => {
        await at(0.36)
        await page.goto(`${baseUrl}/admin/events/${templateEventId}/review`); await settle(page)
        await at(0.54)
        await tap(page, page.getByRole("link", { name: "Prévisualiser comme un bénévole" }))
        await page.waitForURL(/\/preview$/)
        await page.getByText(/Aperçu : la page telle que la verront les bénévoles/).waitFor()
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
        await fillVisibly(page, page.getByLabel("Date début *"), "2026-11-14", 1_100)
        await fillVisibly(page, page.getByLabel("Date fin *"), "2026-11-15", 1_100)
      })

      await scene("location", async (at) => {
        await fillVisibly(page, page.getByLabel("Lieu"), "Maison de quartier, 12 avenue des Tilleuls, Montvert", 1_200)
        await at(0.14)
        await typeNaturally(page, page.getByLabel("Coordonnées GPS ou lien de carte"), "46.180573, 6.122829")
        await at(0.72)
        await page.getByRole("link", { name: /Vérifier sur la carte/ }).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Ce que verra le bénévole", { description: "Des consignes et une confirmation utiles", duration: 1_400 })
      await scene("public-content", async (at) => {
        const instructions = page.getByText("Instructions publiques", { exact: true }).locator("xpath=following-sibling::textarea")
        await typeNaturally(page, instructions, "Entre par la cour nord. Arrive quinze minutes avant ton créneau.")
        await at(0.48)
        const confirmation = page.getByText("Message de confirmation", { exact: true }).locator("xpath=following-sibling::textarea")
        await typeNaturally(page, confirmation, "Merci {prénom} ! Ton inscription est confirmée. Retrouve ton planning par email.")
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
        await page.getByText(/^Modifications enregistrées à/).waitFor({ timeout: 10_000 })
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

      await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
      await scene("invite", async (at) => {
        await at(0.12)
        await tap(page, page.getByRole("button", { name: "Inviter" }))
        const form = page.getByRole("heading", { name: "Inviter un administrateur" }).locator("xpath=ancestor::form")
        await typeNaturally(page, form.getByLabel("Nom"), "Léa Martin")
        await typeNaturally(page, form.getByLabel("Email"), "video.team.lea@example.org")
        await at(0.62)
        await tap(page, form.getByRole("radio", { name: /Organisateur/ }))
        await at(0.78)
        await tap(page, form.getByRole("button", { name: "Envoyer l'invitation" }))
        await page.getByText("Invitation envoyée à video.team.lea@example.org.").waitFor()
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
        await at(0.38)
        await tap(page, row.getByRole("button", { name: /Appliquer/ }))
        await page.getByRole("status").filter({ hasText: /Léa Martin : propriétaire/ }).waitFor()
        await at(0.74)
        await page.getByText("Léa Martin", { exact: true }).scrollIntoViewIfNeeded()
      })

      await scene("organizer-view", async (at) => {
        await page.context().clearCookies()
        await page.goto(`${baseUrl}/admin/login`); await settle(page)
        await page.getByLabel("Email").fill("video.team.samira@example.org")
        await page.getByLabel("Mot de passe").fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
        await tap(page, page.getByRole("button", { name: "Se connecter" }))
        await page.waitForURL(/\/admin\/(events|dashboard)/)
        await at(0.48)
        await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
        await page.getByText(/Votre rôle : organisateur\. Seuls les propriétaires/).waitFor()
        await at(0.76)
        await page.getByText(/Seuls les propriétaires invitent/).scrollIntoViewIfNeeded()
      })

      await scene("limits", async (at) => {
        await page.getByText(/Votre rôle : organisateur\. Seuls les propriétaires/).scrollIntoViewIfNeeded()
        await at(0.48)
        await page.getByText(/Seuls les propriétaires invitent/).scrollIntoViewIfNeeded()
        await at(0.74)
        await page.getByRole("main").getByText("Samira Diallo", { exact: true }).scrollIntoViewIfNeeded()
      })

      await scene("result", async () => {
        await page.screencast.showChapter("Une équipe autonome et maîtrisée", { description: "Des comptes nominatifs, des droits adaptés", duration: 2_300 })
      })
    } else if (slug === "org-email-settings") {
      if (baseUrl !== "http://localhost:43102" || org !== "formation-email" || process.env.ORG_ADMIN_EMAIL !== "video.email.owner@example.org") throw new Error("Email recording requires its owned synthetic fixture")
      const emailEventId = "video-foundation-email-event-0"
      await page.goto(`${baseUrl}/admin/settings/notifications`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Rappels, alertes et réponses", duration: 2_300 })
        await page.getByRole("heading", { name: "Réglages des emails" }).waitFor()
      })

      await page.screencast.showChapter("Les rappels automatiques", { description: "Choisir les moments vraiment utiles", duration: 1_400 })
      await scene("reminders", async (at) => {
        const group = page.getByRole("group", { name: "Rappels automatiques aux bénévoles inscrits" })
        await group.scrollIntoViewIfNeeded()
        const box = await group.boundingBox()
        if (!box) throw new Error("Reminder controls are not visible")
        const detailStart = Math.round(performance.now() - startedAt)
        detailFrames.push({ startMs: detailStart, endMs: detailStart + 1, x: Math.max(0, Math.min(640, Math.floor(box.x - 25))), y: Math.max(0, Math.min(400, Math.floor(box.y - 35))), width: 640, height: 400 })
        await at(0.38)
        const j2 = page.getByRole("checkbox", { name: /Rappel J-2/ })
        if (await j2.isChecked()) await tap(page, j2)
        await at(0.48)
        await tap(page, j2)
        await at(0.70)
        await page.getByText(/un événement peut en plus couper tous ses rappels/).scrollIntoViewIfNeeded()
      })

      await scene("event-reminders", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${emailEventId}/edit`); await settle(page)
        const enabled = page.getByRole("checkbox", { name: "Rappels automatiques", exact: true })
        await enabled.scrollIntoViewIfNeeded()
        await at(0.19)
        if (!await enabled.isChecked()) {
          const saved = page.waitForResponse(response => response.url().endsWith(`/api/admin/events/${emailEventId}`) && response.request().method() === "PATCH")
          await tap(page, enabled)
          if (!(await saved).ok()) throw new Error("Event reminder enable was not saved")
          await page.getByText(/^Modifications enregistrées à/).waitFor()
        }
        await at(0.35)
        const saved = page.waitForResponse(response => response.url().endsWith(`/api/admin/events/${emailEventId}`) && response.request().method() === "PATCH")
        await tap(page, enabled)
        if (!(await saved).ok()) throw new Error("Event reminder disable was not saved")
        await page.getByText(/^Modifications enregistrées à/).waitFor()
        await at(0.43)
        await page.goto(`${baseUrl}/admin/events/${emailEventId}`); await settle(page)
        await page.getByRole("heading", { name: "Communications", exact: true }).scrollIntoViewIfNeeded()
        await page.getByText("Rappels automatiques coupés pour cet événement", { exact: true }).waitFor()
      })

      await scene("admin-alert", async (at) => {
        await page.goto(`${baseUrl}/admin/settings/notifications`); await settle(page)
        const alert = page.getByRole("checkbox", { name: /Prévenir les administrateurs/ })
        await alert.scrollIntoViewIfNeeded()
        await at(0.30)
        if (await alert.isChecked()) await tap(page, alert)
        await at(0.62)
        await tap(page, alert)
      })

      await scene("withdrawal", async (at) => {
        const checkbox = page.getByRole("checkbox", { name: "Prévenir en cas de désistement", exact: true })
        await checkbox.scrollIntoViewIfNeeded()
        await at(0.39)
        if (await checkbox.isChecked()) await tap(page, checkbox)
        await at(0.74)
        if (!await checkbox.isChecked()) await tap(page, checkbox)
      })

      await scene("addresses", async (at) => {
        const checkbox = page.getByRole("checkbox", { name: "Résumé quotidien des adresses à vérifier", exact: true })
        await checkbox.scrollIntoViewIfNeeded()
        await at(0.38)
        if (await checkbox.isChecked()) await tap(page, checkbox)
        await at(0.72)
        if (!await checkbox.isChecked()) await tap(page, checkbox)
      })

      await page.screencast.showChapter("Les réponses", { description: "Une adresse suivie par l’association", duration: 1_400 })
      await scene("reply-to", async (at) => {
        const replyTo = page.getByLabel("Adresse de réponse")
        await replyTo.scrollIntoViewIfNeeded()
        await at(0.32)
        await tap(page, replyTo)
        await replyTo.fill("")
        await replyTo.pressSequentially("benevoles@example.org", { delay: 115 })
        if (await replyTo.inputValue() !== "benevoles@example.org") throw new Error("Reply address must be fully entered before showing its result")
        await at(0.72)
        await page.getByText(/Cette adresse figure aussi sur la page personnelle/).scrollIntoViewIfNeeded()
      })

      await scene("save", async (at) => {
        await at(0.14)
        await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true }))
        await page.getByRole("status").filter({ hasText: "Réglages enregistrés." }).waitFor()
        await at(0.26)
        await page.getByRole("status").filter({ hasText: "Réglages enregistrés." }).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Tester avant d’envoyer", { description: "Contrôler le transport et l’expéditeur", duration: 1_400 })
      await scene("test", async (at) => {
        const inboxBefore = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json() as { messages: { ID: string }[] }
        const priorIds = new Set(inboxBefore.messages.map(mail => mail.ID))
        const testButton = page.getByRole("button", { name: "M'envoyer un email de test" })
        await testButton.scrollIntoViewIfNeeded()
        await at(0.18)
        await tap(page, testButton)
        await page.getByRole("status").filter({ hasText: /Email de test envoyé/ }).waitFor()
        let mailId = ""
        for (let attempt = 0; attempt < 40; attempt++) {
          const inbox = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json() as { messages: { ID: string; Subject: string; To: { Address: string }[] }[] }
          const message = inbox.messages.find(mail => !priorIds.has(mail.ID) && mail.Subject.includes("Email de test") && mail.To.some(to => to.Address === "video.email.owner@example.org"))
          if (message) { mailId = message.ID; break }
          await page.waitForTimeout(200)
        }
        if (!mailId) throw new Error("Actual test message missing from isolated SMTP inbox")
        const detail = await (await page.request.get(`http://localhost:48026/api/v1/message/${mailId}`)).json() as { Text: string; ReplyTo?: { Address: string }[]; Headers?: Record<string, string[]> }
        if (!detail.Text.includes("benevoles@example.org")) throw new Error("Test message does not use saved reply-to address")
        await at(0.36)
        await page.goto(`http://localhost:48026/view/${mailId}`); await settle(page)
        await page.frameLocator("iframe").locator("body").getByText(/Cet email vérifie l'envoi/).filter({ visible: true }).waitFor()
        const detailStart = Math.round(performance.now() - startedAt)
        detailFrames.push({ startMs: detailStart, endMs: detailStart + 1, x: 300, y: 0, width: 960, height: 600 })
      })

      await scene("result", async (at) => {
        await at(0.28)
        await page.goto(`${baseUrl}/admin/settings/notifications`); await settle(page)
        await page.getByRole("heading", { name: "Réglages des emails" }).waitFor()
        await at(0.36)
        await page.getByRole("heading", { name: "Emails envoyés", exact: true }).scrollIntoViewIfNeeded()
        await page.getByRole("row").filter({ hasText: "video.email.owner@example.org" }).first().waitFor()
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
        await page.getByRole("heading", { name: "Tes informations" }).waitFor()
        await typeNaturally(page, page.getByRole("textbox", { name: "Prénom *", exact: true }), "Alex")
        await typeNaturally(page, page.getByRole("textbox", { name: "Nom *", exact: true }), "Martin")
        await typeNaturally(page, page.getByRole("textbox", { name: "Email *", exact: true }), "alex.martin@example.org")
        const charter = page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox")
        await tap(page, charter)
        const privacy = page.getByRole("checkbox", { name: /^J'accepte que l'association qui organise cet événement/ })
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
        const timelineButton = page.getByRole("button", { name: "Frise", exact: true })
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
        await page.getByRole("heading", { name: "Tes informations" }).waitFor()
        await at(0.28)
        await typeNaturally(page, page.getByRole("textbox", { name: "Prénom *", exact: true }), "Alex")
        await typeNaturally(page, page.getByRole("textbox", { name: "Nom *", exact: true }), "Martin")
        await typeNaturally(page, page.getByRole("textbox", { name: "Email *", exact: true }), "alex.masterclass@example.org")
        await at(0.62)
        await tap(page, page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox"))
        await tap(page, page.getByRole("checkbox", { name: /^J'accepte que l'association qui organise cet événement/ }))
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
    capturePurpose: rehearsal ? "rehearsal" : "narration-timed",
    recordedAt: new Date().toISOString(),
    video: path.basename(rawVideo),
    product,
    captureEnvironment: { locale: "fr-FR", timeZone: "Europe/Zurich", organization: org, scenario: manifest.id, viewport: { width: manifest.viewport.width, height: manifest.viewport.height }, mobile: manifest.viewport.width < 600 },
    inputAudioVersion: 1,
    inputEvents,
    cues,
    ...(portraitFrames.length ? { portraitFrames } : {}),
    ...(detailFrames.length ? { detailFrames } : {}),
  }
  await writeFile(timelineFile, `${JSON.stringify(timeline, null, 2)}\n`)
  console.log(`Capture ready: ${rawVideo}`)
  console.log(`Timeline ready: ${timelineFile}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
