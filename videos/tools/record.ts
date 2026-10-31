// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium, type Locator, type Page } from "playwright"
import { launchVideoBrowser, PUBLIC_URL_PROBE_PATH, servedWithPublicUrl, videoAdminEmail, videoRequestProxy } from "../lib/public-hosts"
import { catalogEntry, loadManifest, videoDir, type AudioMetadata, type Timeline } from "../lib/manifest"
import { pinProductBuildForCapture } from "../lib/product-build"
import { estimateSentences, sentenceFor, type Cue, type SentenceAnchor, type TimedSentence } from "../lib/sentence-timing"
import { sentenceTimingsFromAudio } from "../lib/sentence-audio"
import { fullNameOf } from "../lib/fixture-names"

const reference = process.argv.find((arg) => !arg.startsWith("-") && arg !== process.argv[0] && arg !== process.argv[1])
if (!reference) throw new Error("Usage: npm run video:record -- <VIDEO_ID>")

const localBaseUrl = (process.env.VIDEO_BASE_URL ?? "http://localhost:43100").replace(/\/$/, "")
const publicOperator = ["BETA_ACCESS", "SECTORS", "SHIFT_SWAPS", "SECTOR_LEADERS", "PRIVACY_PERSONAL_LINKS", "WORKLOAD_PROTECTION", "ASSIGNMENT_PROPOSALS", "VOLUNTEER_EVENT_AVAILABILITY"].includes(reference) || reference === "SHIFT_ROSTER_VISIBILITY" || (reference === "PLATFORM_INTERNAL_ADMINISTRATION" && process.env.VIDEO_OPERATOR_PUBLIC === "1") || (reference === "ORG_TEAM_PERMISSIONS" && process.env.VIDEO_PUBLIC_CAPTURE === "1")
const baseUrl = publicOperator ? "https://www.benevol.app" : localBaseUrl
const host = new URL(localBaseUrl).hostname
if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
  throw new Error(`Refusing to record against non-local host ${host}`)
}

const org = process.env.VIDEO_ORG ?? "default"
const eventSlug = process.env.VIDEO_EVENT_SLUG ?? "fete-du-village"
const mailpitBase = process.env.VIDEO_MAILPIT_URL ?? "http://localhost:48026"
const gapMs = 450
const rehearsal = process.argv.includes("--rehearse")
const quickRehearsal = process.argv.includes("--quick-rehearse")
const audioTimedRehearsal = process.argv.includes("--audio-timing")
if (audioTimedRehearsal && (!rehearsal || quickRehearsal)) throw new Error("--audio-timing requires --rehearse without --quick-rehearse")
const fallbackTiming = rehearsal && !audioTimedRehearsal
if (quickRehearsal && !rehearsal) throw new Error("--quick-rehearse requires --rehearse; never use accelerated timing for narrated captures")

async function metadata(file: string): Promise<AudioMetadata | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as AudioMetadata
  } catch {
    return null
  }
}

async function settle(page: Page) {
  // Public maps may keep tile requests open; the seven batch 22-7 journeys
  // assert their actual headings and controls after DOM and font readiness.
  const publicRefresh = ["LAST_MINUTE_CHANGES", "VOLUNTEER_PERSONAL_REGISTRATIONS", "VOLUNTEER_CALENDAR", "PRIVACY_PERSONAL_LINKS", "VOLUNTEER_DISCOVER_EVENT", "VOLUNTEER_REGISTER", "VOLUNTEER_CHOOSE_SHIFTS", "VOLUNTEER_FORM_RECAP", "VOLUNTEER_CONFIRMATION_ERRORS", "VOLUNTEER_SESSION_AVAILABILITY", "VOLUNTEER_EVENT_AVAILABILITY", "ACCESSIBILITY_KEYBOARD_DISPLAY"].some(id => process.argv.includes(id))
  await page.waitForLoadState(publicRefresh ? "domcontentloaded" : "networkidle")
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" })
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(500)
}

async function verifyRegistrationTakeMailbox(page: Page, dir: string, query = 'subject:"Fête du village de Montvert"') {
  const reset = JSON.parse(await readFile(path.join(dir, "mailbox-reset-proof.json"), "utf8")) as { preservedMessageIds: string[] }
  const response = await page.request.get(`${mailpitBase}/api/v1/search`, { params: { query, limit: 500 } })
  if (!response.ok()) throw new Error("Take mailbox search unavailable")
  const result = await response.json() as { messages: { ID: string; Subject: string; To: { Address: string }[] }[]; messages_count: number }
  if (!result.messages.length || result.messages.length !== result.messages_count || result.messages.some(m => reset.preservedMessageIds.includes(m.ID))) throw new Error("Mailpit list contains an earlier or unverified email")
  const file = path.join(dir, "take-mailbox-frames.json")
  let frames: unknown[] = []
  try { frames = JSON.parse(await readFile(file, "utf8")) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  frames.push({ checkedAt: new Date().toISOString(), onlyThisTake: true, messages: result.messages })
  await writeFile(file, JSON.stringify(frames, null, 2))
  return result.messages
}

async function openRegistrationTakeMailbox(page: Page, dir: string, id: string, query = 'subject:"Fête du village de Montvert"') {
  const messages = await verifyRegistrationTakeMailbox(page, dir, query)
  await page.goto(`${mailpitBase}/search?q=${encodeURIComponent(query)}`); await settle(page)
  // Preserve Mailpit's in-memory searched list by following its result link.
  await tap(page, page.locator(`a[href="/view/${id}"]`).first()); await settle(page)
  const visibleIds = await page.locator('a[href^="/view/"]').evaluateAll(links => links.filter(link => link.textContent?.trim()).map(link => link.getAttribute("href")!.slice("/view/".length)))
  if (visibleIds.length !== messages.length || visibleIds.some(visibleId => !messages.some(message => message.ID === visibleId))) throw new Error("Visible Mailpit sidebar includes an email outside this take")
  const file = path.join(dir, "take-mailbox-visible-list.json")
  let frames: unknown[] = []
  try { frames = JSON.parse(await readFile(file, "utf8")) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  frames.push({ checkedAt: new Date().toISOString(), openedId: id, visibleIds, messages, onlyThisTake: true })
  await writeFile(file, JSON.stringify(frames, null, 2))
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

// Mailpit sandboxed iframes do not run context init scripts. Retain the actual
// mouse-down dispatch timestamp, then relay it without inventing a click.
let reportIframePointerDown: ((epochMs: number) => void) | undefined
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
  const inFrame = await target.evaluate(element => element.ownerDocument.defaultView !== element.ownerDocument.defaultView?.top)
  if (inFrame) {
    // The sandbox also blocks injected event callbacks. Dispatch the actual mouse
    // press explicitly, retaining its timestamp only after the command succeeds.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const epochMs = Date.now()
    await page.mouse.down()
    reportIframePointerDown?.(epochMs)
    await page.mouse.up()
  } else await target.click()
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
  // The canonical proves the deployment URL: explicit HTTP capture origins for batch 25-2,
  // public video domain for the other journeys. Visible local links still fail final review.
  const manifest = await loadManifest(reference!)
  const probeHtml = await (await fetch(`${localBaseUrl}${PUBLIC_URL_PROBE_PATH}`)).text()
  const localOriginCapture = ["LAST_MINUTE_CHANGES", "PLATFORM_INTERNAL_ADMINISTRATION"].includes(manifest.id) && !publicOperator
  if (localOriginCapture ? !probeHtml.includes(`<link rel="canonical" href="${baseUrl}${PUBLIC_URL_PROBE_PATH}"`) : !servedWithPublicUrl(probeHtml)) throw new Error("Capture deployment origin does not match the expected canonical URL")
  const product = await pinProductBuildForCapture(localBaseUrl)
  if ((await catalogEntry(reference!)).captureReady === false) throw new Error(`${manifest.id}: real UI recorder and fixture are not ready; refusing a substitute capture`)
  const slug = manifest.slug
  // The beta videos (#1168): their own organisation and recorder (videos/lib/record-beta-features.ts).
  const betaSlugs = ["beta-access", "sectors", "shift-swaps"]
  const dir = videoDir(manifest.slug)
  const rawVideo = path.join(dir, "capture.webm")
  const timelineFile = path.join(dir, "timeline.json")
  const audio = await metadata(path.join(dir, "audio-metadata.json"))
  if (!rehearsal || audioTimedRehearsal) {
    if (!audio) throw new Error(`${manifest.id}: narrated capture requires actual generated audio; fallback timing is rehearsal-only`)
    const { assertNarrationGeneration } = await import("../lib/narration-generation")
    assertNarrationGeneration(manifest, audio)
    for (const segment of manifest.segments) {
      const duration = audio.segments[segment.id]?.durationMs
      if (!Number.isFinite(duration) || duration! <= 0) throw new Error(`${segment.id}: actual narration duration is required before narrated capture`)
    }
  }
  if (slug === "volunteer-hours-certificate" && !rehearsal && (!audio || manifest.segments.some(segment => !audio.segments[segment.id]?.durationMs))) throw new Error("Hours requires every real narration segment; missing TTS cannot be replaced with fallback timing")
  if (slug === "email-delivery-failures" && !rehearsal) await (await import("../lib/record-delivery")).validateDeliveryNarration(dir)
  if (slug === "volunteer-confirmation-errors" && !rehearsal) await (await import("../lib/record-registration-errors")).validateRegistrationErrorNarration(dir)
  if (slug === "platform-internal-administration" && !rehearsal) {
    await (await import("../lib/record-operator")).validateOperatorNarration(dir)
  }
  const durations = new Map(manifest.segments.map((segment) => [segment.id, fallbackTiming ? segment.fallbackDurationMs : audio?.segments[segment.id]?.durationMs ?? segment.fallbackDurationMs]))
  await mkdir(dir, { recursive: true })
  await (await import("../lib/prepare-settings-mailbox")).prepareSettingsMailbox(slug, dir)
  await rm(rawVideo, { force: true })

  // Native date controls also depend on Chromium's UI/process locale, not just
  // the context's Accept-Language. Keep French narration separate from this.
  const batch22French = ["shift-roster-visibility", "beta-access", "sectors", "shift-swaps", "workload-protection", "assignment-proposals", "volunteer-event-availability", "volunteer-personal-registrations", "volunteer-calendar", "privacy-personal-links", "volunteer-discover-event", "volunteer-register-mobile", "volunteer-choose-shifts", "volunteer-form-recap", "volunteer-confirmation-errors", "volunteer-session-availability", "accessibility-keyboard-display", "org-email-settings", "org-public-identity", "org-team-permissions", "org-timezone-charter", "organization-activity-log", "email-delivery-failures", "data-exports-archives", "global-search", "platform-internal-administration", "members-management", "members-import", "members-invitations", "members-duplicates-merge", "members-reminders", "volunteer-hours-certificate", "volunteer-badges", "registrations-management", "registrations-place-member", "organizer-monitor-followup", "staffing-gaps", "sector-leaders", "attendance-check-in", "last-minute-changes", "targeted-messages", "reminders-changes", "shift-create-edit-detail", "shift-create-series", "shift-eligibility-rules", "shift-night-dst", "shift-timeline-quick-actions", "shift-waitlist-offer", "shifts-roles-views", "shift-recurrence", "shift-approval", "event-duplicate", "event-archive-delete", "event-milestones", "event-program-pages-qr", "event-questions", "event-reports", "event-visibility-registration-window", "event-activity-log", "admin-navigation", "admin-features-tour", "masterclass-03-first-steps", "event-create-blank", "event-create-template", "organizer-create-publish", "event-review-publish"].includes(slug)
  const questionsFrenchLauncher = (batch22French || ["event-questions", "volunteer-hours-certificate", "admin-navigation", "volunteer-confirmation-errors", "members-import", "data-exports-archives"].includes(slug)) && process.platform === "darwin"
  const frenchChromiumRevision = batch22French || slug === "members-import" ? "1248" : "1243"
  if (questionsFrenchLauncher && chromium.executablePath() !== `/Users/pol/Library/Caches/ms-playwright/chromium-${frenchChromiumRevision}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`) throw new Error("Questions French launcher must be reverified against the current Playwright Chromium binary")
  const browser = await launchVideoBrowser(chromium, {
    headless: true,
    ...(questionsFrenchLauncher ? { executablePath: path.resolve(batch22French || slug === "members-import" ? "videos/tools/chromium-fr-members-import.sh" : "videos/tools/chromium-fr-questions.sh") } : {}),
    args: ["--lang=fr-FR"],
    env: { ...process.env, LANG: (batch22French || ["members-import", "privacy-personal-links"].includes(slug)) ? "fr_CH.UTF-8" : "fr_FR.UTF-8", LC_ALL: (batch22French || ["members-import", "privacy-personal-links"].includes(slug)) ? "fr_CH.UTF-8" : "fr_FR.UTF-8" },
  }, localBaseUrl)
  const context = await browser.newContext({
    ...(publicOperator ? { proxy: { server: videoRequestProxy(browser)! }, ignoreHTTPSErrors: true } : {}),
    viewport: { width: manifest.viewport.width, height: manifest.viewport.height },
    deviceScaleFactor: manifest.viewport.deviceScaleFactor,
    isMobile: manifest.viewport.width < 600,
    hasTouch: manifest.viewport.width < 600,
    locale: (batch22French || ["members-import", "privacy-personal-links"].includes(slug)) ? "fr-CH" : "fr-FR",
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
  let captureFailed = false
  const inputEvents: NonNullable<Timeline["inputEvents"]> = []
  reportIframePointerDown = epochMs => {
    if (!recording) return
    const atMs = Math.round(performance.now() - startedAt - (Date.now() - epochMs))
    if (!inputEvents.some(event => event.kind === "click" && Math.abs(event.atMs - atMs) < 80)) inputEvents.push({ kind: "click", atMs })
  }
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

  // Sentence cues (`at("Créons les créneaux")`) wait for the moment the voice says that sentence,
  // measured on this take's own audio; a rehearsal without audio spreads the sentences by length.
  const anchors: SentenceAnchor[] = []
  const sentenceCache = new Map<string, TimedSentence[]>()
  const sentencesOf = async (id: string): Promise<TimedSentence[]> => {
    const cached = sentenceCache.get(id)
    if (cached) return cached
    const segment = manifest.segments.find(candidate => candidate.id === id)
    if (!segment) throw new Error(`Unknown narration segment ${id}`)
    const generated = fallbackTiming ? undefined : audio?.segments[id]
    const sentences = generated
      ? await sentenceTimingsFromAudio(path.join(dir, generated.file), segment.transcript, generated.durationMs)
      : estimateSentences(segment.transcript, durations.get(id) ?? segment.fallbackDurationMs)
    sentenceCache.set(id, sentences)
    return sentences
  }

  const scene = async (id: string, action: (at: Cue) => Promise<void>) => {
    console.log(`Scene ${id}: ${rehearsal ? "rehearsal" : "narration-timed"}`)
    const audioDuration = durations.get(id)
    if (!audioDuration) throw new Error(`Missing duration for ${id}`)
    // Keep the complete measured WAV. A fixed tail reduction can clip a new
    // narration take even when an earlier take ended with a longer silence.
    const expected = audioDuration
    // Chapter cards separate subjects; they must not cover the first narrated
    // action or consume its timing budget.
    const title = manifest.chapterTitles?.[id]
    if (title) await page.screencast.showChapter(title, { duration: 1500 })
    const start = performance.now()
    cues.push({ id, startMs: Math.round(start - startedAt), endMs: 0 })
    const at: Cue = async (cue) => {
      if (typeof cue === "string") {
        const sentence = sentenceFor(await sentencesOf(id), cue)
        if (!quickRehearsal) {
          const remaining = start + sentence.startMs - performance.now()
          if (remaining > 0) await page.waitForTimeout(remaining)
        }
        anchors.push({ segmentId: id, phrase: cue, startMs: sentence.startMs, endMs: sentence.endMs, cueMs: Math.round(performance.now() - startedAt) })
        return
      }
      if (quickRehearsal) return
      const remaining = start + expected * cue - performance.now()
      if (remaining > 0) await page.waitForTimeout(remaining)
    }
    try {
      await action(at)
    } catch (error) {
      if (["beta-access", "sectors", "shift-swaps", "workload-protection", "assignment-proposals", "volunteer-event-availability", "members-management", "members-import", "members-invitations", "members-duplicates-merge", "members-reminders", "volunteer-hours-certificate", "volunteer-badges", "registrations-management", "registrations-place-member", "organizer-monitor-followup", "staffing-gaps", "sector-leaders", "attendance-check-in", "last-minute-changes", "targeted-messages", "reminders-changes", "shift-create-edit-detail", "shift-create-series", "shift-eligibility-rules", "shift-night-dst", "shift-timeline-quick-actions", "shift-waitlist-offer", "shifts-roles-views", "shift-recurrence", "shift-approval"].includes(slug)) {
        await mkdir(path.join(dir, "review"), { recursive: true })
        await page.screenshot({ path: path.join(dir, "review", "rehearsal-failure.png") }).catch(() => {})
        await writeFile(path.join(dir, "review", "rehearsal-failure.json"), JSON.stringify({ scene: id, url: page.url(), elapsedMs: Math.round(performance.now() - startedAt), error: String(error), purpose: rehearsal ? "rehearsal" : "narration-timed" }, null, 2))
      }
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
      await page.getByLabel("Email").fill(videoAdminEmail())
      await page.getByLabel("Mot de passe").fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
      await page.getByRole("button", { name: "Se connecter" }).click()
      await page.waitForURL(/\/admin\/dashboard/)
      await page.goto(`${baseUrl}/admin/events`)
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
      await page.getByLabel("Email").fill(slug === "platform-internal-administration" ? "video.operator.platform@example.org" : slug === "privacy-personal-links" ? "video.privacy.a.owner@example.org" : slug === "last-minute-changes" ? "video.last-minute.owner@example.org" : slug === "organization-activity-log" ? "video.org-activity.owner@example.org" : slug === "data-exports-archives" ? "video.exports.owner@example.org" : betaSlugs.includes(slug) ? (await import("../lib/record-beta-features")).BETA_OWNER_EMAIL : slug === "workload-protection" ? (await import("../lib/record-workload-protection")).WORKLOAD_OWNER_EMAIL : slug === "assignment-proposals" ? (await import("../lib/record-assignment-proposals")).PROPOSALS_OWNER_EMAIL : slug === "volunteer-event-availability" ? (await import("../lib/record-volunteer-event-availability")).VOLUNTEER_AVAILABILITY_OWNER_EMAIL : videoAdminEmail())
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

    if (slug === "targeted-messages" || slug === "staffing-gaps" || slug === "registrations-place-member" || slug === "registrations-management" || slug === "members-reminders" || slug === "members-invitations" || slug === "sector-leaders" || slug === "volunteer-personal-registrations" || slug === "volunteer-session-availability" || slug === "volunteer-calendar") {
      const href = await page.getByRole("link", { name: "Fête du village de Montvert" }).first().getAttribute("href")
      if (!href) throw new Error("Seed event link not found")
      featureEventId = href.split("/").filter(Boolean).at(-1)!
      await page.goto(slug === "targeted-messages" ? `${baseUrl}/admin/events/${featureEventId}/message` : slug === "staffing-gaps" ? `${baseUrl}/admin/events/${featureEventId}` : slug === "registrations-place-member" || slug === "registrations-management" ? `${baseUrl}/admin/events/${featureEventId}/registrations` : slug === "members-invitations" || slug === "members-reminders" ? `${baseUrl}/admin/events/${featureEventId}/invitations` : slug === "sector-leaders" ? `${baseUrl}/admin/events/${featureEventId}/sector-leaders` : `${baseUrl}/my/demo-volunteer-camille-0001`); await settle(page)
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

    if (slug === "shift-recurrence") {
      const href = await page.getByRole("link", { name: "Épicerie de la Gare — permanences", exact: true }).first().getAttribute("href")
      if (!href) throw new Error("Recurrence fixture missing; run scripts/seed-video-scenario.ts shift-recurrence")
      featureEventId = href.split("/").filter(Boolean).at(-1)!
      for (const route of [`/admin/events/${featureEventId}/shifts`, `/epicerie-permanences?org=${encodeURIComponent(org)}`]) {
        await page.goto(`${baseUrl}${route}`); await settle(page)
      }
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
      // A previous take leaves « Caisse et accueil » and a shortened delivery rule behind.
      const listed = page.getByRole("region", { name: "Permanences récurrentes" }).getByRole("listitem")
      if (await listed.count() !== 1 || !(await listed.first().innerText()).startsWith("Réception des livraisons")) throw new Error("Recurrence fixture already used; re-seed shift-recurrence before the take")
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
        await page.getByRole("button", { name: "Supprimer le jalon « Fermer les inscriptions »", exact: true }).first().click()
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
    // Real sessions of the beta videos, opened before the screencast: no login form is filmed.
    const betaSessions = slug === "beta-access" || slug === "sector-leaders"
      ? await (async () => {
        const beta = await import("../lib/record-beta-features")
        return {
          owner: slug === "beta-access" ? await page.context().cookies() : await beta.betaSessionCookies(page, baseUrl, beta.BETA_OWNER_EMAIL),
          operator: slug === "beta-access" ? await beta.betaSessionCookies(page, baseUrl, beta.BETA_OPERATOR_EMAIL) : [],
        }
      })()
      : undefined
    // The volunteer's dated availability (#1146): asked off screen through the organisers' real route, then signed out.
    const volunteerAvailabilitySetup = slug === "volunteer-event-availability"
      ? await (await import("../lib/record-volunteer-event-availability")).prepareVolunteerAvailability(page, baseUrl)
      : undefined

    await page.screencast.start({
      path: rawVideo,
      size: { width: manifest.viewport.width, height: manifest.viewport.height },
      quality: 90,
    })
    recording = true
    startedAt = performance.now()

    if (slug === "shift-roster-visibility") {
      await (await import("../lib/record-shift-roster")).recordShiftRoster({ page, base: baseUrl, dir, scene, tap, settle, fill: fillVisibly })
    } else if (betaSlugs.includes(slug)) {
      const beta = await import("../lib/record-beta-features")
      const tools = { page, base: baseUrl, title: manifest.title, scene, tap, settle, typeNaturally }
      if (slug === "beta-access") await beta.recordBetaAccess({ ...tools, operator: betaSessions!.operator, owner: betaSessions!.owner })
      else if (slug === "sectors") await beta.recordSectors(tools)
      else await beta.recordShiftSwaps(tools)
    } else if (slug === "workload-protection") {
      // Breaks and workload protection (#1171): its own organisation and recorder.
      await (await import("../lib/record-workload-protection")).recordWorkloadProtection({ page, base: baseUrl, title: manifest.title, scene, tap, settle, typeNaturally })
    } else if (slug === "assignment-proposals") {
      // Assignment proposals (#1172): its own organisation and recorder.
      await (await import("../lib/record-assignment-proposals")).recordAssignmentProposals({ page, base: baseUrl, title: manifest.title, scene, tap, settle, typeNaturally })
    } else if (slug === "volunteer-event-availability" && volunteerAvailabilitySetup) {
      // The volunteer's dated availability (#1146): its own organisation and recorder.
      await (await import("../lib/record-volunteer-event-availability")).recordVolunteerEventAvailability({ page, base: baseUrl, title: manifest.title, scene, tap, settle, typeNaturally, setup: volunteerAvailabilitySetup })
    } else if (slug === "platform-internal-administration" && operatorRecording) {
      const { recordOperator } = await import("../lib/record-operator")
      await recordOperator({ page, base: baseUrl, directory: dir, title: manifest.title, setup: operatorRecording, scene, tap, settle })
    } else if (slug === "volunteer-register-mobile") {
    await scene("welcome", async () => {
      await page.screencast.showChapter(manifest.title, { description: "Le parcours bénévole, simplement", duration: 2_300 })
    })

    const shift = page.getByRole("button", { name: /^15h–18h \d+\/\d+, Accueil : sélectionner/ })
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
      await fillVisibly(page, page.getByRole("textbox", { name: "Prénom", exact: true }), "Alex", 180)
      await fillVisibly(page, page.getByRole("textbox", { name: "Nom", exact: true }), "Martin", 180)
      await fillVisibly(page, page.getByRole("textbox", { name: "Email", exact: true }), `alex.martin.video.${stamp}@example.org`, 180)
      await fillVisibly(page, page.getByRole("textbox", { name: /Téléphone/, exact: true }), "079 000 12 34", 180)
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

    await scene("confirm", async (at) => {
      const submit = page.getByRole("button", { name: "Confirmer mon inscription" })
      await at("Un dernier coup d’œil au")
      await page.getByText(/^Tes créneaux/).filter({ visible: true }).first().scrollIntoViewIfNeeded()
      await at("confirme ton inscription.")
      await submit.scrollIntoViewIfNeeded()
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

      await page.screencast.showChapter("Toute l’organisation", { description: "Événements, membres et paramètres communs", duration: 1_400 })
      await scene("organization-navigation", async (at) => {
        await at("Le Tableau de bord rassemble")
        await tap(page, page.getByRole("link", { name: "Tableau de bord", exact: true }).first())
        await settle(page)
        await at("Événements ouvre la liste")
        await tap(page, page.getByRole("link", { name: "Événements", exact: true }).first())
        await at("Membres réunit les personnes connues")
        await tap(page, page.getByRole("link", { name: "Membres", exact: true }).first())
        await page.getByRole("heading", { name: "Membres" }).waitFor()
        await at("Paramètres concerne les paramètres communs.")
        await tap(page, page.getByRole("link", { name: "Paramètres", exact: true }).first())
        await page.getByRole("heading", { name: "Paramètres" }).waitFor()
        await at(0.91) /* mid-sentence */
        await tap(page, page.getByRole("link", { name: "Événements", exact: true }).first())
        await page.getByRole("heading", { name: "Événements" }).waitFor()
      })

      await page.screencast.showChapter("Un événement précis", { description: "Planning, inscriptions et suivi", duration: 1_400 })
      await scene("event-navigation", async (at) => {
        await tap(page, page.getByRole("link", { name: "Fête du village de Montvert" }).first())
        await page.waitForURL(new RegExp(`/admin/events/${featureEventId}$`))
        await at("Les onglets donnent accès")
        await page.getByRole("navigation", { name: "Sections de l'événement" }).scrollIntoViewIfNeeded()
        await at("Partage rassemble le lien public")
        await tap(page, page.getByRole("link", { name: "Partage", exact: true }))
        await at("Paramètres donne accès aux questions")
        await tap(page, page.getByRole("link", { name: "Paramètres de l'événement", exact: true }))
        await at("Le menu Autres actions contient")
        await tap(page, page.getByRole("button", { name: "Autres actions" }))
        await page.getByRole("link", { name: "Journal", exact: true }).waitFor()
        await page.keyboard.press("Escape")
        await at("Dans l’aperçu, les besoins")
        await tap(page, page.getByRole("link", { name: "Aperçu", exact: true }))
        await page.getByRole("heading", { name: "Où manque-t-il du monde ?", exact: true }).scrollIntoViewIfNeeded()
        await page.getByRole("heading", { name: "Jalons", exact: true }).scrollIntoViewIfNeeded()
        await at("Le lien Événements vous ramène")
        await tap(page, page.getByRole("link", { name: "Événements", exact: true }).last())
      })

      await page.screencast.showChapter("Retrouver directement", { description: "Recherche globale et raccourci clavier", duration: 1_400 })
      await scene("search", async (at) => {
        await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K")
        const search = page.getByLabel("Rechercher un bénévole, un événement ou un poste").first()
        await search.waitFor()
        await typeNaturally(page, search, "buvette")
        await at("Ouvrez un résultat pour accéder")
        await search.press("Enter")
        await page.waitForURL(/\/admin\/search\?q=buvette/)
        await page.getByRole("heading", { name: "Recherche" }).waitFor()
        await at(0.52) /* mid-sentence */
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
        await at(0.76) /* mid-sentence */
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
        await at(0.44) /* mid-sentence */
        await page.getByRole("menuitem", { name: "Mon compte" }).hover()
        await at(0.35) /* mid-sentence */
        await page.keyboard.press("Escape")
        const help = page.getByRole("link", { name: /Aide/ }).filter({ visible: true }).first()
        const popupPromise = page.waitForEvent("popup")
        await tap(page, help)
        const guide = await popupPromise
        await guide.waitForLoadState("domcontentloaded")
        const guideUrl = guide.url()
        if (new URL(guideUrl).origin !== new URL(baseUrl).origin) throw new Error("Help must remain on the isolated local application")
        await page.goto(guideUrl); await settle(page)
        await guide.close()
        await at(0.77) /* mid-sentence */
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
        await page.getByRole("link", { name: /Aide/ }).filter({ visible: true }).last().scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Mobile et clavier", { description: "Les mêmes repères pour tout le monde", duration: 1_400 })
      await scene("mobile-keyboard", async (at) => {
        await page.setViewportSize({ width: 390, height: 800 })
        const portraitStart = Math.round(performance.now() - startedAt)
        await at(0.10) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: /Menu/ }))
        await page.getByRole("link", { name: "Membres", exact: true }).waitFor()
        await at("Sur ordinateur, la première tabulation")
        portraitFrames.push({ startMs: portraitStart, endMs: Math.round(performance.now() - startedAt), width: 390, height: 800 })
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${baseUrl}/admin/events`); await settle(page)
        await page.locator("body").click({ position: { x: 4, y: 120 } })
        await page.keyboard.press("Tab")
        await page.getByRole("link", { name: "Aller au contenu" }).waitFor()
        await at("Vous arrivez directement dans le")
        await page.keyboard.press("Enter")
        await page.waitForFunction(() => document.activeElement === document.getElementById("main"))
        await at("Vous arrivez directement dans le")
        // Make the genuine result visible: the next Tab reaches a control in
        // the content, rather than traversing the navigation we just skipped.
        await page.keyboard.press("Tab")
        await page.waitForFunction(() => {
          const main = document.getElementById("main")
          return !!main && document.activeElement !== main && main.contains(document.activeElement)
        })
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
        await at(0.30) /* mid-sentence */
        await page.keyboard.press("Escape")
        await at("le champ s’ouvre et reçoit")
        await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K")
        await field.waitFor()
        if (!(await field.evaluate(element => element === document.activeElement))) throw new Error("Shortcut did not focus the search field")
        await at(0.82) /* mid-sentence */
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
        await at("Ouvrons d’abord sa fiche, puis")
        await tap(page, page.locator("#search-volunteers").locator("..").getByRole("link", { name: "Léa Morel", exact: true }))
        await page.waitForURL(/\/admin\/members\?q=/); await settle(page)
        await page.getByRole("row").filter({ hasText: /Léa\s+Morel/ }).first().waitFor()
        await at("la liste de l’événement est déjà filtrée sur Léa")
        await page.goto(resultsUrl); await settle(page)
        await tap(page, page.locator("#search-registrations").locator("..").getByRole("link", { name: /Léa Morel/ }).first())
        await page.waitForURL(new RegExp(`/admin/events/${featureEventId}/registrations\\?q=`)); await settle(page)
        await page.getByRole("row").filter({ hasText: /Léa\s+Morel/ }).first().waitFor()
        await at(0.75) /* mid-sentence */
        await page.getByText("Liste d'attente", { exact: true }).scrollIntoViewIfNeeded()
      })

      await scene("shift", async (at) => {
        await page.goto(`${baseUrl}/admin/search?q=Buvette`); await settle(page)
        const search = page.getByLabel("Nom, email, téléphone, événement ou poste")
        await at(0.32) /* mid-sentence */
        await page.getByRole("heading", { name: /Créneaux/ }).scrollIntoViewIfNeeded()
        await at("Ajoutons village pour ne garder")
        await search.fill("")
        await typeNaturally(page, search, "Buvette village")
        await search.press("Enter")
        await page.getByRole("link", { name: /Buvette.*village/ }).waitFor()
        await at("la liste des inscriptions est")
        await tap(page, page.getByRole("link", { name: /Buvette.*village/ }))
        await page.waitForURL(new RegExp(`/admin/events/${featureEventId}/registrations\\?shift=`)); await settle(page)
      })

      await scene("limits", async (at) => {
        await page.goto(`${baseUrl}/admin/search?q=Morel`); await settle(page)
        await page.getByText(/Seuls les 20 premiers résultats/).scrollIntoViewIfNeeded()
        const search = page.getByLabel("Nom, email, téléphone, événement ou poste")
        await at("Ajoutez un prénom pour préciser")
        await search.fill("")
        await typeNaturally(page, search, "Léa Morel")
        await search.press("Enter")
        await page.getByRole("heading", { name: /^Bénévoles \(1\)/ }).waitFor()
        await at("Les accents et la casse")
        const narrowed = page.getByLabel("Nom, email, téléphone, événement ou poste")
        await narrowed.fill("")
        await typeNaturally(page, narrowed, "zoe")
        await narrowed.press("Enter")
        await page.waitForURL(/q=zoe/)
        await page.getByText("Zoé Perrin").first().scrollIntoViewIfNeeded()
      })

      await scene("result", async (at) => {
        await page.getByRole("heading", { name: "Recherche" }).waitFor()
        await at(0.72) /* mid-sentence */
        await page.goto(`${baseUrl}/admin/members`); await settle(page)
        await page.getByRole("heading", { name: "Membres", exact: true }).waitFor()
        await at(0.87) /* mid-sentence */
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations`); await settle(page)
        await page.getByRole("heading", { name: "Inscriptions", exact: true }).waitFor()
      })
    } else if (slug === "org-public-identity") {
      // Public organisation pages may retain background prefetch requests. Readiness
      // is the rendered DOM and the explicit assertions below, rather than network silence.
      const identitySettle = async () => {
        await page.waitForLoadState("domcontentloaded")
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(500)
      }
      if (featureEventId !== "video-foundation-identity-event-0" || org !== "fetes-de-montvert") throw new Error("Identity recording requires its explicitly owned fixture")
      await page.goto(`${baseUrl}/admin/settings/admins`); await identitySettle()
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Un nom clair et une adresse stable", duration: 2_300 })
        await page.getByRole("heading", { name: "Paramètres" }).waitFor()
      })

      await scene("names", async (at) => {
        await page.getByRole("heading", { name: /^Nom de l.organisation$/ }).scrollIntoViewIfNeeded()
        await at("Le titre de la page")
        const titleHeading = page.getByRole("heading", { name: "Titre de la page publique" })
        await titleHeading.scrollIntoViewIfNeeded()
        const form = titleHeading.locator("xpath=ancestor::form")
        const field = form.getByLabel("Titre affiché en haut de la page de vos événements")
        await at("Remplaçons-le par Les bénévoles des")
        await tap(page, field)
        await field.fill("")
        await typeNaturally(page, field, "Les bénévoles des Fêtes de Montvert")
        await at("Le message Titre enregistré confirme")
        await tap(page, form.getByRole("button", { name: "Enregistrer" }))
        await form.getByText("Titre enregistré.", { exact: true }).waitFor()
      })

      await scene("logo", async (at) => {
        const panel = page.getByRole("heading", { name: "Logo de l'organisation", exact: true }).locator("..")
        await panel.scrollIntoViewIfNeeded()
        await at(0.20) /* mid-sentence */
        await panel.locator('input[type="file"]').setInputFiles(path.resolve("videos/fixtures/montvert-demo-logo.png"))
        await panel.getByAltText("Aperçu de l'image choisie").waitFor()
        await at("L’image enregistrée apparaît dans les")
        await tap(page, panel.getByRole("button", { name: "Enregistrer le logo", exact: true }))
        await panel.getByText("Logo enregistré. Il apparaît maintenant sur vos pages publiques et vos documents.", { exact: true }).waitFor()
        await panel.getByText("Logo actuel", { exact: true }).scrollIntoViewIfNeeded()
      })

      await scene("slug", async (at) => {
        const heading = page.getByRole("heading", { name: "Adresse de votre espace" })
        await heading.scrollIntoViewIfNeeded()
        await at(0.10) /* mid-sentence */
        const identifier = page.getByLabel("Identifiant", { exact: true })
        await tap(page, identifier)
        await heading.scrollIntoViewIfNeeded()
        await at("Si vous changez l’identifiant alors")
        await identifier.fill("fetes-de-montvert-rencontres")
        await tap(page, heading.locator("..").getByRole("button", { name: "Modifier", exact: true }))
        await page.getByText(/Des événements publiés existent/).waitFor()
        await at("Ici, gardons l’adresse actuelle.")
        await tap(page, page.getByRole("button", { name: "Annuler", exact: true }))
        await identifier.fill("fetes-de-montvert")
        await at("Ici, gardons l’adresse actuelle.")
        await page.getByText("Anciens identifiants (redirigent vers l'actuel)", { exact: true }).scrollIntoViewIfNeeded()
        await page.getByText("montvert-ancien", { exact: true }).waitFor()
        await page.getByText(/supprimer un ancien identifiant cassera les liens/).waitFor()
      })

      await page.goto(`${baseUrl}/?org=${encodeURIComponent(org)}`); await identitySettle()
      await scene("public-page", async (at) => {
        await page.getByText("Les bénévoles des Fêtes de Montvert").first().waitFor()
        await page.locator('img[src^="/api/public/organizations/video-foundation-identity/logo?"]').waitFor()
        await page.getByRole("link", { name: "Marché solidaire" }).waitFor()
        if (await page.getByRole("link", { name: "Rencontre des organisateurs" }).count()) throw new Error("Unlisted event leaked into public organization list")
        await at("elle est publiée, mais non")
        await page.getByRole("link", { name: "Fête du village de Montvert" }).scrollIntoViewIfNeeded()
        await at("Ouvrons son lien direct pour")
        await page.goto(`${baseUrl}/rencontre-2?org=${encodeURIComponent(org)}`); await identitySettle()
        await page.getByRole("heading", { name: "Rencontre des organisateurs", exact: true }).waitFor()
      })

      await scene("event-result", async (at) => {
        await page.goto(`${baseUrl}/?org=${encodeURIComponent(org)}`); await identitySettle()
        const eventLink = page.getByRole("link", { name: "Fête du village de Montvert" })
        await tap(page, eventLink)
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await identitySettle()
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).waitFor()
        await at("On peut donc réutiliser la")
        await page.getByText("Place du Collège, Montvert").first().scrollIntoViewIfNeeded()
      })

      await scene("remove-logo", async (at) => {
        await page.goto(`${baseUrl}/admin/settings/admins`); await identitySettle()
        const panel = page.getByRole("heading", { name: "Logo de l'organisation", exact: true }).locator("..")
        await panel.scrollIntoViewIfNeeded()
        await at("Pour retirer le logo, revenez")
        await tap(page, panel.getByRole("button", { name: "Retirer le logo", exact: true }))
        const confirmation = page.getByRole("alertdialog", { name: "Retirer le logo de l'organisation ?" })
        await confirmation.waitFor()
        await at("Après validation, l’image disparaît des")
        await tap(page, confirmation.getByRole("button", { name: "Retirer le logo", exact: true }))
        await panel.getByText("Logo retiré. Le nom de l'organisation reste affiché.", { exact: true }).waitFor()
        await at(0.67) /* mid-sentence */
        await page.goto(`${baseUrl}/?org=${encodeURIComponent(org)}`); await identitySettle()
        await page.getByText("Les bénévoles des Fêtes de Montvert", { exact: true }).waitFor()
      })

      await scene("result", async (at) => {
        await page.goto(`${baseUrl}/?org=${encodeURIComponent(org)}`); await identitySettle()
        await page.getByText("Les bénévoles des Fêtes de Montvert").first().waitFor()
        await at("Ces paramètres sont réservés au")
        await page.goto(`${baseUrl}/admin/settings/admins`); await identitySettle()
        await page.getByRole("heading", { name: "Nom de l'organisation", exact: true }).scrollIntoViewIfNeeded()
        await at("Pour corriger un texte visible")
        await page.getByRole("heading", { name: "Titre de la page publique", exact: true }).scrollIntoViewIfNeeded()
        await at(0.76) /* mid-sentence */
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
        await at(0.34) /* mid-sentence */
        await form.getByLabel("Fuseau horaire de vos événements").selectOption("Europe/Zurich")
        await at(0.68) /* mid-sentence */
        await form.getByText(/Les heures des créneaux/).scrollIntoViewIfNeeded()
      })

      await scene("timezone-result", async (at) => {
        const heading = page.getByRole("heading", { name: "Fuseau horaire" })
        const form = heading.locator("xpath=ancestor::form")
        await tap(page, form.getByRole("button", { name: "Enregistrer" }))
        await at("un créneau prévu à neuf")
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
        const unchangedSlot = page.getByRole("button", { name: /^09h.*12h.*, [^:]*Accueil[^:]* : sélectionner/ })
        await unchangedSlot.waitFor()
        await unchangedSlot.scrollIntoViewIfNeeded()
        await at(0.84) /* mid-sentence */
        await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
      })

      await page.screencast.showChapter("La charte", { description: "Le cadre accepté par chaque bénévole", duration: 1_400 })
      await scene("charter", async (at) => {
        const heading = page.getByRole("heading", { name: "Charte des bénévoles" })
        await heading.scrollIntoViewIfNeeded()
        const panel = heading.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')]")
        const charter = panel.locator("textarea")
        const insurance = panel.getByRole("switch", { name: "Assurance RC fournie par l'organisation" })
        await at("Le paramètre Assurance RC fournie")
        await tap(page, insurance)
        await at(0.23) /* mid-sentence */
        await tap(page, insurance)
        await at("Réinitialiser la charte par défaut")
        await tap(page, panel.getByRole("button", { name: "Réinitialiser la charte par défaut", exact: true }))
        const completeText = await charter.inputValue()
        if (!completeText.includes("dès que possible") || !completeText.includes("3. L'organisation")) {
          throw new Error("Current complete convention required: do not capture the obsolete build or the one-sentence test text")
        }
        await tap(page, charter)
        await at(0.85) /* mid-sentence */
        await tap(page, panel.getByRole("button", { name: "Enregistrer" }))
        await panel.getByText("Enregistré ✓").waitFor()
      })

      await page.screencast.showChapter("Côté bénévole", { description: "Vérifier le texte réellement présenté", duration: 1_400 })
      await scene("public-setup", async (at) => {
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).waitFor()
        await at(0.22) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: /^09h.*12h.*, [^:]*Accueil[^:]* : sélectionner/ }))
        await at("Vous arrivez au formulaire, avec")
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        await page.getByRole("heading", { name: "Tes informations" }).waitFor()
      })

      await scene("public-result", async (at) => {
        await page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).scrollIntoViewIfNeeded()
        await at("Ouvrez la convention depuis le")
        await tap(page, page.getByRole("button", { name: "convention des bénévoles" }))
        await page.getByRole("dialog", { name: "Convention des Bénévoles" }).waitFor()
        await at("faisons-le défiler pour lire aussi")
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
        await at("Le bouton J’ai lu et")
        await tap(page, page.getByRole("button", { name: "J'ai lu et j'accepte" }))
        await page.getByRole("heading", { name: "Tes informations" }).waitFor()
      })

      await scene("attention", async (at) => {
        await page.getByRole("heading", { name: "Tes informations" }).scrollIntoViewIfNeeded()
        await at(0.24) /* mid-sentence */
        await page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).scrollIntoViewIfNeeded()
        await at("Une modification de votre texte")
        await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
        await page.getByRole("heading", { name: "Charte des bénévoles", exact: true }).scrollIntoViewIfNeeded()
        await at("Pour une information urgente, utilisez")
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/message`); await settle(page)
        await page.getByRole("heading", { name: "Messages", exact: true }).scrollIntoViewIfNeeded()
      })

      await scene("result", async () => {
        await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
        await page.getByRole("heading", { name: "Fuseau horaire" }).scrollIntoViewIfNeeded()
      })
    } else if (slug === "shift-night-dst") {
      const popoverChecks: Record<string, unknown> = {}
      const inspectNightPopover = async (chapter: string) => {
        const dialog = page.getByRole("dialog")
        await dialog.waitFor()
        popoverChecks[chapter] = await dialog.evaluate(element => {
          const rect = element.getBoundingClientRect()
          return { top: rect.top, bottom: rect.bottom, height: rect.height,
            viewportHeight: window.innerHeight, clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY,
            outsideViewport: rect.top < 0 || rect.bottom > window.innerHeight }
        })
        await writeFile(path.join(dir, "popover-checks.json"), JSON.stringify(popoverChecks, null, 2))
      }
      const nightEvent = await page.evaluate(async () => {
        const eventResponse = await fetch("/api/admin/events", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Nuits et changements d'heure 2026", description: "Trois permanences pour comprendre minuit et les changements d'heure.", location: "Maison des associations", startDate: "2026-03-29", endDate: "2026-10-25", publicStatus: "draft" }),
        })
        if (!eventResponse.ok) throw new Error(await eventResponse.text())
        const event = await eventResponse.json()
        const shifts = [
          { roleName: "Nuit ordinaire", label: "Permanence de nuit", date: "2026-07-04", startTime: "22:00", endTime: "02:00", capacity: 2, instructions: "Arriver samedi 4 juillet à 21h45 au stand d'accueil. Fin dimanche 5 juillet à 02h00." },
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
        await at("Ouvrons maintenant le créneau")
        await tap(page, shift)
        await inspectNightPopover("ordinary")
      })
      await scene("spring", async (at) => {
        await tap(page, page.getByRole("button", { name: "Fermer et enregistrer" }))
        const shift = page.getByRole("button", { name: /Passage à l'heure d'été/ })
        await shift.scrollIntoViewIfNeeded()
        await at("Un créneau affiché")
        await tap(page, shift)
        await inspectNightPopover("spring")
      })
      await scene("autumn", async (at) => {
        await tap(page, page.getByRole("button", { name: "Fermer et enregistrer" }))
        const shift = page.getByRole("button", { name: /Passage à l'heure d'hiver/ })
        await shift.scrollIntoViewIfNeeded()
        await at("Le même créneau")
        await tap(page, shift)
        await inspectNightPopover("autumn")
      })
      await scene("timezone", async (at) => {
        await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
        const timeZone = page.getByLabel("Fuseau horaire de vos événements")
        await timeZone.scrollIntoViewIfNeeded()
        await at("Ces calculs dépendent du fuseau horaire")
        await tap(page, timeZone)
      })
      await scene("calendar", async (at) => {
        // Demonstrate the real volunteer command, not an unrelated admin list.
        await page.goto(`${baseUrl}/my/demo-volunteer-camille-0001`); await settle(page)
        const calendar = page.getByRole("link", { name: "Télécharger tout mon planning (fichier .ics)", exact: true })
        await calendar.scrollIntoViewIfNeeded()
        await at(0.22)
        const downloading = page.waitForEvent("download")
        await tap(page, calendar)
        const download = await downloading
        if (await download.failure()) throw new Error("Real calendar export failed")
        const stream = await download.createReadStream()
        if (!stream) throw new Error("Calendar file is unavailable")
        const chunks: Buffer[] = []
        for await (const chunk of stream) chunks.push(Buffer.from(chunk))
        const ics = Buffer.concat(chunks).toString("utf8")
        if (!ics.includes("BEGIN:VCALENDAR") || !ics.includes("BEGIN:VEVENT") || !/DTSTART(?:;[^:]*)?:\d{8}T\d{6}/.test(ics)) throw new Error("Downloaded file does not contain actual calendar instants")
      })
      await scene("result", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${nightEvent.id}/shifts`); await settle(page)
        await tap(page, page.getByRole("button", { name: "Liste", exact: true }))
        const row = page.locator("tr").filter({ hasText: "Permanence de nuit" })
        await row.scrollIntoViewIfNeeded()
        await tap(page, row.getByRole("button", { name: /^Modifier(?: le créneau)?/ }))
        await page.getByRole("heading", { name: "Modifier le créneau" }).waitFor()
        await at(0.18)
        const instructions = page.getByLabel("Consigne pratique", { exact: true })
        await instructions.scrollIntoViewIfNeeded()
        if (!(await instructions.inputValue()).includes("Fin dimanche 5 juillet à 02h00")) throw new Error("Night arrival and next-day instructions missing from actual editor")
        await at(0.65)
      })
    } else if (slug === "shift-timeline-quick-actions") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
      const quickRegion = page.getByRole("region", { name: /Planning du/ }).first()
      const drawnLabel = "Relève dessinée"
      const duplicateLabel = "Relève suivante"
      let createdBar: Locator
      let duplicateBar: Locator
      let drawnEnd = ""
      let duplicateStart = ""
      let duplicateEnd = ""
      const shiftedTime = (value: string, minutes: number) => {
        const [hours, mins] = value.split(":").map(Number)
        const total = hours * 60 + mins + minutes
        if (!Number.isFinite(total) || total < 0 || total >= 24 * 60) throw new Error("Quick-action demonstration must stay within the same day")
        return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
      }
      const typeQuickAction = async (field: Locator, value: string) => {
        await tap(page, field)
        await field.press("ControlOrMeta+A")
        await field.press("Backspace")
        await field.pressSequentially(value, { delay: 95 })
        await page.waitForTimeout(180)
      }
      // Real mouse events on main's handles, slowed enough to see the intermediate width.
      // Only the cursor marker is an overlay: no product styles or dimensions are changed.
      const dragQuickAction = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
        await ensureTouchMarker(page)
        await page.mouse.move(from.x, from.y)
        await page.evaluate(point => {
          const marker = document.getElementById("video-touch-marker")!
          marker.style.transition = "opacity .12s ease"
          marker.style.left = `${point.x}px`; marker.style.top = `${point.y}px`; marker.style.opacity = "1"
        }, from)
        await page.waitForTimeout(450)
        await page.mouse.down()
        for (let step = 1; step <= 20; step++) {
          const point = { x: from.x + (to.x - from.x) * step / 20, y: from.y + (to.y - from.y) * step / 20 }
          await page.mouse.move(point.x, point.y)
          await page.evaluate(point => {
            const marker = document.getElementById("video-touch-marker")!
            marker.style.left = `${point.x}px`; marker.style.top = `${point.y}px`
          }, point)
          await page.waitForTimeout(100)
        }
        await page.mouse.up()
        await page.waitForTimeout(650)
        await page.evaluate(() => { document.getElementById("video-touch-marker")!.style.opacity = "0" })
      }
      const newBarAfter = async (before: string[]): Promise<Locator> => {
        await page.waitForFunction(ids => Array.from(document.querySelectorAll('[data-shift-bar="1"]')).some(el => !ids.includes(el.id)), before)
        const ids = await quickRegion.locator('[data-shift-bar="1"]').evaluateAll(elements => elements.map(el => el.id))
        const added = ids.filter(id => !before.includes(id))
        if (added.length !== 1) throw new Error(`Expected one actual newly saved shift, found ${added.length}`)
        return page.locator(`[id="${added[0]}"]`)
      }
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Dessiner et ajuster sans quitter le planning", duration: 2_300 })
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
      })
      await scene("draw", async (at) => {
        const before = await quickRegion.locator('[data-shift-bar="1"]').evaluateAll(elements => elements.map(el => el.id))
        // Buvette spans both seeded days, exposing the real day/event apply choice.
        const row = quickRegion.locator(".cursor-crosshair").nth(2)
        await row.scrollIntoViewIfNeeded()
        const from = await row.evaluate((el) => {
          const rect = el.getBoundingClientRect()
          const y = rect.top + Math.min(18, rect.height / 2)
          const limit = Math.min(rect.right - 220, window.innerWidth - 240)
          for (let x = Math.max(rect.left + 18, 18); x < limit; x += 15) {
            const free = [0, 30, 60, 90, 120].every(offset => {
              const hit = document.elementFromPoint(x + offset, y) as HTMLElement | null
              return hit?.closest(".cursor-crosshair") === el && !hit.closest("[data-shift-bar]")
            })
            if (free) return { x, y }
          }
          throw new Error("No genuinely empty, visible timeline interval for drawing")
        })
        await at(0.10) /* mid-sentence */
        await dragQuickAction(from, { x: from.x + 112.5, y: from.y })
        await page.getByRole("dialog").waitFor()
        createdBar = await newBarAfter(before)
        drawnEnd = await page.getByRole("dialog").getByLabel("Fin", { exact: true }).inputValue()
        await at("Donnez-lui un libellé")
        await typeQuickAction(page.getByRole("dialog").getByLabel("Libellé", { exact: true }), drawnLabel)
        await at("Donnez-lui un libellé, ajustez les")
        await tap(page, page.getByRole("dialog").getByLabel("Places", { exact: true }))
        await page.getByRole("dialog").getByLabel("Places", { exact: true }).fill("3")
        await page.waitForTimeout(650) // Keep the changed number readable before closing.
        await at(0.81) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: "Fermer et enregistrer", exact: true }))
        await createdBar.getByText(drawnLabel, { exact: true }).waitFor()
      })
      await scene("resize", async (at) => {
        await createdBar.scrollIntoViewIfNeeded()
        const before = await createdBar.boundingBox()
        if (!before) throw new Error("Created shift bar is not visible before resize")
        const handle = createdBar.locator(".cursor-ew-resize").last()
        await handle.scrollIntoViewIfNeeded()
        const box = await handle.boundingBox()
        if (!box) throw new Error("Created shift resize handle is not visible")
        // main: PX_PER_MIN = 2.5, SNAP = 15; 112.5 px is a visible 45-minute extension.
        const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        await handle.evaluate((el, point) => {
          if (document.elementFromPoint(point.x, point.y) !== el && !el.contains(document.elementFromPoint(point.x, point.y))) throw new Error("Resize handle is covered")
          if (point.x + 112.5 >= window.innerWidth - 12) throw new Error("Resize destination is outside the visible viewport")
        }, from)
        await at(0.10) /* mid-sentence */
        await dragQuickAction(from, { x: from.x + 112.5, y: from.y })
        await page.getByText("Horaires mis à jour", { exact: true }).waitFor()
        const after = await createdBar.boundingBox()
        if (!after || after.width - before.width < 90) throw new Error("Actual shift bar did not visibly grow during resize")
        // Releasing the actual resize handle also opens the product popover.
        // Close it visibly before the narrated instruction to reopen it.
        if (await page.getByRole("dialog").isVisible()) {
          await tap(page, page.getByRole("button", { name: "Fermer et enregistrer", exact: true }))
          await page.getByRole("dialog").waitFor({ state: "hidden" })
        }
        await at("Rouvrez ensuite les actions rapides")
        await tap(page, createdBar)
        const actualEnd = await page.getByRole("dialog").getByLabel("Fin", { exact: true }).inputValue()
        if (actualEnd !== shiftedTime(drawnEnd, 45)) throw new Error(`Resize did not persist the expected real end time: ${drawnEnd} → ${actualEnd}`)
        drawnEnd = actualEnd
        await at("Vérifiez-la avant de fermer.")
        await tap(page, page.getByRole("button", { name: "Fermer et enregistrer", exact: true }))
      })
      await scene("popover", async (at) => {
        await at(0.09) /* mid-sentence */
        await tap(page, createdBar)
        await page.getByRole("dialog").waitFor()
        await at("Le choix Appliquer au poste")
        const scope = page.getByRole("group", { name: /Appliquer au poste/ })
        await scope.scrollIntoViewIfNeeded()
        await scope.getByRole("button", { name: "Ce jour", exact: true }).waitFor()
        await scope.getByRole("button", { name: "Tout l’événement", exact: true }).or(scope.getByRole("button", { name: "Tout l'événement", exact: true })).waitFor()
        await at("C’est le bon endroit pour")
        await page.getByLabel("Inscriptions").scrollIntoViewIfNeeded()
      })
      await scene("copy", async (at) => {
        const before = await quickRegion.locator('[data-shift-bar="1"]').evaluateAll(elements => elements.map(el => el.id))
        await page.getByRole("button", { name: "Dupliquer" }).scrollIntoViewIfNeeded()
        await at(0.10) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: "Dupliquer" }))
        await page.getByText("Créneau dupliqué", { exact: true }).waitFor()
        duplicateBar = await newBarAfter(before)
        await tap(page, page.getByRole("button", { name: "Fermer et enregistrer", exact: true }))
        await at("Ouvrez cette copie")
        await tap(page, duplicateBar)
        const dialog = page.getByRole("dialog")
        const start = await dialog.getByLabel("Début", { exact: true }).inputValue()
        const end = await dialog.getByLabel("Fin", { exact: true }).inputValue()
        if (start !== drawnEnd) throw new Error("Dupliquer must create the actual next shift immediately after the source")
        await at("Donnez-lui le libellé Relève suivante")
        await typeQuickAction(dialog.getByLabel("Libellé", { exact: true }), duplicateLabel)
        duplicateStart = shiftedTime(start, 15)
        duplicateEnd = shiftedTime(end, 15)
        await at("Ici, on la décale de")
        await tap(page, dialog.getByLabel("Début", { exact: true }))
        await dialog.getByLabel("Début", { exact: true }).fill(duplicateStart)
        await tap(page, dialog.getByLabel("Fin", { exact: true }))
        await dialog.getByLabel("Fin", { exact: true }).fill(duplicateEnd)
        await at("Ici, on la décale de")
        await tap(page, dialog.getByRole("button", { name: "Décaler", exact: true }))
        await dialog.getByText("Horaires enregistrés.", { exact: true }).waitFor()
        await at("Fermer et enregistrer conserve le")
        await tap(page, page.getByRole("button", { name: "Fermer et enregistrer", exact: true }))
        await duplicateBar.getByText(duplicateLabel, { exact: true }).waitFor()
      })
      await scene("detail", async (at) => {
        await at("Pour ajouter une consigne à cette relève")
        await tap(page, page.getByRole("button", { name: "Liste" }))
        const row = page.locator("tbody tr").filter({ hasText: duplicateLabel })
        await row.scrollIntoViewIfNeeded()
        await at(0.16) /* mid-sentence: « puis cliquez sur Modifier » in the opening sentence */
        await tap(page, row.getByRole("button", { name: /^Modifier(?: le créneau)?/ }))
        await page.getByRole("heading", { name: "Modifier le créneau" }).waitFor()
        await at("Ici, saisissez Venir dix minutes avant")
        const instructions = page.getByLabel("Consigne pratique", { exact: true })
        await instructions.scrollIntoViewIfNeeded()
        await typeQuickAction(instructions, "Venir 10 minutes avant.")
        await at("Ce conseil appartient à la")
        await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true }))
        await page.getByRole("heading", { name: "Modifier le créneau" }).waitFor({ state: "hidden" })
        // Check actual saved values without flashing an unannounced second editor.
        const persistedResponse = await page.request.get(`${baseUrl}/api/admin/events/${featureEventId}`)
        if (!persistedResponse.ok()) throw new Error("Cannot verify the saved copied shift")
        const persisted = await persistedResponse.json() as { shifts: { label: string | null; instructions: string | null }[] }
        const savedCopies = persisted.shifts.filter(shift => shift.label === duplicateLabel)
        const savedOriginals = persisted.shifts.filter(shift => shift.label === drawnLabel)
        if (savedCopies.length !== 1 || savedCopies[0].instructions !== "Venir 10 minutes avant." || savedOriginals.length !== 1 || savedOriginals[0].instructions === "Venir 10 minutes avant.") throw new Error("Detailed instruction must persist on the copy alone")
      })
      // Reload and restore the List before the narration says « De retour en Liste ».
      await page.reload(); await settle(page)
      const savedList = page.getByRole("button", { name: "Liste", exact: true })
      if (await savedList.getAttribute("aria-pressed") !== "true") await tap(page, savedList)
      await page.locator("tbody").waitFor()
      await scene("result", async (at) => {
        const original = page.locator("tbody tr").filter({ hasText: drawnLabel })
        const copied = page.locator("tbody tr").filter({ hasText: duplicateLabel })
        if (await original.count() !== 1 || await copied.count() !== 1) throw new Error("Saved List must contain both independent shifts exactly once")
        if (!(await copied.innerText()).includes(`${duplicateStart}–${duplicateEnd}`)) throw new Error("Reloaded List does not show the copied shift's saved hours")
        // Future take: center the adjacent saved rows before the opening result claim.
        await original.evaluate(element => element.scrollIntoView({ block: "center" }))
        await at("L’original conserve son libellé, et")
        await copied.scrollIntoViewIfNeeded()
        await copied.getByText("0/3", { exact: true }).waitFor()
        await at(0.70) /* mid-sentence */
      })
    } else if (slug === "shift-create-series") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
      await scene("welcome", async (at) => {
        await page.screencast.showChapter(manifest.title, { description: "Découper une longue journée en relèves", duration: 2_300 })
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
        await at("Au lieu de saisir chaque")
        await tap(page, page.getByRole("button", { name: "Créer une série", exact: true }))
        await page.getByRole("heading", { name: "Créer une série de créneaux" }).waitFor()
      })
      await scene("range", async (at) => {
        await page.getByRole("heading", { name: "Créer une série de créneaux" }).waitFor()
        await at(0.06) /* mid-sentence */
        await tap(page, page.getByLabel(/^Poste(?: \*)?$/))
        await page.getByLabel(/^Poste(?: \*)?$/).fill("Buvette série")
        await at("Ici, la buvette fonctionne de")
        const date = page.getByLabel(/^Date(?: \*)?$/)
        if (await date.count()) await date.selectOption({ index: 1 })
        await at(0.33) /* mid-sentence */
        await tap(page, page.getByLabel(/^Début(?: \*)?$/))
        await page.getByLabel(/^Début(?: \*)?$/).fill("10:00")
        await at("Cette plage décrit le besoin")
        await tap(page, page.getByLabel(/^Fin(?: \*)?$/))
        await page.getByLabel(/^Fin(?: \*)?$/).fill("22:00")
      })
      await scene("duration", async (at) => {
        const duration = page.getByLabel(/^Durée d'un créneau(?: \*)?$/)
        await tap(page, duration)
        await duration.selectOption("120")
        await at(0.21) /* mid-sentence */
        const capacity = page.getByLabel(/^Places par créneau(?: \*)?$/)
        await tap(page, capacity)
        await capacity.fill("3")
        await at("La pause ajoute un intervalle")
        const pause = page.getByLabel("Pause entre deux créneaux (min)", { exact: true })
        await pause.scrollIntoViewIfNeeded()
        await tap(page, pause)
        await at("Ici, choisissons zéro minute ")
        await pause.fill("0")
      })
      await scene("preview", async (at) => {
        await page.getByText(/Aperçu :/).scrollIntoViewIfNeeded()
        await page.getByRole("list", { name: "Créneaux qui seront créés" }).scrollIntoViewIfNeeded()
        await at(0.68) /* mid-sentence */
      })
      await scene("create", async (at) => {
        const create = page.getByRole("button", { name: "Créer 6 créneaux" })
        await create.scrollIntoViewIfNeeded()
        await at("Créons la série")
        await tap(page, create)
        await page.getByText("Buvette série", { exact: true }).first().waitFor()
        await at("chacune possède son propre effectif")
        await page.getByText("Buvette série", { exact: true }).first().scrollIntoViewIfNeeded()
      })
      await scene("adjust", async (at) => {
        await tap(page, page.getByRole("button", { name: "Liste" }))
        const row = page.locator("tr").filter({ hasText: "Buvette série" }).first()
        await row.scrollIntoViewIfNeeded()
        await at(0.07) /* mid-sentence */
        await tap(page, row.getByRole("button", { name: /^Modifier(?: le créneau)?/ }))
        await page.getByRole("heading", { name: "Modifier le créneau" }).waitFor()
        await at(0.38) /* mid-sentence */
        const capacity = page.getByLabel(/^Places(?: \*)?$/)
        await tap(page, capacity)
        await capacity.fill("4")
        await at("Enregistrons")
        await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true }))
        await page.getByRole("heading", { name: "Modifier le créneau" }).waitFor({ state: "hidden" })
        await settle(page)
      })
      await scene("result", async (at) => {
        const list = page.getByRole("button", { name: "Liste", exact: true })
        if (await list.getAttribute("aria-pressed") !== "true") await tap(page, list)
        const rows = page.locator("tr").filter({ hasText: "Buvette série" })
        if (await rows.count() !== 6) throw new Error("Series result must contain exactly six actual shifts")
        const first = rows.first()
        await first.getByText("0/4", { exact: true }).waitFor()
        for (let index = 1; index < 6; index++) await rows.nth(index).getByText("0/3", { exact: true }).waitFor()
        await at("quatre places pour la première relève")
        await first.evaluate(element => element.scrollIntoView({ block: "center" }))
        await at("Une série bien découpée facilite")
        await rows.last().scrollIntoViewIfNeeded()
      })
    } else if (slug === "shift-recurrence") {
      // Dates follow the fixture's season (scripts/seed-video-recurrence.ts): never a fixed day.
      const event = await page.evaluate(async (id) => (await (await fetch(`/api/admin/events/${id}`)).json()) as { startDate: string }, featureEventId)
      const start = event.startDate.slice(0, 10)
      const plusDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
      const closure = plusDays(start, 2 * 7 + 1)
      const stopFrom = plusDays(start, 4 * 7 + 2)
      const form = page.getByRole("region", { name: "Répéter un créneau chaque semaine" })
      const rules = page.getByRole("region", { name: "Permanences récurrentes" })
      await scene("welcome", async (at) => {
        await page.screencast.showChapter(manifest.title, { description: "Une permanence décrite une fois pour toute la saison", duration: 2_300 })
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
        await rules.scrollIntoViewIfNeeded()
        await at("Ouvrons Répéter chaque semaine")
        const open = page.getByRole("button", { name: "Répéter chaque semaine", exact: true })
        await open.scrollIntoViewIfNeeded()
        await tap(page, open)
        await page.getByRole("heading", { name: "Répéter un créneau chaque semaine" }).waitFor()
      })
      await scene("describe", async (at) => {
        await typeNaturally(page, form.getByLabel(/^Poste/), "Caisse et accueil")
        await at("Le texte sous le champ rappelle")
        await form.locator("p[id$='-role-hint']").filter({ hasText: /Les paramètres du poste/ }).waitFor()
        await at("Cochez les jours")
        await tap(page, form.getByRole("checkbox", { name: "mardi", exact: true }))
        await tap(page, form.getByRole("checkbox", { name: "jeudi", exact: true }))
        await at(0.36)
        const weekly = form.getByRole("radio", { name: "Chaque semaine", exact: true })
        await weekly.scrollIntoViewIfNeeded()
        if (!(await weekly.isChecked())) throw new Error("« Chaque semaine » must be the default rhythm")
        await at("La plage va")
        await typeNaturally(page, form.getByLabel(/^Début/), "17:00")
        await typeNaturally(page, form.getByLabel(/^Fin/), "19:30")
        await at(0.86)
        const capacity = form.getByLabel(/^Places par créneau/)
        await capacity.scrollIntoViewIfNeeded()
        if (await capacity.inputValue() !== "2") await fillVisibly(page, capacity, "2", 400)
      })
      await scene("exclusions", async (at) => {
        const holidays = form.getByLabel("Jours fériés exclus", { exact: true })
        await holidays.scrollIntoViewIfNeeded()
        if (await holidays.inputValue() !== "CH") throw new Error("Swiss holidays must be proposed from the organization's time zone")
        await at("Ajoutons une fermeture")
        await fillVisibly(page, form.getByLabel("Fermetures (vacances, jours sans permanence)", { exact: true }), closure, 600)
        await tap(page, form.getByRole("button", { name: "Ajouter la date", exact: true }))
        await form.getByRole("list", { name: "Fermetures" }).waitFor()
        await at("L’aperçu donne")
        await form.getByText(/^Aperçu :/).first().scrollIntoViewIfNeeded()
        // Inside « L’aperçu donne … puis chaque date exclue avec sa raison » : no pause to cue on.
        await at(0.66)
        const skipped = form.getByRole("list", { name: "Dates exclues" })
        await skipped.scrollIntoViewIfNeeded()
        await skipped.getByText(/ : fermeture$/).waitFor()
      })
      await scene("create", async (at) => {
        const create = form.getByRole("button", { name: /^Créer \d+ créneaux$/ })
        await create.scrollIntoViewIfNeeded()
        await at("Créons les créneaux")
        await tap(page, create)
        await form.waitFor({ state: "hidden" })
        await rules.getByText("Caisse et accueil", { exact: true }).waitFor()
        await rules.scrollIntoViewIfNeeded()
        await at("Chaque date est un créneau ordinaire")
      })
      await scene("change", async (at) => {
        await at("Modifier à partir d’une date")
        await tap(page, rules.getByRole("button", { name: /^Modifier à partir d'une date\W+Caisse et accueil$/ }))
        const panel = rules.getByRole("group", { name: "Modifier Caisse et accueil à partir d'une date" })
        await panel.waitFor()
        await at(0.28)
        await fillVisibly(page, panel.getByLabel("Places par créneau", { exact: true }), "3", 600)
        await at(0.52)
        await tap(page, panel.getByRole("button", { name: "Modifier ces dates", exact: true }))
        await panel.waitFor({ state: "hidden" })
        await page.getByRole("status").filter({ hasText: /Permanence Caisse et accueil modifiée/ }).waitFor()
      })
      await scene("stop", async (at) => {
        await tap(page, rules.getByRole("button", { name: /^Arrêter à partir d'une date\W+Réception des livraisons$/ }))
        const panel = rules.getByRole("group", { name: "Arrêter Réception des livraisons à partir d'une date" })
        await panel.waitFor()
        await fillVisibly(page, panel.getByLabel("À partir du", { exact: true }), stopFrom, 600)
        await at("Les dates sans inscrit")
        await tap(page, panel.getByRole("button", { name: "Arrêter la permanence", exact: true }))
        await panel.getByRole("group", { name: /^2 dates ont déjà des inscrits/ }).waitFor()
        await at("Confirmons")
        await tap(page, panel.getByRole("button", { name: "Annuler aussi ces 2 dates et prévenir les inscrits", exact: true }))
        await page.getByRole("status").filter({ hasText: /Permanence Réception des livraisons arrêtée/ }).waitFor()
      })
      await scene("volunteer", async (at) => {
        await page.goto(`${baseUrl}/epicerie-permanences?org=${encodeURIComponent(org)}`); await settle(page)
        const months = page.getByRole("group", { name: "Choisir le mois" })
        await months.waitFor()
        await at("À partir de huit dates")
        await tap(page, months.getByRole("button").nth(1))
        await months.getByRole("button").nth(1).and(page.locator("[aria-pressed=true]")).waitFor()
      })
      await scene("result", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
        await rules.scrollIntoViewIfNeeded()
        if (await rules.getByRole("listitem").count() !== 2) throw new Error("Both permanences must stay listed after a stop from a later date")
        await at("Pour la saison suivante")
      })
    } else if (slug === "shift-create-edit-detail") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
      const enterDetailText = async (field: Locator, value: string) => {
        await field.scrollIntoViewIfNeeded()
        await tap(page, field)
        await field.fill(value)
        await page.waitForTimeout(400)
        if (await field.inputValue() !== value) throw new Error("Detailed shift field differs from the demonstrated entry")
      }
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "De l’horaire aux informations du jour J", duration: 2_300 })
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
      })
      await scene("identity", async (at) => {
        await tap(page, page.getByRole("button", { name: "+ Ajouter un créneau" }))
        await page.getByRole("heading", { name: "Nouveau créneau" }).waitFor()
        await at(0.08) /* mid-sentence */
        await enterDetailText(page.getByLabel(/^Poste(?: \*)?$/), "Accueil")
        await at("Choisissez d’abord le poste")
        await enterDetailText(page.getByLabel("Libellé"), "Accueil des artistes")
        const date = page.getByLabel(/^Date(?: \*)?$/)
        await at("La date, l’heure de début")
        if (await date.count()) {
          await tap(page, date)
          await date.selectOption({ index: 1 })
          await page.waitForTimeout(500)
        }
        await at("La date, l’heure de début")
        await fillVisibly(page, page.getByLabel(/^Début(?: \*)?$/), "18:00", 850)
        await at("La date, l’heure de début")
        await fillVisibly(page, page.getByLabel(/^Fin(?: \*)?$/), "21:30", 850)
        await at("La capacité indique combien de")
        await enterDetailText(page.getByLabel(/^Places(?: \*)?$/), "3")
        if (await page.getByLabel(/^Début(?: \*)?$/).inputValue() !== "18:00" || await page.getByLabel(/^Fin(?: \*)?$/).inputValue() !== "21:30") throw new Error("Detailed shift hours must match the visible actual form values")
      })
      await scene("availability", async (at) => {
        const waitlist = page.getByRole("checkbox", { name: /Activer la liste d'attente/ })
        await waitlist.scrollIntoViewIfNeeded()
        await at("La liste d’attente recueille les")
        if (!await waitlist.isChecked()) await tap(page, waitlist)
        await at("Le mode Sur validation transforme")
        const approval = page.getByRole("checkbox", { name: /Sur validation/ })
        await approval.scrollIntoViewIfNeeded()
        if (!await approval.isChecked()) await tap(page, approval)
        if (!await waitlist.isChecked() || !await approval.isChecked()) throw new Error("The demonstrated waitlist and approval options must both be enabled in the actual form")
      })
      await scene("practical", async (at) => {
        await page.getByRole("group", { name: "Infos pratiques pour les bénévoles" }).scrollIntoViewIfNeeded()
        await at("Renseignons d’abord le lieu de rendez-vous")
        await enterDetailText(page.getByLabel("Lieu de rendez-vous"), "Entrée artistes, portail nord")
        await at("Ajoutons une consigne")
        await enterDetailText(page.getByLabel("Consigne pratique"), "Venir dix minutes avant avec des chaussures fermées.")
        await at("Le contact opérationnel indique")
        await enterDetailText(page.getByLabel("Personne de contact"), "Léa, accueil artistes")
        await enterDetailText(page.getByLabel("Téléphone du contact"), "079 000 01 24")
        await at("Les coordonnées GPS placent")
        await enterDetailText(page.getByLabel("Coordonnées GPS ou lien de carte"), "46.1805734, 6.1228285")
      })
      await scene("save", async (at) => {
        await page.getByRole("button", { name: "Ajouter", exact: true }).scrollIntoViewIfNeeded()
        await at(0.08) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: "Ajouter", exact: true }))
        await page.getByText("Accueil des artistes", { exact: true }).first().waitFor()
        await page.getByText("Accueil des artistes", { exact: true }).first().scrollIntoViewIfNeeded()
        await at(0.60) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: "Liste", exact: true }))
        await tap(page, page.getByRole("row").filter({ hasText: "Accueil des artistes" }).getByRole("button", { name: /^Modifier(?: le créneau)?/ }))
        await page.getByLabel("Consigne pratique").scrollIntoViewIfNeeded()
      })
      await scene("change", async (at) => {
        // The preceding verification reopened the editor. Return to the real
        // planning page before showing list actions; never click through it.
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
        await tap(page, page.getByRole("button", { name: "Liste" }))
        const row = page.locator("tr").filter({ hasText: "Accueil des artistes" })
        await row.scrollIntoViewIfNeeded()
        await at("Rouvrir l’éditeur permet de corriger")
        await tap(page, row.getByRole("button", { name: /^Modifier(?: le créneau)?/ }))
        await page.getByRole("heading", { name: "Modifier le créneau" }).waitFor()
        await at(0.70) /* mid-sentence */
        await page.getByLabel("Lieu de rendez-vous").scrollIntoViewIfNeeded()
      })
      await scene("result", async (at) => {
        await page.getByLabel("Consigne pratique").scrollIntoViewIfNeeded()
        await at(0.62) /* mid-sentence */
      })
    } else if (slug === "shifts-roles-views") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Une mission, plusieurs plages horaires", duration: 2_300 })
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
      })
      await scene("timeline", async (at) => {
        await page.getByRole("button", { name: "Frise", exact: true }).scrollIntoViewIfNeeded()
        await at(0.40) /* mid-sentence */
        await page.getByText("Buvette", { exact: true }).first().scrollIntoViewIfNeeded()
      })
      await scene("list", async (at) => {
        await at("La vue Liste présente")
        await tap(page, page.getByRole("button", { name: "Liste" }))
        await at(0.58) /* mid-sentence */
        await page.getByText("Accueil", { exact: true }).first().scrollIntoViewIfNeeded()
      })
      await scene("roles", async (at) => {
        await page.getByRole("button", { name: "Gérer les postes" }).scrollIntoViewIfNeeded()
        await at("Dans Gérer les postes")
        await tap(page, page.getByRole("button", { name: "Gérer les postes" }))
        await page.getByRole("heading", { name: "Gérer les postes" }).waitFor()
        await at("Les flèches Monter et Descendre")
        const move = page.getByRole("button", { name: /Descendre le poste/ }).filter({ visible: true }).first()
        await tap(page, move)
      })
      await scene("colors", async (at) => {
        const color = page.getByRole("button", { name: /Changer la couleur du poste/ }).first()
        await color.scrollIntoViewIfNeeded()
        await at("Choisissez-la dans la palette prévue")
        await tap(page, color)
        const palette = page.getByRole("group", { name: /Couleur du poste/ })
        await at("elle reste cohérente dans les")
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
        await at("Utilisez la Frise pour construire")
        await tap(page, timeline)
        await page.getByRole("region", { name: /^Planning du/ }).first().waitFor()
        await at("Avec des noms courts, un")
        await tap(page, page.getByRole("button", { name: "Liste", exact: true }))
        await at(0.78) /* mid-sentence */
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

      // Prepare the real editor between chapters so its already-enabled option
      // is visible on the first sentence, rather than late after the capacity.
      await tap(page, page.getByRole("button", { name: "Liste" }))
      const waitlistRow = page.locator("tr").filter({ hasText: "Buvette" }).filter({ hasText: "14:00–18:00" }).first()
      await waitlistRow.scrollIntoViewIfNeeded()
      await tap(page, waitlistRow.getByRole("button", { name: /^Modifier(?: le créneau)?/ }))
      await page.getByRole("heading", { name: "Modifier le créneau" }).waitFor()
      const waitlistOption = page.getByRole("checkbox", { name: /Activer la liste d'attente/ })
      if (!(await waitlistOption.isChecked())) throw new Error("Waitlist must be enabled in the demo data")
      await waitlistOption.scrollIntoViewIfNeeded()
      await scene("setup", async (at) => {
        await at("La liste d’attente s’active sur le créneau")
        await waitlistOption.focus()
        await at("Tant que la capacité n’est pas atteinte")
        const capacity = page.getByLabel(/^Places(?: \*)?$/)
        await capacity.scrollIntoViewIfNeeded()
        await capacity.focus()
        await at("Une fois le créneau complet")
        await waitlistOption.scrollIntoViewIfNeeded()
        await waitlistOption.focus()
      })

      await scene("admin", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations?shift=${encodeURIComponent(waitlistShift.id)}`); await settle(page)
        await page.getByRole("heading", { name: "Inscriptions" }).waitFor()
        const firstWaiting = page.locator("tbody tr").filter({ hasText: "Camille Rochat" })
        if (await firstWaiting.count() !== 1) throw new Error("Expected Camille's single registration on the filtered waitlist shift")
        await at(0.32) /* mid-sentence */
        await firstWaiting.getByText("Camille Rochat", { exact: true }).scrollIntoViewIfNeeded()
        await at("On peut ainsi répondre à")
        // Current RegistrationRow renders plain-language "position N", not the old "#N".
        await firstWaiting.getByText("position 1", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.78) /* mid-sentence */
        await page.locator("tbody tr").filter({ hasText: "position 3" }).getByText("position 3", { exact: true }).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Une place se libère", { description: "Une offre limitée au début du créneau", duration: 1_400 })
      await scene("release", async (at) => {
        await page.goto(`${baseUrl}/my/demo-waitlist-release-zoe-0001`); await settle(page)
        await page.getByRole("heading", { name: /Mes inscriptions/ }).waitFor()
        await at(0.28) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: `Annuler le créneau ${waitlistShift.label}` }))
        await page.getByRole("alertdialog").waitFor()
        await at(0.52) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: "Oui, annuler" }))
        await page.getByText(/annulée/i).first().waitFor()
        await at(0.78) /* mid-sentence */
      })

      await scene("volunteer", async (at) => {
        await page.goto(`${baseUrl}/my/demo-waitlist-camille-0001`); await settle(page)
        const offeredCard = page.getByRole("region", { name: "Tous mes créneaux", exact: true }).locator('[id^="registration-"]').filter({ has: page.getByRole("link", { name: `Prendre la place : ${waitlistShift.label}`, exact: true }) })
        if (await offeredCard.count() !== 1) throw new Error("Expected a single actual offered registration card")
        await offeredCard.getByText("Une place t'est proposée", { exact: true }).waitFor()
        await offeredCard.scrollIntoViewIfNeeded()
        await at(0.26) /* mid-sentence */
        await offeredCard.getByText(/Confirme avant/).scrollIntoViewIfNeeded()
        await at("Le lien Prendre la place ouvre")
        await tap(page, offeredCard.getByRole("link", { name: `Prendre la place : ${waitlistShift.label}`, exact: true }))
        await page.getByRole("button", { name: "Prendre la place", exact: true }).waitFor()
        const unchangedOffer = await (await page.request.get(`${baseUrl}/api/public/registrations/demo-waitlist-camille-0001`)).json()
        if (!unchangedOffer.registrations.some((registration: { status: string; shift: { id: string } }) => registration.status === "offered" && registration.shift.id === waitlistShift.id)) throw new Error("Opening an offer must leave it offered")
        await at("Seul le bouton Prendre la place")
        await page.getByRole("button", { name: "Prendre la place", exact: true }).focus()
        await at("Refuser la place conserve une réponse explicite")
        await page.goto(`${baseUrl}/my/demo-waitlist-camille-0001`); await settle(page)
        await offeredCard.getByRole("button", { name: `Refuser la place proposée sur le créneau ${waitlistShift.label}`, exact: true }).focus()
      })

      await scene("expiry", async (at) => {
        await page.getByRole("heading", { name: "Liste d'attente : comment ça marche" }).scrollIntoViewIfNeeded()
        await at("la promotion passe à la")
        await page.getByText(/Si tu ne réponds pas dans les 24 heures/).scrollIntoViewIfNeeded()
        await at("Dans l’administration, on peut suivre l’offre active")
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations?shift=${encodeURIComponent(waitlistShift.id)}`); await settle(page)
        await page.locator("tbody tr").filter({ hasText: "Camille Rochat" }).scrollIntoViewIfNeeded()
      })

      await scene("result", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations?shift=${encodeURIComponent(waitlistShift.id)}`); await settle(page)
        const offeredRow = page.locator("tbody tr").filter({ hasText: "Camille Rochat" })
        if (await offeredRow.count() !== 1) throw new Error("Expected Camille's actual offered registration on the filtered shift")
        await at(0.34) /* mid-sentence */
        await offeredRow.getByText("Camille Rochat", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.62) /* mid-sentence */
        await offeredRow.getByText("Place proposée", { exact: true }).scrollIntoViewIfNeeded()
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
        await at("Dans le créneau")
        await tap(page, row.getByRole("button", { name: /^Modifier(?: le créneau)?/ }))
        await page.getByRole("heading", { name: "Modifier le créneau" }).waitFor()
        await at("Dans le créneau")
        const approval = page.getByRole("checkbox", { name: /Sur validation/ })
        if (!(await approval.isChecked())) throw new Error("Approval must be enabled in the demo data")
        await approval.scrollIntoViewIfNeeded()
        await at("ici, vingt et un ans")
        await page.getByLabel("Âge minimum (optionnel)").scrollIntoViewIfNeeded()
        await page.getByLabel("Consigne pratique").scrollIntoViewIfNeeded()
      })

      await scene("request", async (at) => {
        await page.goto(`${baseUrl}/my/demo-approval-lucas-0001`); await settle(page)
        await page.getByRole("heading", { name: /Mes inscriptions/ }).waitFor()
        await at(0.30)
        const requestedCard = page.getByRole("region", { name: "Tous mes créneaux", exact: true }).locator('[id^="registration-"]').filter({ hasText: "Chauffeur navette" })
        if (await requestedCard.count() !== 1) throw new Error("Expected Lucas's single actual requested shift card")
        await requestedCard.getByText("Demande envoyée · en attente de réponse", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.62)
        await requestedCard.getByText(/Créneau sur validation/).scrollIntoViewIfNeeded()
        await at(0.78)
        await requestedCard.getByRole("button", { name: /Retirer ma demande/ }).focus()
      })

      await page.screencast.showChapter("Examiner la candidature", { description: "Coordonnées, réponses et disponibilités", duration: 1_400 })
      await scene("admin", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations?demandes=1`); await settle(page)
        await page.getByRole("heading", { name: "Inscriptions" }).waitFor()
        const lucasRequest = page.locator("tbody tr").filter({ hasText: "Lucas Girard" })
        if (await lucasRequest.count() !== 1) throw new Error("Expected Lucas's single actual request in the requests view")
        await at(0.28)
        await lucasRequest.getByText("Lucas Girard", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.58)
        await lucasRequest.getByText(/permis B/i).scrollIntoViewIfNeeded()
        await at(0.78)
        await lucasRequest.getByRole("button", { name: /Accepter la demande de Lucas Girard/ }).focus()
      })

      await scene("decision", async (at) => {
        await at("Refuser libère la place")
        await tap(page, page.getByRole("button", { name: /Refuser la demande de Lucas Girard/ }))
        await page.getByRole("heading", { name: "Refuser la demande de Lucas Girard ?" }).waitFor()
        await at("ce parcours permet d’ajouter")
        await page.getByLabel("Message à la personne (facultatif)").fill("Le permis doit être valable depuis trois ans.")
        await at("Après avoir vérifié cette possibilité")
        await tap(page, page.getByRole("button", { name: "Annuler" }))
        await tap(page, page.getByRole("button", { name: /Accepter la demande de Lucas Girard/ }))
        await page.getByRole("heading", { name: "Accepter la demande de Lucas Girard ?" }).waitFor()
        await at(0.78)
        await tap(page, page.getByRole("button", { name: "Accepter", exact: true }))
        await page.getByText(/Demande de Lucas Girard acceptée/).waitFor()
      })

      await scene("volunteer", async (at) => {
        await page.goto(`${baseUrl}/my/demo-approval-lucas-0001`); await settle(page)
        await page.getByRole("heading", { name: /Mes inscriptions/ }).waitFor()
        // "Avant ta mission" repeats the label, but it is not the saved registration.
        const confirmedCard = page.getByRole("region", { name: "Tous mes créneaux", exact: true }).locator('[id^="registration-"]').filter({ hasText: "Chauffeur navette" })
        if (await confirmedCard.count() !== 1) throw new Error("Expected Lucas's single actual confirmed registration card")
        await at(0.30)
        await confirmedCard.getByText("Chauffeur navette", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.58)
        await confirmedCard.getByRole("link", { name: /Ajouter à mon calendrier/ }).scrollIntoViewIfNeeded()
        await at(0.78)
        // Practical information for the next confirmed shift is shown in this dedicated brief.
        await page.locator("#avant-ta-mission").getByText("Permis B depuis 3 ans", { exact: true }).scrollIntoViewIfNeeded()
      })

      await scene("result", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations?q=Lucas%20Girard`); await settle(page)
        const confirmedRow = page.locator("tbody tr").filter({ hasText: "Lucas Girard" })
        if (await confirmedRow.count() !== 1) throw new Error("Expected Lucas's single confirmed registration after approval")
        await at(0.34)
        await confirmedRow.getByText("Lucas Girard", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.64)
        const requests = confirmedRow.getByText("Demande à traiter", { exact: true })
        if (await requests.count()) throw new Error("Lucas request should be confirmed")
      })
    } else if (slug === "shift-eligibility-rules") {
      // Public pages may keep background requests active. Readiness is proved by
      // each scene's real UI assertions, not by network inactivity.
      const settleEligibility = async () => {
        await page.waitForLoadState("domcontentloaded")
        await page.evaluate(() => document.fonts?.ready)
        await page.waitForTimeout(500)
      }
      const publicPlanning = `${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`
      const clearVolunteerSession = async () => {
        await page.goto(publicPlanning); await settleEligibility()
        const quit = page.getByRole("button", { name: "Quitter la session", exact: true })
        if (await quit.count()) { await tap(page, quit); await quit.waitFor({ state: "hidden" }) }
      }
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settleEligibility()
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Des règles simples, expliquées avant l’inscription", duration: 2_300 })
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
      })

      await scene("settings", async (at) => {
        await tap(page, page.getByRole("button", { name: "Liste" }))
        const evening = page.locator("tr").filter({ hasText: "Buvette" }).filter({ hasText: "18:00–22:00" }).first()
        await evening.scrollIntoViewIfNeeded()
        await at("L’âge minimum appartient au créneau.")
        await tap(page, evening.getByRole("button", { name: /^Modifier(?: le créneau)?/ }))
        await page.getByRole("heading", { name: "Modifier le créneau" }).waitFor()
        const age = page.getByLabel("Âge minimum (optionnel)", { exact: true })
        await age.scrollIntoViewIfNeeded()
        if (await age.inputValue() !== "18") throw new Error("Evening Buvette must genuinely require eighteen years")
        await at("La limite et les étiquettes")
        await tap(page, page.getByRole("button", { name: "Annuler" }))
        await tap(page, page.getByRole("button", { name: "Gérer les postes" }))
        await page.getByRole("heading", { name: "Gérer les postes" }).waitFor()
        await at(0.44) /* mid-sentence */
        const limit = page.getByRole("button", { name: /Limite : 2 créneaux par personne, poste « Buvette »/ })
        await tap(page, limit)
        const limitField = page.getByLabel("Nombre maximal de créneaux « Buvette » par personne", { exact: true })
        if (await limitField.inputValue() !== "2") throw new Error("Actual Buvette quota must equal two")
        await at("Ici, Buvette est limitée à")
        await tap(page, page.locator("form").filter({ has: limitField }).getByRole("button", { name: "Annuler", exact: true }))
        await tap(page, page.getByRole("button", { name: /Accès : sécurité, poste « Sécurité » réservé/ }))
        const reserved = page.getByLabel("Étiquettes donnant accès au poste « Sécurité »", { exact: true })
        if (await reserved.inputValue() !== "sécurité") throw new Error("Actual reserved tag must be sécurité")
      })

      await scene("age", async (at) => {
        await clearVolunteerSession()
        const evening = page.getByRole("button", { name: /18h–22h.*Buvette.*18 ans minimum/ })
        await evening.scrollIntoViewIfNeeded()
        await at("La date de naissance demandée")
        await tap(page, evening)
        await at(0.49) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        const birthdate = page.getByLabel("Date de naissance *", { exact: true })
        await birthdate.scrollIntoViewIfNeeded()
        await at("modifier le navigateur ou masquer")
        await fillVisibly(page, birthdate, "1995-11-28")
      })

      await page.screencast.showChapter("Limiter sans masquer", { description: "La règle et sa solution restent compréhensibles", duration: 1_400 })
      await scene("quota", async (at) => {
        // Keep the real personal-page and sign-up link on the same public origin.
        await page.goto(`https://${org}.benevol.app/my/demo-waitlist-camille-0001`); await settleEligibility()
        await page.getByRole("heading", { name: /Mes inscriptions/ }).waitFor()
        // Align the cards, not just their heading at the bottom of the viewport.
        await page.getByRole("region", { name: "Tous mes créneaux", exact: true }).evaluate(element => element.scrollIntoView({ block: "start" }))
        await at("En revenant au planning depuis")
        await tap(page, page.getByRole("link", { name: "S'inscrire à d'autres créneaux", exact: true }))
        await settleEligibility()
        const limited = page.getByRole("button", { name: /Buvette.*limite de 2 créneaux par personne atteinte/ }).first()
        await limited.waitFor()
        await at("les autres créneaux restent visibles")
        await limited.scrollIntoViewIfNeeded()
        const quotaText = await limited.locator("..").innerText()
        await page.screenshot({ path: path.join(dir, "review", "product-quota-frise.png") })
        await writeFile(path.join(dir, "review", "product-quota-frise.json"), JSON.stringify({ url: page.url(), elapsedMs: Math.round(performance.now() - startedAt), visibleBarText: quotaText, accessibleName: await limited.getAttribute("aria-label"), check: "Quota reason checked in the visible label under the bar, with the button accessible name checked separately" }, null, 2))
        if (!/limite/i.test(quotaText)) throw new Error("Product bug: Frise quota reached is only in the accessible name, absent from visible bar text; exact frame/URL in review/product-quota-frise.*")
        await at("Elle peut d’abord retirer un")
        await tap(page, page.getByRole("button", { name: "Liste", exact: true }))
        const listQuota = page.getByRole("button", { name: /Buvette.*Limite de 2 créneaux par personne atteinte/i }).first()
        await listQuota.scrollIntoViewIfNeeded()
        if (!/Limite de 2 créneaux par personne atteinte/i.test(await listQuota.innerText())) throw new Error("Quota explanation missing from actual Liste")
        await page.screenshot({ path: path.join(dir, "review", "product-quota-liste.png") })
      })

      await scene("reserved", async (at) => {
        await clearVolunteerSession()
        const reserved = page.getByRole("button", { name: /Sécurité.*réservé à certains membres/ }).first()
        await reserved.waitFor()
        await reserved.scrollIntoViewIfNeeded()
        await at("Le message ne révèle pas")
        if (!await reserved.isDisabled()) throw new Error("Reserved shift must expose its unavailable state")
        await at(0.62) /* mid-sentence */
        await page.getByText(/Les postes marqués « Réservé » sont réservés à certains membres/).scrollIntoViewIfNeeded()
        await at("Une invitation sans la bonne")
        await page.goto(`${publicPlanning}&token=demo-invite-emma-no-security-0001`); await settleEligibility()
        await page.getByRole("button", { name: /Sécurité.*réservé à certains membres/ }).first().scrollIntoViewIfNeeded()
      })

      await scene("eligible", async (at) => {
        await clearVolunteerSession()
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}&token=demo-invite-julien-security-0001`); await settleEligibility()
        // The quota chapter deliberately switched to Liste; its preference persists.
        await tap(page, page.getByRole("button", { name: "Frise", exact: true }))
        const security = page.getByRole("button", { name: /, Sécurité[^:]* : sélectionner/ }).first()
        await security.waitFor()
        await security.scrollIntoViewIfNeeded()
        await at("le lien prouve quel membre")
        await tap(page, security)
        await at(0.68) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        if (await page.getByLabel("Prénom *", { exact: true }).inputValue() !== "Julien") throw new Error("Invitation must identify Julien, not an earlier volunteer session")
        if (await page.getByLabel("Nom *", { exact: true }).inputValue() !== "Favre") throw new Error("Wrong invitation member shown")
      })

      await scene("result", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}`); await settleEligibility()
        await tap(page, page.getByRole("link", { name: "Paramètres de l'événement", exact: true }))
        await settleEligibility()
        await page.getByLabel("Description", { exact: true }).scrollIntoViewIfNeeded()
        await at("Vérifions aussi le téléphone obligatoire")
        const phone = page.getByRole("checkbox", { name: /Téléphone obligatoire/ })
        await phone.scrollIntoViewIfNeeded()
        if (!(await phone.isChecked())) throw new Error("Phone requirement must be enabled in the demo data")
        await page.getByText(/Les bénévoles devront indiquer un numéro/).scrollIntoViewIfNeeded()
        await at("Pour corriger un profil, retrouvons")
        await page.goto(`${baseUrl}/admin/members`); await settleEligibility()
        await fillVisibly(page, page.getByPlaceholder("Rechercher (nom, email, téléphone)…"), "Julien Favre")
        await tap(page, page.getByRole("button", { name: "Modifier Julien Favre", exact: true }))
        const form = page.getByRole("dialog", { name: "Modifier le membre", exact: true })
        const tags = form.getByLabel("Étiquettes (séparées par des virgules)", { exact: true })
        if (!(await tags.inputValue()).split(",").map(tag => tag.trim()).includes("sécurité")) throw new Error("Julien's actual internal tag is missing")
        await tags.scrollIntoViewIfNeeded()
        await at("Ici, nous vérifions la fiche")
        await tap(page, form.getByRole("button", { name: "Annuler", exact: true }))
      })
    } else if (slug === "volunteer-discover-event") {
      let publicEventUrl = ""
      await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Tout comprendre avant de choisir", duration: 2_300 })
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).waitFor()
      })

      await page.screencast.showChapter("Ouvrir la bonne page", { description: "Lien, QR code ou invitation personnelle", duration: 1_400 })
      await scene("access", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/qr`); await settle(page)
        await page.getByRole("heading", { name: "QR code", exact: true }).waitFor()
        publicEventUrl = (await page.getByAltText(/QR code vers/).getAttribute("alt"))!.replace("QR code vers ", "")
        await at("Le lien direct s’ouvre dans")
        await page.getByAltText(/QR code vers/).scrollIntoViewIfNeeded()
        await at(0.58) /* mid-sentence */
        await page.getByText("Scanner pour s'inscrire").scrollIntoViewIfNeeded()
        await at("Un lien personnel ne se")
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
      })

      await scene("identity", async (at) => {
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).waitFor()
        await at("Le lieu est accompagné d’un")
        const map = page.getByRole("link", { name: /Voir sur la carte/ }).first()
        await map.scrollIntoViewIfNeeded()
        await map.focus()
        await at(0.42) /* mid-sentence */
        await page.getByText(/Présentez-vous au stand d'accueil/).scrollIntoViewIfNeeded()
        await at("Sur ordinateur, la fiche à")
        await page.getByText(/Deux jours de fête sur la place/).scrollIntoViewIfNeeded()
      })

      // Use the configured public host so real relative links retain the tenant context.
      await page.goto(publicEventUrl); await settle(page)
      await page.screencast.showChapter("Les informations pratiques", { description: "Tout retrouver sans fouiller ses messages", duration: 1_400 })
      await scene("pages", async (at) => {
        await tap(page, page.getByRole("link", { name: "Accès et parking" }))
        await settle(page)
        await page.getByRole("heading", { name: "Accès et parking" }).waitFor()
        await at("Accès et parking explique les")
        await page.getByRole("heading", { name: "En transports publics" }).scrollIntoViewIfNeeded()
        await at("Questions fréquentes précise l’assurance et")
        await page.goto(`${publicEventUrl}/faq`); await settle(page)
        await page.getByRole("heading", { name: "Questions fréquentes" }).waitFor()
        await at("Tu peux revenir au planning")
        await page.goto(publicEventUrl); await settle(page)
      })

      await page.screencast.showChapter("Lire le planning", { description: "Journées, postes, capacités et programme", duration: 1_400 })
      await scene("desktop", async (at) => {
        const firstDay = page.getByRole("region", { name: /Planning du/ }).first()
        await firstDay.scrollIntoViewIfNeeded()
        await at(0.22) /* mid-sentence */
        await page.getByText(/Concert de la fanfare/).first().scrollIntoViewIfNeeded()
        await at("Les bandes violettes placent les")
        await page.getByText(/Bal populaire/).first().scrollIntoViewIfNeeded()
        await at(0.80) /* mid-sentence */
        await page.getByText(/Brunch/).first().scrollIntoViewIfNeeded()
      })

      await scene("states", async (at) => {
        const full = page.getByRole("button", { name: /: rejoindre la file d'attente/ }).first()
        await full.scrollIntoViewIfNeeded()
        await full.focus()
        await at("Sur validation signifie que l’organisateur")
        const approval = page.getByRole("button", { name: /sur validation/ }).first()
        await approval.scrollIntoViewIfNeeded()
        await approval.focus()
        await at("Dix-huit plus annonce un âge")
        const adult = page.getByRole("button", { name: /18 ans minimum/ }).first()
        await adult.scrollIntoViewIfNeeded()
        await adult.focus()
        await at("Réservé reste visible mais demande")
        const reserved = page.getByRole("button", { name: /réservé à certains membres/ }).first()
        await reserved.scrollIntoViewIfNeeded()
        await reserved.focus()
      })

      await page.screencast.showChapter("Sur téléphone", { description: "Faire défiler sans perdre les détails", duration: 1_400 })
      await scene("mobile", async (at) => {
        await page.setViewportSize({ width: 390, height: 800 })
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
        const hint = page.getByText(/Fais défiler pour voir toutes les plages/).first()
        await hint.scrollIntoViewIfNeeded()
        await at("Glisse doucement pour parcourir la")
        const timeline = page.getByRole("region", { name: /Planning du/ }).first()
        await timeline.evaluate((element) => { element.scrollLeft = element.scrollWidth * 0.46 })
        await at(0.65) /* mid-sentence: continue the demonstrated horizontal swipe */
        await timeline.evaluate((element) => { element.scrollLeft = element.scrollWidth })
        await at("Tu retrouves les heures, les")
        await page.getByText(/Brunch/).first().scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Une invitation personnelle", { description: "Le bon accès, sans inscription automatique", duration: 1_400 })
      await scene("invitation", async (at) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}&token=demo-invite-julien-security-0001`); await settle(page)
        const security = page.getByRole("button", { name: /, Sécurité[^:]* : sélectionner/ }).first()
        await security.scrollIntoViewIfNeeded()
        await at("Ici, Julien fait partie de")
        await security.focus()
        await at("L’invitation ne t’inscrit pas toute")
        await tap(page, security)
        await page.getByRole("button", { name: /, Sécurité[^:]* : désélectionner/ }).waitFor()
      })

      await scene("result", async (at) => {
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).scrollIntoViewIfNeeded()
        await at(0.28) /* mid-sentence */
        await page.getByRole("link", { name: /Voir sur la carte/ }).first().scrollIntoViewIfNeeded()
        await at("En cas de doute sur")
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
        const accueil = page.getByRole("button", { name: /^15h–18h \d+\/\d+, Accueil : sélectionner/ })
        await accueil.scrollIntoViewIfNeeded()
        await tap(page, accueil)
        await at("Tu peux en ajouter plusieurs")
        const demontage = page.getByRole("button", { name: /^15h–18h \d+\/\d+, Démontage : sélectionner/ })
        await demontage.scrollIntoViewIfNeeded()
        await tap(page, demontage)
        await at("Pour retirer un choix avant")
        await page.getByText("Créneaux sélectionnés").scrollIntoViewIfNeeded()
        await at(0.72) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: "Retirer Démontage de la sélection" }))
      })

      await scene("capacity", async (at) => {
        const available = page.getByRole("button", { name: /^09h–12h \d+\/\d+, Accueil.*1 place libre sur 3/ })
        await available.scrollIntoViewIfNeeded()
        await available.focus()
        await at("Un créneau complet sans liste")
        const full = page.getByRole("button", { name: /Accueil 12h–15h/ })
        await full.scrollIntoViewIfNeeded()
        await full.focus()
        await at(0.68) /* mid-sentence */
      })

      await scene("waitlist", async (at) => {
        const waiting = page.getByRole("button", { name: /^10h–14h \d+\/\d+, Buvette : rejoindre la file d'attente/ })
        await waiting.scrollIntoViewIfNeeded()
        await tap(page, waiting)
        await at(0.40) /* mid-sentence */
        await page.getByText(/Complet · liste d'attente si place libérée/).filter({ visible: true }).first().scrollIntoViewIfNeeded()
        await at("Reclique pour le retirer.")
        await tap(page, page.getByRole("button", { name: "Retirer Buvette de la sélection" }))
      })

      // The earlier Accueil choice overlaps the available afternoon Navette.
      // Clear that demonstration selection before presenting approval as its own state.
      await tap(page, page.getByRole("button", { name: "Retirer Accueil de la sélection", exact: true }))
      await scene("approval-reserved", async (at) => {
        const approval = page.getByRole("button", { name: /, Navette[^:]*sur validation\) : sélectionner/ }).first()
        await approval.scrollIntoViewIfNeeded()
        await approval.focus()
        await at("Sécurité est réservée à certains")
        const reserved = page.getByRole("button", { name: /Sécurité.*réservé à certains membres/ }).first()
        await reserved.scrollIntoViewIfNeeded()
        await reserved.focus()
        await at("Ces deux états ne veulent")
      })

      await page.screencast.showChapter("Éviter les incompatibilités", { description: "Chevauchements et engagements existants", duration: 1_400 })
      await scene("conflict", async (at) => {
        const current = page.getByRole("button", { name: /^15h–18h \d+\/\d+, Accueil : désélectionner/ })
        if (await current.count()) await tap(page, current)
        const afternoon = page.getByRole("button", { name: /^15h–18h \d+\/\d+, Accueil : sélectionner/ })
        await afternoon.scrollIntoViewIfNeeded()
        await tap(page, afternoon)
        await at("Ici, Accueil de quinze à")
        const overlapping = page.getByRole("button", { name: /^14h–18h.*Navette.*chevauche un créneau déjà choisi/ }).first()
        await overlapping.scrollIntoViewIfNeeded()
        await overlapping.focus()
        await at("Retire le premier choix si")
        await tap(page, page.getByRole("button", { name: /^15h–18h \d+\/\d+, Accueil : désélectionner/ }))
      })

      await scene("known", async (at) => {
        await page.goto(`${baseUrl}/my/demo-waitlist-camille-0001`); await settle(page)
        await page.getByRole("heading", { name: /Mes inscriptions/ }).waitFor()
        await at("Ils apparaissent dans son récapitulatif")
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settle(page)
        await page.getByText(/Camille Rochat/).first().waitFor()
        await page.getByText("Créneaux sélectionnés").scrollIntoViewIfNeeded()
      })

      await scene("limit", async (at) => {
        const limited = page.getByRole("button", { name: /Buvette.*limite de 2 créneaux par personne atteinte/ }).first()
        await limited.scrollIntoViewIfNeeded()
        const quotaLabel = await limited.locator("..").innerText()
        if (!/Limite (atteinte|de 2 créneaux par personne atteinte)/.test(quotaLabel)) throw new Error("Public Frise must visibly explain the reached quota")
        await at("les autres plages restent visibles")
        await limited.focus()
        await at("Elle doit d’abord annuler une")
        const cancel = page.getByRole("button", { name: "Annuler le créneau Buvette", exact: true }).first()
        await cancel.scrollIntoViewIfNeeded()
        await cancel.focus()
      })

      await scene("result", async (at) => {
        const extra = page.getByRole("button", { name: /^07h–09h \d+\/\d+, Montage : sélectionner/ })
        await extra.scrollIntoViewIfNeeded()
        await tap(page, extra)
        await page.getByText("Créneaux sélectionnés").scrollIntoViewIfNeeded()
        await at("Tu peux encore tout ajuster")
        const continueButton = page.getByRole("button", { name: /^Continuer/ })
        await continueButton.scrollIntoViewIfNeeded()
        await at(0.64) /* mid-sentence */
        await continueButton.focus()
      })
    } else if (slug === "volunteer-confirmation-errors") {
      await (await import("../lib/record-registration-errors")).recordRegistrationErrors({ page, base: baseUrl, directory: dir, title: manifest.title, scene, tap, settle })
    } else if (slug === "volunteer-form-recap") {
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Les bonnes informations et un engagement réaliste", duration: 2_300 })
      })
      await scene("selection", async (at) => {
        for (const name of [/^09h–12h \d+\/\d+, Accueil : sélectionner/, /, Logistique[^:]* : sélectionner/, /, Rangement[^:]* : sélectionner/, /^10h–14h \d+\/\d+, Buvette : sélectionner/]) {
          const button = page.getByRole("button", { name }).last()
          await tap(page, button)
          await page.waitForTimeout(800)
        }
        await at("Le bouton Continuer ouvre le")
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        await page.getByRole("heading", { name: "Tes informations" }).waitFor()
      })
      await scene("identity", async (at) => {
        await typeNaturally(page, page.getByLabel("Prénom *", { exact: true }), "Alex")
        await typeNaturally(page, page.getByLabel("Nom *", { exact: true }), "Martin")
        await typeNaturally(page, page.getByLabel("Email *", { exact: true }), "alex.martin@example.org")
        await typeNaturally(page, page.getByLabel("Téléphone *", { exact: true }), "079 000 12 34")
        await at("La date de naissance apparaît")
        await fillVisibly(page, page.getByLabel("Date de naissance *"), "1994-06-12")
      })
      await scene("questions", async (at) => {
        await at("La taille de t-shirt est")
        await tap(page, page.getByRole("radio", { name: "M", exact: true }))
        await at(0.24) /* mid-sentence */
        await typeNaturally(page, page.getByLabel(/Régime alimentaire/), "Végétarien")
        await at(0.48) /* mid-sentence */
        await typeNaturally(page, page.getByLabel("Permis de conduire"), "Permis B")
        await at("Le commentaire permet de préciser")
        await typeNaturally(page, page.getByLabel(/Commentaire/), "Je prévois une pause avant la nuit.")
      })
      await scene("agreement", async (at) => {
        await at("Ouvre la Convention des Bénévoles")
        await tap(page, page.getByRole("button", { name: "convention des bénévoles" }))
        await page.getByRole("dialog", { name: "Convention des Bénévoles" }).waitFor()
        await at(0.44) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: "J'ai lu et j'accepte" }))
        await at("Lire puis cocher ces deux")
        await tap(page, page.getByRole("checkbox", { name: /^J'accepte que l'association qui organise cet événement/ }))
      })
      const recap = page.locator(".lg\\:col-start-2").filter({ hasText: "Tes créneaux" }).first()
      await scene("recap", async (at) => {
        await recap.getByText(/lendemain/).scrollIntoViewIfNeeded()
        await at("Les lieux, consignes et liens")
        await recap.getByRole("link", { name: /Voir sur la carte/ }).first().scrollIntoViewIfNeeded()
        await at("En bas, Transmis à l’organisation")
        await recap.getByText("Transmis à l'organisation").scrollIntoViewIfNeeded()
      })
      await scene("workload", async (at) => {
        await recap.getByText("Journée chargée").scrollIntoViewIfNeeded()
        await at("Pour alléger, reviens au planning")
        await tap(page, page.getByRole("button", { name: "Retour", exact: true }))
        await tap(page, page.getByRole("button", { name: /, Logistique[^:]* : désélectionner/ }))
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
      })
      await scene("result", async (at) => {
        await page.getByRole("heading", { name: "Tes informations" }).scrollIntoViewIfNeeded()
        await at("Les informations saisies sont conservées.")
        await page.getByLabel("Email *", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.64) /* mid-sentence */
        await page.getByRole("button", { name: "Confirmer mon inscription" }).scrollIntoViewIfNeeded()
      })
    } else if (slug === "volunteer-personal-registrations") {
      const initial = await page.evaluate(async () => (await fetch("/api/public/registrations/demo-volunteer-camille-0001")).json())
      for (const status of ["active", "waiting", "offered", "requested"]) {
        if (!initial.registrations.some((r: { status: string }) => r.status === status)) throw new Error(`Personal demo missing ${status}`)
      }
      await scene("welcome", async (at) => {
        await page.screencast.showChapter(manifest.title, { description: "Ton planning et tes choix, depuis ton lien personnel", duration: 2_300 })
        await page.getByRole("heading", { name: "Mes inscriptions" }).waitFor()
        await at("Ici, Camille a une place")
        await page.getByText(/Créneau sur validation/).scrollIntoViewIfNeeded()
      })
      await scene("practical", async (at) => {
        await page.getByText("Arrive 15 minutes avant, au stand bleu.", { exact: true }).scrollIntoViewIfNeeded()
        await at("Le lien carte aide à")
        await page.getByRole("link", { name: /Voir sur la carte/ }).first().scrollIntoViewIfNeeded()
        await at(0.65) /* mid-sentence */
        await page.getByText(/Manon Aebi/).first().scrollIntoViewIfNeeded()
      })
      await scene("states", async (at) => {
        await page.getByRole("button", { name: "Quitter la liste d'attente du créneau Buvette", exact: true }).scrollIntoViewIfNeeded()
        await at("Une place proposée affiche une")
        await page.getByRole("link", { name: "Prendre la place : Buvette", exact: true }).scrollIntoViewIfNeeded()
        await at("Une demande sur validation attend")
        await page.getByText(/Créneau sur validation/).scrollIntoViewIfNeeded()
      })
      await scene("cancel", async (at) => {
        const button = page.getByRole("button", { name: "Annuler le créneau Accueil", exact: true })
        await tap(page, button)
        await at("Tu peux encore choisir Non,")
        await tap(page, page.getByRole("alertdialog").getByRole("button", { name: "Non, garder", exact: true }))
        await page.getByRole("alertdialog").waitFor({ state: "hidden" })
        await at("Reprenons et confirmons cette fois.")
        await tap(page, button)
        await tap(page, page.getByRole("alertdialog").getByRole("button", { name: "Oui, annuler", exact: true }))
        await button.waitFor({ state: "hidden" })
      })
      const withdraw = async (at: Cue, buttonName: string, confirmName: string, beforeConfirm?: () => Promise<void>) => {
        const button = page.getByRole("button", { name: buttonName, exact: true })
        await tap(page, button)
        if (beforeConfirm) await beforeConfirm()
        else await at(0.50) /* shared helper: scene-independent */
        await tap(page, page.getByRole("alertdialog").getByRole("button", { name: confirmName, exact: true }))
        await button.waitFor({ state: "hidden" })
      }
      await scene("waiting", async at => withdraw(at, "Quitter la liste d'attente du créneau Buvette", "Oui, quitter", async () => {
        await at("Confirme uniquement si c'est ce")
      }))
      await scene("offer", async at => withdraw(at, "Refuser la place proposée sur le créneau Buvette", "Oui, refuser", async () => { await at("Après confirmation, cette offre disparaît.") }))
      await scene("request", async at => {
        await at("Retirer ma demande ouvre sa")
        await withdraw(at, "Retirer ma demande pour le créneau Navette du dimanche", "Oui, retirer", async () => { await at("En confirmant, tu retires cette") })
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
        await tap(page, page.getByRole("link", { name: "S'inscrire à d'autres créneaux", exact: true }))
        await settle(page)
        await page.getByRole("heading", { name: "Fête du village de Montvert", exact: true }).waitFor()
        await at("Retirer une inscription ne supprime")
        await page.getByRole("button", { name: /: sélectionner/ }).first().scrollIntoViewIfNeeded()
      })
    } else if (slug === "volunteer-calendar") {
      const personalUrl = `${baseUrl}/my/demo-volunteer-camille-0001`
      const initialCalendar = await page.evaluate(async () => (await fetch("/api/public/registrations/demo-volunteer-camille-0001")).json())
      const nightDate = initialCalendar.registrations.find((r: { shift: { label: string } }) => r.shift.label === "Rangement de nuit — calendrier")?.shift.date.slice(0, 10)
      if (!nightDate) throw new Error("Calendar fixture is missing its overnight shift")
      const nextDate = new Date(Date.parse(`${nightDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
      const { localDateTimeToUtc } = await import("../../src/lib/time-zone")
      // The fixture can cross Zurich's autumn clock change; never assume UTC+2.
      const icsInstant = (date: string, time: string) => localDateTimeToUtc(new Date(`${date}T00:00:00Z`), time, initialCalendar.timeZone ?? "Europe/Zurich").toISOString().replace(/[-:]/g, "").replace(".000", "")
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
      const allLink = () => page.getByRole("link", { name: /^Télécharger tout mon planning/ })
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
        await at("Ce téléchargement ne crée pas")
        await page.getByText(/Un fichier à importer une fois/).scrollIntoViewIfNeeded()
      })
      await scene("all", async at => {
        oldPlanning = await download(allLink(), "planning-original.ics")
        if (events(oldPlanning).length !== 3) throw new Error("Calendar export must contain exactly three confirmed registrations")
        if (!oldPlanning.includes("Rangement de nuit") || !oldPlanning.includes("Accueil")) throw new Error("Calendar export is missing a confirmed shift")
        await at("L'inscription en liste d'attente n'y")
        await page.getByRole("button", { name: "Quitter la liste d'attente du créneau Buvette", exact: true }).scrollIntoViewIfNeeded()
      })
      await scene("import", async at => {
        // User requested no native Calendar access. Explain import over the real download
        // control and its hint; do not fabricate or claim a calendar-client result.
        await allLink().scrollIntoViewIfNeeded()
        await at(0.48) /* mid-sentence */
        await page.getByText(/Un fichier à importer une fois/).scrollIntoViewIfNeeded()
      })
      await scene("details", async at => {
        for (const expected of ["Arrive 15 minutes avant", "Manon Aebi", "/my/", "GEO:"]) {
          if (!oldPlanning.includes(expected)) throw new Error(`Calendar download missing ${expected}`)
        }
        await page.getByText("Arrive 15 minutes avant, au stand bleu.", { exact: true }).scrollIntoViewIfNeeded()
        await at("le lieu, les consignes et")
        await page.locator("#avant-ta-mission").getByText(/Manon Aebi,/).scrollIntoViewIfNeeded()
        await at("Garde ce fichier pour toi")
        await page.getByRole("heading", { name: "Ton lien personnel", exact: true }).scrollIntoViewIfNeeded()
      })
      await scene("night", async () => {
        await page.getByText("Rangement de nuit — calendrier", { exact: true }).scrollIntoViewIfNeeded()
        const night = events(oldPlanning).find(event => event.includes("Rangement de nuit"))
        if (!night?.includes(`DTSTART:${icsInstant(nightDate, "22:00")}`) || !night.includes(`DTEND:${icsInstant(nextDate, "02:00")}`)) throw new Error("Overnight calendar dates or Zurich conversion incorrect")
      })
      await scene("change", async at => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settle(page)
        await tap(page, page.getByRole("button", { name: "Liste", exact: true }))
        const row = page.getByRole("row").filter({ hasText: "Rangement de nuit — calendrier" })
        await tap(page, row.getByRole("button", { name: /^Modifier le créneau/ }))
        await fillVisibly(page, page.getByLabel(/^Début(?:\s|$)/), "23:00")
        await at("il ne se met pas")
        await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true }))
        await page.getByRole("heading", { name: "Modifier le créneau", exact: true }).waitFor({ state: "hidden" })
        if ((await readFile(path.join(folder, "planning-original.ics"), "utf8")).replace(/\r\n[ \t]/g, "") !== oldPlanning) throw new Error("Previously downloaded calendar changed unexpectedly")
        await at(0.75) /* mid-sentence */
        await page.goto(personalUrl); await settle(page)
        await page.getByText("Rangement de nuit — calendrier", { exact: true }).scrollIntoViewIfNeeded()
      })
      await scene("reimport", async at => {
        newPlanning = await download(allLink(), "planning-modifie.ics")
        const uids = (ics: string) => [...ics.matchAll(/^UID:(.+)$/gm)].map(match => match[1].trim()).sort()
        if (JSON.stringify(uids(oldPlanning)) !== JSON.stringify(uids(newPlanning))) throw new Error("Calendar registration identifiers changed")
        const night = events(newPlanning).find(event => event.includes("Rangement de nuit"))
        if (!night?.includes(`DTSTART:${icsInstant(nightDate, "23:00")}`)) throw new Error("Updated calendar does not contain 23:00 Zurich start")
        if (!night.includes(`DTEND:${icsInstant(nextDate, "02:00")}`)) throw new Error("PRODUCT BUG: shifting overnight start also changed its 02:00 end; refuse a misleading calendar take")
        await at(0.52) /* mid-sentence */
        await page.getByText(/Un fichier à importer une fois/).scrollIntoViewIfNeeded()
      })
      await scene("result", async at => {
        await page.getByRole("heading", { name: "Mes inscriptions", exact: true }).scrollIntoViewIfNeeded()
        await at(0.50) /* mid-sentence */
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
      const { recordDayOf } = await import("../lib/record-day-of")
      const { verifyDayOfReviewFixture } = await import("../lib/verify-dayof-review-fixture")
      const { PrismaClient } = await import("../../src/generated/prisma/client")
      const { PrismaPg } = await import("@prisma/adapter-pg")
      if (baseUrl !== "http://localhost:43108") throw new Error("Attendance requires its independent Jour J server")
      const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
      try {
        await verifyDayOfReviewFixture(db)
        await recordAttendance({ page, base: baseUrl, eventId: featureEventId, directory: dir, title: manifest.title, personPrefix: "video-dayof-attendance-person-", scene, tap, settle })
        await recordDayOf({ page, base: baseUrl, productCommit: product.commit, scene, tap, settle, typeNaturally,
          fixture: { eventId: "video-dayof-event-live", registrationId: "video-dayof-registration-zoe", volunteerName: fullNameOf("Zoé"), volunteerEmail: "video.attendance.7@example.org", phone: "079 000 00 01", runningShiftId: "video-dayof-shift-running", upcomingShiftId: "video-dayof-shift-upcoming", earlierShiftId: "video-dayof-shift-earlier", nightShiftId: "video-dayof-shift-night", roleSearch: "Accueil", accentSearch: "zoe", expectedAccentName: fullNameOf("Zoé") },
          verifyFixture: async () => {
            await verifyDayOfReviewFixture(db)
            const r = await db.registration.findUniqueOrThrow({ where: { id: "video-dayof-registration-zoe" }, include: { volunteer: true } })
            const prep = JSON.parse(await readFile(path.join(dir, "dayof-preparation.json"), "utf8"))
            const age = Date.now() - Date.parse(prep.preparedAt)
            return { eventId: r.eventId, registrationId: r.id, email: r.volunteer.email!, status: r.status, checkedInAt: r.checkedInAt?.toISOString() ?? null, syntheticOnly: true, timeCasesPreparedForActualServerNow: age >= 0 && age < 45 * 60_000 }
          },
          evidence: async (chapter, observed) => { await writeFile(path.join(dir, `${chapter}-observations.json`), JSON.stringify({ observedAt: new Date().toISOString(), chapter, productCommit: product.commit, observed, finalValidation: false }, null, 2)) },
        })
      } finally { await db.$disconnect() }
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
      const writeField = async (field: Locator, value: string, delay = 95) => {
        await tap(page, field)
        await field.press("ControlOrMeta+A")
        await field.pressSequentially(value, { delay })
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
            await at(["Commencez par le public", "Pour un poste, choisissez", "pour un créneau, précisez", "La liste d'attente vise les personnes", "Enfin, les invités sans créneau confirmé"][index]); await tap(page, page.getByRole("radio", { name: label, exact: true }))
            if (index === 1) await page.getByLabel(/^Poste(?: \*)?$/).selectOption("Buvette")
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
          await at("Une demande à valider n'est"); await page.goto(url); await settle(page)
          await tap(page, page.getByRole("radio", { name: "Les bénévoles d'un poste", exact: true })); await page.getByLabel(/^Poste(?: \*)?$/).selectOption("Buvette"); await settle(page)
          checks.multipleRegistrationsOneRecipient = true
        })
        await scene("template-create", async at => {
          await page.goto(templatesUrl); await settle(page)
          if (await db.messageTemplate.count({ where: { organizationId: "default", name: modelName } })) throw new Error("Model already exists; reset scenario")
          await tap(page, page.getByRole("button", { name: "Nouveau modèle", exact: true }))
          await at("Prenons Briefing avant le créneau")
          await writeField(page.getByLabel(/^Nom du modèle(?: \*)?$/), modelName)
          await at("L'objet annonce le sujet de l'email")
          await writeField(page.getByLabel(/^Objet(?: \*)?$/), subject)
          await at("Dans le message, une salutation")
          await writeField(page.getByLabel(/^Message(?: \*)?$/), body, 45)
          await at("Enregistrons."); await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true })); await page.getByText(modelName, { exact: true }).waitFor()
        })
        await scene("variables", async at => {
          await tap(page, page.getByRole("button", { name: `Modifier le modèle « ${modelName} »`, exact: true }))
          await page.getByLabel(/^Objet(?: \*)?$/).scrollIntoViewIfNeeded()
          await at("Créneau demande un horaire précis."); await writeField(page.getByLabel(/^Objet(?: \*)?$/), "Ton briefing pour {lieu}")
          await page.getByText(/Variable inconnue : \{lieu\}/).waitFor()
          await at("Corrigeons le texte."); await writeField(page.getByLabel(/^Objet(?: \*)?$/), subject)
          await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true }))
          checks.unknownVariableVisible = true
        })
        await scene("apply", async at => {
          await page.goto(url); await settle(page)
          await writeField(page.getByLabel(/^Objet(?: \*)?$/), "Merci pour ton aide")
          await writeField(page.getByLabel(/^Message(?: \*)?$/), "On se retrouve au stand d'accueil.")
          await page.getByLabel("Partir d'un modèle", { exact: true }).selectOption({ label: modelName })
          if (await page.getByLabel(/^Objet(?: \*)?$/).inputValue() !== "Merci pour ton aide") throw new Error("Selection replaced text prematurely")
          await at("L'objet et le texte changent"); await tap(page, page.getByRole("button", { name: "Utiliser ce modèle", exact: true }))
          await at("Si ce n'est pas ce")
          await at(0.60) /* mid-sentence: wait until « Rétablir le texte précédent » is actually named */
          await tap(page, page.getByRole("button", { name: "Rétablir le texte précédent", exact: true }))
          if (await page.getByLabel(/^Objet(?: \*)?$/).inputValue() !== "Merci pour ton aide") throw new Error("Text restore failed")
          await at("Appliquons de nouveau notre briefing"); await tap(page, page.getByRole("button", { name: "Utiliser ce modèle", exact: true })); await chooseShift()
          checks.modelApplyAndRestore = true
        })
        await scene("context", async at => {
          await at("Si nous choisissons ce public")
          await tap(page, page.getByRole("radio", { name: "Tous les bénévoles inscrits", exact: true }))
          await page.getByText("{créneau} ne s'utilise qu'avec les destinataires « Les bénévoles d'un créneau ».", { exact: true }).evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }))
          if (await page.getByLabel(/^Message(?: \*)?$/).getAttribute("aria-invalid") !== "true") throw new Error("Context error not exposed")
          await at("Revenons à un seul créneau."); await chooseShift()
          if (await page.getByLabel(/^Message(?: \*)?$/).getAttribute("aria-invalid") === "true") throw new Error("Context error not cleared")
          checks.contextVariableErrorVisible = true
        })
        await scene("preview", async at => {
          const now = page.getByRole("radio", { name: "Maintenant", exact: true })
          await now.scrollIntoViewIfNeeded()
          if (!(await now.isChecked())) throw new Error("Briefing must be sent immediately")
          await page.getByRole("radio", { name: "Programmer l'envoi", exact: true }).waitFor()
          await at("Ouvrons maintenant l'aperçu.")
          await preview()
          const text = await page.frameLocator('iframe[title="Contenu de l\'email"]').locator("body").innerText()
          const previewRecipient = recipients.find(recipient => text.includes(`Bonjour ${recipient.volunteer.firstName},`))
          if (text.includes("{prénom}") || !previewRecipient || !text.includes(shift.startTime) || !text.includes(shift.endTime)) throw new Error("Preview variables not rendered for an actual selected recipient")
          checks.previewRecipientId = previewRecipient.volunteerId
          await at("Si une phrase manque de"); await tap(page, page.getByRole("button", { name: "Retour au message", exact: true }))
          const message = page.getByLabel(/^Message(?: \*)?$/)
          await tap(page, message); await message.press("ControlOrMeta+A"); await message.press("ArrowRight")
          await message.pressSequentially("\nPrends aussi une gourde.", { delay: 95 })
          if (await message.inputValue() !== body + "\nPrends aussi une gourde.") throw new Error("Preview correction wasn't appended as intended")
          checks.personalizedPreviewVisible = true
        })
        await scene("push", async at => {
          const checkbox = page.getByRole("checkbox", { name: "Envoyer aussi une notification (téléphone ou ordinateur)", exact: true })
          await checkbox.scrollIntoViewIfNeeded(); await at("Vous pouvez aussi demander une notification"); await tap(page, checkbox)
          await at("Le nombre d'appareils n'est donc"); await tap(page, checkbox)
          checks.pushOptionExplainedNotReceipt = true
        })
        await scene("confirm", async at => {
          await preview(); await at("Relisez le public et le"); await confirm()
          await at("aucun message n'est parti."); await tap(page, page.getByRole("dialog").getByRole("button", { name: "Annuler", exact: true }))
          if (await db.targetedMessage.count({ where: { eventId: featureEventId } }) !== historyBefore || await db.notificationOutbox.count({ where: { organizationId: "default" } }) !== outboxBefore) throw new Error("Cancelled send created notification")
          checks.cancelCreatedNoSend = true
          await at("Reprenons ensuite le parcours et"); await preview(); await confirm()
          await at(0.7) /* mid-sentence */
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
            await at("Dans notre boîte de test, ouvrons les emails")
            const mail = mails.find(m => m.To.some(t => t.Address === recipient.volunteer.email)); if (!mail) throw new Error("Recipient mail missing")
            await openRegistrationTakeMailbox(page, dir, mail.ID, 'subject:"Ton briefing pour Buvette" "Fête du village de Montvert"')
            const text = await page.frameLocator("iframe").locator("body").innerText()
            if (!text.includes(recipient.volunteer.firstName) || !text.includes("Prends aussi une gourde")) throw new Error("Actual personalized mail missing content")
          }
          await at("La section Messages programmés est séparée"); await page.goto(url); await settle(page)
          await page.getByRole("heading", { name: "Messages programmés", exact: true }).scrollIntoViewIfNeeded()
          await at("L'historique conserve ensuite le message et son audience"); await page.getByRole("heading", { name: "Messages envoyés", exact: true }).scrollIntoViewIfNeeded()
          checks.realEmailsPersonalizedAndDeduplicated = true
        })
        await scene("maintain", async at => {
          await page.goto(templatesUrl); await settle(page)
          await tap(page, page.getByRole("button", { name: `Modifier le modèle « ${modelName} »`, exact: true }))
          await writeField(page.getByLabel(/^Nom du modèle(?: \*)?$/), modelName + " — équipe")
          await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true }))
          await at("La suppression demande une confirmation"); await tap(page, page.getByRole("button", { name: `Supprimer le modèle « ${modelName} — équipe »`, exact: true }))
          await at("Vous pouvez encore annuler."); await tap(page, page.getByRole("alertdialog").getByRole("button", { name: "Annuler", exact: true }))
          await at("Un modèle n'est pas l'historique d'un message déjà envoyé."); await tap(page, page.getByRole("button", { name: `Supprimer le modèle « ${modelName} — équipe »`, exact: true }))
          await tap(page, page.getByRole("alertdialog").getByRole("button", { name: "Supprimer", exact: true }))
          if (await db.targetedMessage.count({ where: { eventId: featureEventId } }) !== historyBefore + 1) throw new Error("Deleting model changed campaign history")
          await at("Des consignes simples et un"); await page.goto(url); await settle(page); await page.getByRole("heading", { name: "Messages envoyés", exact: true }).scrollIntoViewIfNeeded()
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
        return staffingSummary(shifts.map(s => ({ id: s.id, roleName: s.roleName, label: s.label, date: s.date.toISOString().slice(0, 10), startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, active: s.registrations.filter(r => r.status === "active").length, waiting: s.registrations.filter(r => r.status === "waiting" || r.status === "offered").length, requested: s.registrations.filter(r => r.status === "requested").length, closed: s.status === "closed" })), leaders.flatMap(l => (l.roleName ? [l.roleName] : [])))
      }
      const initial = await readSummary()
      const checks: Record<string, unknown> = { initialTotals: initial.totals }
      const section = (id: string) => page.locator(`section[aria-labelledby="${id}"]`)
      const returnToReport = async () => { await page.goto(staffingUrl); await settle(page) }
      try {
        await scene("welcome", async at => {
          await page.screencast.showChapter(manifest.title, { description: "Concentrer son énergie sur les bons horaires", duration: 2300 })
          await page.getByRole("heading", { name: "Où manque-t-il du monde ?", exact: true }).scrollIntoViewIfNeeded()
          await at("Cette vue regroupe les besoins")
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
          await at("Cliquez sur le poste pour")
          await tap(page, section("staffing-empty").getByRole("link", { name: /^Photos/ }))
          await settle(page)
          await tap(page, page.getByRole("button", { name: "Liste", exact: true }))
          await page.getByText("Photos — reportage bénévole", { exact: true }).first().scrollIntoViewIfNeeded()
          await at("quelqu'un doit comprendre ce qu'il"); await returnToReport()
        })
        await scene("needs", async at => {
          await section("staffing-underfilled").scrollIntoViewIfNeeded()
          const closed = await db.shift.findFirstOrThrow({ where: { eventId: featureEventId, roleName: "Accueil", startTime: "15:00" } })
          if (initial.underfilled.some(s => s.id === closed.id)) throw new Error("Closed shift counted as recruitment need")
          checks.closedShiftExcludedFromMissing = true
          await at("Cliquons sur la buvette du soir")
          await tap(page, section("staffing-underfilled").getByRole("link", { name: /^Buvette.*18:00.*22:00/ }))
          await settle(page)
          await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2)
          if (await page.locator("tbody tr").count() !== 2) throw new Error("Shift link didn't filter actual evening registrations")
          await at("Le lien Écrire à ce"); await tap(page, page.getByRole("link", { name: "Écrire à ce créneau", exact: true }))
          await settle(page)
          if (!await page.getByRole("radio", { name: "Les bénévoles d'un créneau", exact: true }).isChecked()) throw new Error("Message audience wasn't prefilled by shift")
          checks.messageAudiencePrefilled = true
          // Keep the message visible through the complete explanation.
        })
        await returnToReport()
        await scene("requests", async at => {
          await section("staffing-full").getByRole("link", { name: /Navette.*08:00.*12:00/ }).scrollIntoViewIfNeeded()
          const held = initial.full.find(s => s.roleName === "Navette" && s.startTime === "08:00")
          if (!held || held.active !== 0 || held.requested !== 2 || held.missing !== 0) throw new Error("Requests didn't hold exactly two places")
          checks.requestsHoldPlacesWithoutConfirmations = true
          await at("Suivez le lien des demandes")
          await section("staffing-overview").scrollIntoViewIfNeeded()
          await tap(page, section("staffing-overview").getByRole("link", { name: "2 demandes à traiter", exact: true }))
          await settle(page)
          if (await page.locator("tbody tr").count() !== 2) throw new Error("Requests link didn't filter list")
          await page.getByRole("row").filter({ hasText: "Lucas Girard" }).waitFor()
          await page.getByRole("row").filter({ hasText: "Marc Duc" }).waitFor()
          await at("La confirmation et la demande"); await returnToReport()
        })
        await scene("waiting", async at => {
          await section("staffing-waitlist").scrollIntoViewIfNeeded()
          await section("staffing-waitlist").getByText("3 personnes en attente", { exact: false }).waitFor()
          await at("En cliquant, vous retrouvez les")
          await tap(page, section("staffing-waitlist").getByRole("link", { name: /Buvette.*14:00.*18:00/ }))
          await settle(page)
          await page.getByRole("row").filter({ hasText: "Camille Rochat" }).getByText("position 1", { exact: true }).waitFor()
          await page.getByRole("row").filter({ hasText: "Anna Bühler" }).getByText("position 2", { exact: true }).waitFor()
          await page.getByRole("row").filter({ hasText: "Eva Clerc" }).getByText("position 3", { exact: true }).waitFor()
          checks.realWaitingPositions = [1, 2, 3]
          await at("ce rapport ne les inscrit"); await returnToReport()
        })
        await scene("leaders", async at => {
          await section("staffing-leaders").scrollIntoViewIfNeeded()
          await at("Le lien ouvre la gestion")
          await tap(page, section("staffing-leaders").getByRole("link", { name: /^Photos/ }))
          await settle(page)
          await page.getByText("Élodie Rochat", { exact: true }).last().waitFor()
          await page.getByText("Manon Aebi", { exact: true }).waitFor()
          checks.existingLeadersVisible = true
          await at(0.82) /* mid-sentence */; await returnToReport()
        })
        await scene("full", async () => {
          await section("staffing-full").scrollIntoViewIfNeeded()
          await section("staffing-full").getByRole("link", { name: /Accueil.*12:00.*15:00/ }).waitFor()
          await section("staffing-full").getByRole("link", { name: /Navette.*08:00.*12:00/ }).waitFor()
        })
        await scene("action", async at => {
          await section("staffing-underfilled").scrollIntoViewIfNeeded()
          await at("Nous ouvrons le créneau concerné")
          await tap(page, section("staffing-underfilled").getByRole("link", { name: /^Photos.*sam\..*10:00.*12:00/ }))
          await settle(page)
          await tap(page, page.getByRole("button", { name: "+ Ajouter manuellement", exact: true }))
          await at("Son email retrouve sa fiche")
          await fillVisibly(page, page.getByRole("searchbox", { name: "Membre existant", exact: true }), "julien.favre@example.org")
          await tap(page, page.getByRole("button", { name: "Chercher", exact: true }))
          await tap(page, page.getByRole("button", { name: "Choisir Julien Favre", exact: true }))
          await at("nous choisissons le bon horaire et enregistrons")
          await tap(page, page.getByRole("combobox", { name: "Créneau", exact: true }))
          await tap(page, page.getByRole("option", { name: /^sam\..*10h–12h, Photos/ }))
          await at("nous choisissons le bon horaire et enregistrons")
          const response = page.waitForResponse(r => r.url().endsWith("/api/admin/registrations") && r.request().method() === "POST")
          await tap(page, page.getByRole("button", { name: "Ajouter", exact: true }))
          const result = await response
          if (result.status() !== 201) throw new Error("Actual photo assignment failed")
          await at("La nouvelle inscription apparaît")
          await page.getByRole("row").filter({ hasText: "Julien Favre" }).scrollIntoViewIfNeeded()
          await at("En revenant au rapport, le"); await returnToReport()
          const after = await readSummary()
          if (after.totals.missing !== initial.totals.missing - 1 || after.totals.active !== initial.totals.active + 1 || after.emptyRoles.some(r => r.roleName === "Photos")) throw new Error("Report didn't reflect actual assignment")
          checks.finalTotals = after.totals
          checks.photoRoleNoLongerEntirelyEmpty = true
          await section("staffing-overview").scrollIntoViewIfNeeded()
        })
        await writeFile(path.join(dir, "staffing-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...checks }, null, 2))
      } finally { await db.$disconnect() }
    } else if (slug === "registrations-place-member") {
      if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Placement requires isolated video database")
      const { PrismaClient } = await import("../../src/generated/prisma/client")
      const { PrismaPg } = await import("@prisma/adapter-pg")
      const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
      const member = await db.volunteer.findFirstOrThrow({ where: { organizationId: "default", email: "sarah.jaquet@example.org" } })
      const shiftIds = (await db.shift.findMany({ where: { eventId: featureEventId, OR: [{ roleName: "Accueil", startTime: "15:00" }, { roleName: "Démontage", startTime: "15:00" }] } })).map(s => s.id)
      const choose = async (name: string, option: RegExp) => {
        await tap(page, page.getByRole("combobox", { name, exact: true }))
        await tap(page, page.getByRole("option", { name: option }))
      }
      let outboxId = ""
      let beforeMail = new Set<string>()
      const inbox = async () => {
        const r = await page.request.get("http://localhost:48026/api/v1/messages")
        if (!r.ok()) throw new Error("Demo mailbox unavailable")
        return await r.json() as { messages: { ID: string; To: { Address: string }[]; Subject: string }[] }
      }
      try {
        await scene("welcome", async at => {
          await page.screencast.showChapter(manifest.title, { description: "Un membre, deux horaires, une confirmation", duration: 2000 })
          await at("Ouvrons Inscriptions, puis Ajouter manuellement")
          await tap(page, page.getByRole("button", { name: "+ Ajouter manuellement", exact: true }))
          await page.getByRole("searchbox", { name: "Membre existant", exact: true }).waitFor()
        })
        await scene("member", async at => {
          await at("Cherchons Sarah par son nom")
          await fillVisibly(page, page.getByRole("searchbox", { name: "Membre existant", exact: true }), "Sarah")
          await tap(page, page.getByRole("button", { name: "Chercher", exact: true }))
          await page.getByRole("list", { name: "Membres trouvés" }).getByText("sarah.jaquet@example.org", { exact: false }).waitFor()
          await at("Cliquez sur Choisir")
          await tap(page, page.getByRole("button", { name: "Choisir Sarah Jaquet", exact: true }))
          await page.getByRole("group", { name: "Membre choisi", exact: true }).waitFor()
        })
        await scene("shifts", async at => {
          await at("Choisissons un premier créneau")
          await choose("Créneau", /15h–18h, Accueil/)
          await at("Cliquez ensuite sur Ajouter un autre créneau")
          await tap(page, page.getByRole("button", { name: "+ Ajouter un autre créneau", exact: true }))
          await page.getByRole("combobox", { name: "Créneau 2 (facultatif)", exact: true }).waitFor()
          await at("Choisissons le démontage du lendemain")
          await choose("Créneau 2 (facultatif)", /15h–18h, Démontage/)
        })
        await scene("add", async at => {
          await at("Avant de valider, lisez la phrase sous la note")
          await page.locator("#add-notice").scrollIntoViewIfNeeded()
          const notice = await page.locator("#add-notice").innerText()
          if (!notice.includes("sarah.jaquet@example.org") || !notice.includes("une dizaine de minutes")) throw new Error("Missing genuine confirmation notice")
          beforeMail = new Set((await inbox()).messages.map(m => m.ID))
          await at("Cliquez sur Ajouter")
          const response = page.waitForResponse(r => r.url().endsWith("/api/admin/registrations") && r.request().method() === "POST")
          await tap(page, page.getByRole("button", { name: "Ajouter", exact: true }))
          if ((await response).status() !== 201) throw new Error("Multi-shift addition failed")
          await page.getByRole("status").filter({ hasText: "Inscriptions de Sarah Jaquet ajoutées sur 2 créneaux" }).waitFor()
          const regs = await db.registration.findMany({ where: { eventId: featureEventId, volunteerId: member.id, shiftId: { in: shiftIds }, status: "active" } })
          if (regs.length !== 2) throw new Error("Both shifts were not linked to the existing member")
          const pending = await db.notificationOutbox.findMany({ where: { status: "pending", attempts: 0, dedupeKey: { startsWith: `registration_added_by_organizer:${featureEventId}:${member.id}:` } } })
          if (pending.length !== 1) throw new Error("Expected one grouped pending email")
          outboxId = pending[0].id
          await page.getByRole("row").filter({ hasText: "Sarah Jaquet" }).filter({ hasText: "Démontage" }).waitFor()
          await writeFile(path.join(dir, "placement-checks.json"), JSON.stringify({ linkedExistingMember: true, addedShifts: regs.length, pendingGroupedEmails: pending.length, notice }, null, 2))
        })
        await scene("email", async at => {
          await at("Dix minutes plus tard, ouvrons la boîte de démonstration")
          if (!process.env.CRON_SECRET) throw new Error("Real cron authentication required")
          await db.notificationOutbox.update({ where: { id: outboxId }, data: { nextAttemptAt: new Date(Date.now() - 1000) } })
          const cron = await page.request.post(`${baseUrl}/api/cron/outbox`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
          if (!cron.ok()) throw new Error(`Real outbox cron failed: ${cron.status()}`)
          let mail: { ID: string } | undefined
          for (let i = 0; i < 20; i++) {
            mail = (await inbox()).messages.find(m => !beforeMail.has(m.ID) && m.To.some(t => t.Address === member.email) && m.Subject.includes("inscrit"))
            if (mail) break
            await page.waitForTimeout(250)
          }
          if (!mail) throw new Error("Actual organizer confirmation not received")
          const detail = await (await page.request.get(`http://localhost:48026/api/v1/message/${mail.ID}`)).json() as { HTML: string; Text: string }
          const content = `${detail.HTML} ${detail.Text}`
          if (!content.includes("Accueil") || !content.includes("Démontage") || !content.includes("benevol.app/my/")) throw new Error("Real email does not list both shifts and personal link")
          await openRegistrationTakeMailbox(page, dir, mail.ID)
          await writeFile(path.join(dir, "placement-mail-proof.json"), JSON.stringify({ realCron: true, actualMail: true, twoShifts: true, personalLink: true, outboxStatus: (await db.notificationOutbox.findUniqueOrThrow({ where: { id: outboxId } })).status }, null, 2))
        })
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
      const row = (name: string, role: string, hours: string) => page.getByRole("row").filter({ hasText: name }).filter({ hasText: role }).filter({ hasText: new RegExp(hours.replace("–", ".*")) })
      const chooseShift = async (name: "Créneau *" | "Filtrer par créneau", option: RegExp) => {
        await tap(page, page.getByRole("combobox", { name: name === "Créneau *" ? "Créneau" : name, exact: true }))
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
        await openRegistrationTakeMailbox(page, dir, match.ID)
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
          await at("Notre fête contient quatre-vingts lignes")
          await page.getByRole("row").nth(6).scrollIntoViewIfNeeded()
          await at(0.73) /* mid-sentence */; await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }))
        })
        await scene("columns", async at => {
          await fillVisibly(page, search(), "Camille")
          await page.getByText("Taille de t-shirt :", { exact: true }).first().waitFor()
          await at("Une note, comme inscrit par"); await fillVisibly(page, search(), "Inès")
          await page.getByText('"Inscrite par téléphone"', { exact: true }).waitFor()
          await at("elle participe à plusieurs créneaux."); await fillVisibly(page, search(), "Camille")
        })
        await scene("filters", async at => {
          await fillVisibly(page, search(), "Léon")
          await at("Nous choisissons Accueil, et seulement")
          await page.getByRole("combobox", { name: "Filtrer par poste", exact: true }).selectOption({ label: "Accueil" })
          await at("la liste se réduit aux"); await chooseShift("Filtrer par créneau", /15h–18h, Accueil/)
          await page.getByRole("link", { name: "Écrire à ce créneau", exact: true }).waitFor()
          checks.filteredAfternoonRows = await page.locator("tbody tr").count()
          await at("Pour retrouver toute la liste"); await page.getByRole("combobox", { name: "Filtrer par poste", exact: true }).selectOption("")
          await chooseShift("Filtrer par créneau", /^Tous les créneaux$/)
          await fillVisibly(page, search(), "")
          if (await page.locator("tbody tr").count() !== 80) throw new Error("Filters did not restore full list")
        })
        await scene("requests", async at => {
          await tap(page, page.getByRole("checkbox", { name: /^Demandes à traiter/ }))
          await fillVisibly(page, search(), "Lucas")
          await page.getByText("Permis B depuis 2021", { exact: false }).waitFor()
          await at("ses réponses peuvent aider à")
          await tap(page, page.getByRole("button", { name: /^Accepter la demande de Lucas/ }))
          const decision = page.getByRole("dialog")
          await decision.waitFor()
          await at("Ici, nous annulons "); await tap(page, decision.getByRole("button", { name: "Annuler", exact: true }))
          const current = await db.registration.findFirstOrThrow({ where: { eventId: featureEventId, volunteer: { email: "lucas.girard@example.org" } } })
          if (current.status !== "requested") throw new Error("Cancelling decision changed request")
          checks.requestDecisionCancelled = true
          await tap(page, page.getByRole("checkbox", { name: /^Demandes à traiter/ }))
          await fillVisibly(page, search(), "")
        })
        await scene("manual-identity", async at => {
          await at("Cliquez sur Ajouter manuellement")
          await tap(page, page.getByRole("button", { name: "+ Ajouter manuellement", exact: true }))
          await at("Dans Membre existant, cherchez Camille")
          await fillVisibly(page, page.getByRole("searchbox", { name: "Membre existant", exact: true }), "camille.rochat@example.org")
          await tap(page, page.getByRole("button", { name: "Chercher", exact: true }))
          await at("Cliquez sur Choisir")
          await tap(page, page.getByRole("button", { name: "Choisir Camille Rochat", exact: true }))
          await page.getByRole("group", { name: "Membre choisi", exact: true }).waitFor()
          await at("horaire convenu par téléphone")
          await typeNaturally(page, page.getByLabel("Note", { exact: true }), "Horaire convenu par téléphone")
        })
        await scene("manual-check", async at => {
          await chooseShift("Créneau *", /9h–12h, Accueil.*Déjà inscrit/)
          await at("Si nous essayons de l'ajouter")
          const response = page.waitForResponse(r => r.url().endsWith("/api/admin/registrations") && r.request().method() === "POST")
          await tap(page, page.getByRole("button", { name: "Ajouter", exact: true }))
          const result = await response
          if (result.status() !== 409) throw new Error("Duplicate registration was not refused")
          await page.getByText("Cette personne est déjà inscrite sur ce créneau.", { exact: true }).waitFor()
          checks.duplicateRejected = true
          await at("Sur la buvette du matin"); await chooseShift("Créneau *", /10h–14h, Buvette.*conflit/)
          await page.locator("#add-shift-conflict").waitFor()
          checks.overlapWarningObservedWithoutSubmitting = true
          await at("Choisissons plutôt un horaire compatible")
          await chooseShift("Créneau *", /15h–18h, Accueil/)
          if (await page.locator("#add-shift-conflict").isVisible()) throw new Error("Narrated compatible shift still has an overlap warning; correct the management fixture before filming")
          checks.compatibleShiftWithoutWarning = true
        })
        await scene("manual-result", async at => {
          await at("Avant de valider, lisez l'annonce")
          await page.locator("#add-notice").scrollIntoViewIfNeeded()
          const notice = await page.locator("#add-notice").innerText()
          if (!notice.includes("camille.rochat@example.org") || !notice.includes("une dizaine de minutes")) throw new Error("Current email notice missing")
          const before = new Set((await inbox()).messages.map(m => m.ID))
          await at("Cliquez sur Ajouter")
          const response = page.waitForResponse(r => r.url().endsWith("/api/admin/registrations") && r.request().method() === "POST")
          await tap(page, page.getByRole("button", { name: "Ajouter", exact: true }))
          const result = await response
          if (result.status() !== 201) throw new Error(`Manual compatible addition failed: ${result.status()}`)
          const payload = await result.json()
          if (!Array.isArray(payload.registrations) || payload.registrations.length !== 1) throw new Error("Expected one registration from current multi-shift form")
          const data = payload.registrations[0]
          addedId = data.id
          if (data.volunteer.id !== camille.id || data.source !== "admin_manual" || data.comment !== "Horaire convenu par téléphone") throw new Error("Manual addition did not reuse expected member")
          await row("Camille Rochat", "Accueil", "15h–18h").waitFor()
          checks.manualAdditionReusesMember = true
          const pending = await db.notificationOutbox.findMany({ where: { status: "pending", attempts: 0, dedupeKey: { startsWith: `registration_added_by_organizer:${featureEventId}:${camille.id}:` } } })
          if (pending.length !== 1 || !process.env.CRON_SECRET) throw new Error("One grouped email and real cron auth required")
          await at("Dix minutes plus tard, ouvrons le véritable email reçu")
          await db.notificationOutbox.update({ where: { id: pending[0].id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } })
          const cron = await page.request.post(`${baseUrl}/api/cron/outbox`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
          if (!cron.ok()) throw new Error(`Actual cron failed: ${cron.status()}`)
          await openNewMail("camille.rochat@example.org", before)
          const confirmationText = await page.frameLocator("iframe").locator("body").innerText()
          if (!confirmationText.includes("Élodie Rochat") || !confirmationText.includes("Accueil") || !confirmationText.includes("15h") || !confirmationText.includes("Gérer mes inscriptions")) throw new Error("Actual organizer confirmation content differs from expected fixture")
          const sent = await db.notificationOutbox.findUniqueOrThrow({ where: { id: pending[0].id } })
          if (sent.status !== "sent") throw new Error("Organizer confirmation was not sent")
          checks.manualConfirmationRealCron = true
          checks.manualNotice = notice
          await at("Nous revenons ensuite à la liste des inscriptions")
          await page.goto(adminUrl); await settle(page)
        })
        await scene("selection", async at => {
          await fillVisibly(page, search(), "Camille")
          await tap(page, row("Camille Rochat", "Accueil", "9h–12h").getByRole("checkbox"))
          await at("présence, responsable, lien personnel ou"); await tap(page, row("Camille Rochat", "Buvette", "10h–14h").getByRole("checkbox"))
          await at(0.46) /* mid-sentence */; await fillVisibly(page, search(), "Sarah")
          await toolbar().getByText("2 sélectionnées", { exact: true }).waitFor()
          checks.selectionSurvivesFiltering = true
          await at("Désélectionner remet ce nombre à"); await tap(page, toolbar().getByRole("button", { name: "Désélectionner", exact: true }))
          await fillVisibly(page, search(), "Camille")
        })
        await scene("resend", async at => {
          await tap(page, row("Camille Rochat", "Accueil", "9h–12h").getByRole("checkbox"))
          await tap(page, row("Camille Rochat", "Buvette", "10h–14h").getByRole("checkbox"))
          const before = new Set((await inbox()).messages.map(m => m.ID))
          await tap(page, toolbar().getByRole("button", { name: "Renvoyer le lien", exact: true }))
          await page.getByRole("dialog").getByText(/un seul email par personne/).waitFor()
          await at("Confirmez seulement après l'avoir lu.")
          const response = bulkResponse("resend_link")
          await tap(page, page.getByRole("dialog").getByRole("button", { name: "Renvoyer", exact: true }))
          const result = await response
          const data = await result.json()
          if (!result.ok() || data.done !== 1 || data.failed) throw new Error("Expected one successful personal-link email")
          checks.resend = data
          await at("Camille y retrouve son lien"); await openNewMail(camille.email!, before)
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
          await at("Vérifiez le poste et l'adresse")
          const response = page.waitForResponse(r => r.url().endsWith("/sector-leaders") && r.request().method() === "POST")
          await tap(page, dialog.getByRole("button", { name: "Rendre responsable", exact: true }))
          const result = await response
          if (result.status() !== 201) throw new Error("Leader nomination failed")
          await at("L'email donne accès à la"); await openNewMail("sarah.jaquet@example.org", before)
          await at(0.79) /* mid-sentence */; await page.goto(adminUrl); await settle(page)
          await fillVisibly(page, search(), "Sarah")
          await row("Sarah Jaquet", "Accueil", "15h–18h").getByText("Responsable du poste Accueil", { exact: true }).waitFor()
          checks.leaderNominationAndBadge = true
        })
        await scene("undo", async at => {
          await fillVisibly(page, search(), "Camille")
          await tap(page, row("Camille Rochat", "Accueil", "15h–18h").getByRole("checkbox"))
          const before = new Set((await inbox()).messages.map(m => m.ID))
          await tap(page, toolbar().getByRole("button", { name: "Retirer de leur créneau (1)", exact: true }))
          await at("Après confirmation, une barre laisse"); await tap(page, page.getByRole("alertdialog").getByRole("button", { name: "Retirer", exact: true }))
          await page.getByRole("button", { name: "Annuler le retrait", exact: true }).waitFor()
          await at("la ligne revient, sans annulation"); await tap(page, page.getByRole("button", { name: "Annuler le retrait", exact: true }))
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
          await at("Nous refaisons le retrait, puis"); await tap(page, page.getByRole("alertdialog").getByRole("button", { name: "Retirer", exact: true }))
          await at("L'inscription disparaît et la place")
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
          await at("Ouvrons le message réellement reçu")
          await openNewMail("camille.rochat@example.org", before)
          const text = await page.frameLocator("iframe").locator("body").innerText()
          if (!text.includes("Camille") || !text.includes("Accueil") || !text.includes("15")) throw new Error("Actual removal email does not describe Camille's afternoon shift")
          const received = (await inbox()).messages.filter(m => !before.has(m.ID) && m.To.some(t => t.Address === camille.email))
          if (received.length !== 1) throw new Error("Removal must deliver exactly one actual email to Camille")
          checks.removal = { ...data, occupiedBefore, occupiedAfter, cancellationEmailsObserved: received.length, recapEmailPromiseNotMet: false }
        })
        await page.goto(adminUrl); await settle(page)
        await scene("workload", async () => {
          await fillVisibly(page, search(), "Noah")
          await page.getByText("Charge élevée :", { exact: true }).first().waitFor()
          await page.getByText(/10 h de créneaux dans la journée/).first().waitFor()
          checks.realWorkloadWarning = true
        })
        await scene("result", async at => {
          if (!logHref) throw new Error("No actual journal link from cancellation")
          await at("Ouvrons l'action correspondant au retrait")
          await page.goto(`${baseUrl}${logHref}`); await settle(page)
          await at("Avant de passer à autre chose")
          await page.goto(adminUrl); await settle(page)
          if (await search().inputValue() || await page.getByRole("combobox", { name: "Filtrer par poste", exact: true }).inputValue() || await toolbar().count()) throw new Error("Final filters or selection were not cleared")
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
      const originalInvites = await db.memberInvite.findMany({ where: { eventId: featureEventId }, select: { id: true, volunteerId: true, volunteer: { select: { email: true } }, ...linkToken.select } })
      const originalTokens = new Map(originalInvites.map(i => [i.id, linkToken.reveal(i)]))
      await db.$disconnect()
      const openMail = async (subject: string, email?: string) => {
        const response = await page.request.get("http://localhost:48026/api/v1/messages")
        const inbox = await response.json() as { messages: { ID: string; To: { Address: string }[]; Subject: string; Created: string }[] }
        const mail = inbox.messages.filter(m => m.Subject.includes(subject) && (!email || m.To.some(t => t.Address === email))).sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0]
        if (!mail) throw new Error("Real reminder email not found")
        await page.goto(`http://localhost:48026/view/${mail.ID}`); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(650)
      }
      await scene("welcome", async () => { await page.screencast.showChapter(manifest.title, { description: "Un rappel utile, sans pression", duration: 2_300 }) })
      await scene("statuses", async at => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations`); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(650)
        const search = page.getByRole("textbox", { name: "Rechercher un bénévole", exact: true })
        await fillVisibly(page, search, "Anna")
        await page.getByRole("row").filter({ hasText: "Anna" }).waitFor()
        await at(0.26) /* mid-sentence */; await fillVisibly(page, search, "Tom")
        await at(0.42) /* mid-sentence */; await fillVisibly(page, search, "Lucas")
        await page.getByRole("row").filter({ hasText: "Lucas" }).getByText("Demande à traiter", { exact: true }).first().waitFor()
        await at("Une autre a déjà une"); await fillVisibly(page, search, "Camille")
      })
      await scene("confirm", async at => {
        await page.goto(adminUrl); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(650)
        const button = page.getByRole("button", { name: /^Relancer .*sans créneau/ })
        await tap(page, button)
        await at("Vous pouvez encore annuler.")
        await tap(page, page.getByRole("dialog", { name: /^Relancer .*sans créneau confirmé/ }).getByRole("button", { name: "Annuler", exact: true }))
        await at("Pour cette démonstration, nous confirmons"); await tap(page, button)
        await at("Pour cette démonstration, nous confirmons")
        const response = page.waitForResponse(r => r.url().endsWith("/invitations/remind") && r.request().method() === "POST")
        await tap(page, page.getByRole("dialog", { name: /^Relancer .*sans créneau confirmé/ }).getByRole("button", { name: "Relancer", exact: true }))
        const result = await response
        const sent = await result.json()
        if (!result.ok() || !(sent.queued >= 1)) throw new Error("Reminder delivery failed")
        checks.simpleReminder = sent
        await page.getByText(`${sent.queued} relances en cours d'envoi.`, { exact: true }).waitFor()
      })
      await scene("link", async at => {
        await at("Ouvrons l'email reçu dans")
        await openMail("On a besoin de toi", "anna.buhler@example.org")
        const href = await page.frameLocator("iframe").getByRole("link", { name: /Voir les missions/ }).getAttribute("href")
        if (!href) throw new Error("Reminder has no real invitation link")
        const token = new URL(href).searchParams.get("token")
        const annaInvite = originalInvites.filter(invite => invite.volunteer.email === "anna.buhler@example.org")
        if (annaInvite.length !== 1 || !token || token !== originalTokens.get(annaInvite[0].id)) throw new Error("Reminder link must retain the exact recipient's original invitation token")
        checks.originalInvitationTokenRetained = true
        await at(0.67) /* mid-sentence */
        const current = await summary()
        if (JSON.stringify(current) !== JSON.stringify(initialSummary)) throw new Error("Reminder changed participation counts")
      })
      await scene("message", async at => {
        await page.goto(adminUrl); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(650)
        await tap(page, page.getByRole("link", { name: /^Écrire un message .*sans créneau/ }))
        await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(650)
        if (!await page.getByRole("radio", { name: "Les invités sans créneau confirmé", exact: true }).isChecked()) throw new Error("Wrong prefilled message audience")
        await typeNaturally(page, page.getByRole("textbox", { name: "Objet", exact: true }), "Un horaire qui te convient")
        await typeNaturally(page, page.getByRole("textbox", { name: "Message", exact: true }), "Tu peux choisir un horaire si tu le souhaites. Merci !")
        await at("Avant d'envoyer, prévisualisez")
        await tap(page, page.getByRole("button", { name: "Voir l'aperçu et envoyer", exact: true }))
        await page.getByRole("dialog", { name: "Aperçu de l'email", exact: true }).waitFor()
      })
      await scene("waitlist", async at => {
        await at("Vous pouvez rappeler qu'elles n'ont")
        await tap(page, page.getByRole("dialog").getByRole("button", { name: "Retour au message", exact: true }))
        await page.getByText(/dont .*en liste d'attente/).scrollIntoViewIfNeeded()
        await at("Vous pouvez rappeler qu'elles n'ont")
        await fillVisibly(page, page.getByRole("textbox", { name: "Message", exact: true }), "Tu peux choisir un horaire si tu le souhaites. Si tu es en attente, ta demande reste enregistrée. Merci !")
        await at("c'est vous qui choisissez le")
        await tap(page, page.getByRole("button", { name: "Voir l'aperçu et envoyer", exact: true }))
      })
      await scene("send", async at => {
        await at("Une fois le groupe et")
        await tap(page, page.getByRole("dialog", { name: "Aperçu de l'email", exact: true }).getByRole("button", { name: /^Envoyer à/ }))
        const response = page.waitForResponse(r => r.url().endsWith(`/events/${featureEventId}/message`) && r.request().method() === "POST" && !r.request().postDataJSON().dryRun)
        await tap(page, page.getByRole("dialog", { name: "Confirmer l'envoi", exact: true }).getByRole("button", { name: "Confirmer l'envoi", exact: true }))
        const result = await response
        if (!result.ok()) throw new Error("Targeted reminder failed")
        checks.targetedMessage = await result.json()
        await page.getByRole("heading", { name: /^Message envoyé à/ }).waitFor()
        await at("Nous ouvrons le vrai message")
        await openMail("Un horaire qui te convient")
        await at(0.38) /* mid-sentence: show the delivered email before the same sentence introduces history */
        // The same sentence announces the email, then the administrative history.
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/message`); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(650)
        await page.getByText("Un horaire qui te convient", { exact: true }).first().scrollIntoViewIfNeeded()
        await at("Un email remis au serveur")
      })
      await scene("result", async () => {
        await page.goto(adminUrl); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(650)
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
        await page.goto(`http://localhost:48026/view/${latest.ID}`); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(650)
        const link = page.frameLocator("iframe").getByRole("link", { name: "Voir les missions et m'inscrire", exact: true })
        await link.waitFor()
        const href = await link.getAttribute("href")
        if (!href) throw new Error("Invitation email link missing")
        const url = new URL(href)
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
        await at("Nous ouvrons ici le message")
        await mail("test.invitation@example.org")
        await page.frameLocator("iframe").getByText(/les liens sont fictifs/).waitFor()
      })
      await scene("individual", async at => {
        await page.goto(adminUrl); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(650); await open()
        await typeNaturally(page, dialog().getByRole("searchbox", { name: "Rechercher un membre", exact: true }), "Aline")
        await tap(page, dialog().getByRole("checkbox", { name: "Inviter Aline Mercier", exact: true }))
        await at("Vous pouvez ajouter un court")
        await typeNaturally(page, dialog().getByLabel("Message (optionnel)", { exact: true }), "Bonjour Aline, nous serions ravis de te retrouver à l'accueil.")
        await at("Vérifiez le destinataire, puis envoyez")
        checks.individual = await send(1)
        await page.getByRole("row").filter({ hasText: "Aline Mercier" }).waitFor()
      })
      await scene("group", async at => {
        await page.goto(adminUrl); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(650); await open()
        const tag = dialog().getByRole("combobox", { name: "Filtrer par étiquette", exact: true })
        await tap(page, tag); await tag.selectOption("accueil")
        await at("Tout sélectionner ajoute les membres")
        await tap(page, dialog().getByRole("button", { name: "Tout sélectionner", exact: true }))
        await at("une personne déjà cochée peut")
        await tap(page, tag); await tag.selectOption("sécurité")
        await at("Avec Effacer, repartez")
        await tap(page, dialog().getByRole("button", { name: "Effacer", exact: true }))
        await tag.selectOption("")
      })
      await scene("send", async at => {
        await tap(page, dialog().getByRole("checkbox", { name: "Inviter Nicolas Renaud", exact: true }))
        await tap(page, dialog().getByRole("checkbox", { name: "Inviter Sébastien Perret", exact: true }))
        await typeNaturally(page, dialog().getByLabel("Message (optionnel)", { exact: true }), "Merci pour ton aide !")
        await at("Envoyer deux invitations déclenche des")
        checks.group = await send(2)
        nicolasLink = await mail("nicolas.renaud@example.org")
        await at("Vous voyez ici la réception")
        await mail("sebastien.perret@example.org")
      })
      await scene("personal-link", async at => {
        alineLink = await mail("aline.mercier@example.org")
        await at("Ouvrons le lien reçu par")
        await page.goto(alineLink); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(650)
        // Spoken "regarder les horaires, choisir un créneau" begins near 6.5s.
        // Keep the actual planning visible until that explanation, not the recap.
        await at(0.27) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: /, Démontage[^:]* : sélectionner/ }).first())
        await at(0.34) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        if (await page.getByRole("textbox", { name: "Email", exact: true }).inputValue() !== "aline.mercier@example.org") throw new Error("Invitation form not prefilled")
        await at(0.42) /* mid-sentence */
        await tap(page, page.getByRole("radio", { name: "M", exact: true }))
        await tap(page, page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox"))
        await tap(page, page.getByRole("checkbox", { name: /^J'accepte que l'association qui organise cet événement/ }))
        await at("Nous faisons une vraie inscription")
        await tap(page, page.getByRole("button", { name: "Confirmer mon inscription", exact: true }))
        await page.getByRole("heading", { name: /inscription confirmée/i }).waitFor()
      })
      await scene("reserved", async at => {
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(650)
        const quit = page.getByRole("button", { name: "Quitter la session", exact: true })
        if (await quit.count()) {
          await tap(page, quit)
          await quit.waitFor({ state: "hidden" })
        }
        // A different volunteer represents another device; clear only contact memory.
        await page.evaluate(() => localStorage.removeItem("benevoles_contact"))
        await at("Avec son invitation valide, il")
        await page.goto(nicolasLink); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(650)
        await tap(page, page.getByRole("button", { name: /, Sécurité[^:]* : sélectionner/ }).first())
        await at("les tags actuels sont revérifiés")
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        if (await page.getByRole("textbox", { name: "Email", exact: true }).inputValue() !== "nicolas.renaud@example.org") throw new Error("Reserved invitation identity missing")
      })
      await scene("status", async at => {
        await page.goto(adminUrl); await page.waitForLoadState("domcontentloaded"); await page.waitForTimeout(650)
        const row = page.getByRole("row").filter({ hasText: "Aline Mercier" })
        await row.getByText("Participation confirmée", { exact: false }).waitFor()
        await row.scrollIntoViewIfNeeded()
        await at("Il peut aussi concerner une")
        const response = await page.request.get(`${baseUrl}/api/admin/events/${featureEventId}/invitations`)
        if (!response.ok()) throw new Error("Cannot verify the unconfirmed invitation fixture")
        const data = await response.json()
        const nicolas = data.invites.filter((invite: { volunteer: { email: string }; state: string; registrations: unknown[] }) => invite.volunteer.email === "nicolas.renaud@example.org")
        if (nicolas.length !== 1 || nicolas[0].state !== "no_answer" || nicolas[0].registrations.length !== 0) throw new Error("Nicolas must remain genuinely unconfirmed, not merely display a matching label")
        await page.getByRole("row").filter({ hasText: "Nicolas Renaud" }).getByText("Sans réponse", { exact: true }).scrollIntoViewIfNeeded()
      })
      await scene("existing", async at => {
        await open()
        const hideInvited = dialog().getByLabel("Cacher déjà invités", { exact: true })
        if (!await hideInvited.isChecked()) throw new Error("Expected default hide-already-invited selection")
        await at("Décochez-la si vous voulez")
        await tap(page, hideInvited)
        if (await hideInvited.isChecked()) throw new Error("Already-invited members were not actually revealed")
        await typeNaturally(page, dialog().getByRole("searchbox", { name: "Rechercher un membre", exact: true }), "Aline")
        await at(0.45) /* mid-sentence */
        await dialog().getByRole("checkbox", { name: "Inviter Aline Mercier", exact: true }).waitFor()
      })
      await tap(page, dialog().getByRole("button", { name: "Annuler", exact: true }))
      await scene("no-email", async at => {
        await open()
        await typeNaturally(page, dialog().getByRole("searchbox", { name: "Rechercher un membre", exact: true }), "Meyer")
        await tap(page, dialog().getByRole("checkbox", { name: "Inviter René Meyer", exact: true }))
        await at("Le nombre d'invités ne correspond")
        const result = await send(1)
        if (result.membersWithoutEmail !== 1 || result.emailsSent !== 0) throw new Error("No-email invitation demonstration incorrect")
        checks.noEmail = result
        await page.getByRole("row").filter({ hasText: "René Meyer" }).scrollIntoViewIfNeeded()
      })
      await writeFile(path.join(dir, "invitation-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...checks }, null, 2))
    } else if (slug === "members-import") {
      const { verifyNaturalImportFixtures } = await import("../lib/member-import-ownership")
      await verifyNaturalImportFixtures()
      const form = () => page.getByRole("dialog", { name: "Importer des membres", exact: true })
      const fixture = (name: string) => path.resolve("videos/fixtures/member-import/v2", name)
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
        await at("prénom, nom, email, téléphone et")
        await form().getByLabel("Choisir un fichier CSV ou Excel", { exact: true }).setInputFiles(fixture("membres-a-verifier.csv"))
        await form().getByText(/Colonnes attendues/).scrollIntoViewIfNeeded()
        await at("elles ne sont pas importées")
        await tap(page, form().getByRole("button", { name: "Annuler", exact: true }))
      })
      await scene("preview", async at => {
        await at("Ouvrez Importer des membres")
        await open()
        await form().getByLabel("Choisir un fichier CSV ou Excel", { exact: true }).setInputFiles(fixture("membres-a-verifier.csv"))
        await at("Cliquez sur Analyser le fichier")
        await at(0.38) /* mid-sentence: retained voice reaches the actual analysis command after the heuristic pause */
        const body = await analyse()
        checks.firstPreview = body.plan.counts
        if (body.plan.counts.skip !== 2 || body.plan.counts.error !== 3) throw new Error("Expected two existing emails and three real file errors")
        if (await page.getByText(/^\d+ membres$/).innerText() !== initialCount) throw new Error("Preview changed member count")
        await at(0.72) /* mid-sentence */
        await form().getByText(/Colonnes reconnues/).scrollIntoViewIfNeeded()
      })
      await scene("errors", async at => {
        await form().getByRole("region").filter({ has: page.getByText("Prénom manquant", { exact: true }) }).scrollIntoViewIfNeeded()
        await form().getByText("Même email que la ligne 8", { exact: true }).waitFor()
        await at("Corrigez le fichier d'origine plutôt")
        await form().getByText("Email invalide : adresse-incomplete", { exact: true }).scrollIntoViewIfNeeded()
      })
      await scene("update", async at => {
        await tap(page, form().getByRole("button", { name: "Retour", exact: true }))
        await tap(page, form().getByLabel("Mettre à jour", { exact: true }))
        await at(0.25) /* mid-sentence */
        const body = await analyse()
        if (body.plan.counts.update !== 2 || body.plan.counts.skip !== 0) throw new Error("Update preview must target two existing members")
        checks.updatePreview = body.plan.counts
        await at("Ici, Camille et Julien passent")
        await form().getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Camille Rochat", exact: true }) }).scrollIntoViewIfNeeded()
      })
      await scene("corrected", async at => {
        await tap(page, form().getByRole("button", { name: "Retour", exact: true }))
        await form().getByLabel("Choisir un fichier CSV ou Excel", { exact: true }).setInputFiles(fixture("membres-corriges.xlsx"))
        await at("Les erreurs ont disparu.")
        const body = await analyse()
        if (body.plan.counts.create !== 38 || body.plan.counts.update !== 2 || body.plan.counts.error !== 0) throw new Error("Corrected Excel must plan 38 creations and two updates")
        checks.correctedPreview = body.plan.counts
        await at("René n'a pas d'email ")
        await form().getByRole("row").filter({ has: page.getByRole("rowheader", { name: "René Meyer", exact: true }) }).scrollIntoViewIfNeeded()
      })
      await scene("confirm", async at => {
        const dbUrl = new URL(process.env.DATABASE_URL ?? "")
        if (!["localhost", "127.0.0.1"].includes(dbUrl.hostname) || dbUrl.port !== "45433" || dbUrl.pathname !== "/benevoles_video") throw new Error("Import ownership requires isolated video DB")
        const { PrismaClient } = await import("../../src/generated/prisma/client")
        const { PrismaPg } = await import("@prisma/adapter-pg")
        const { collectImportOwnership } = await import("../lib/member-import-ownership")
        const ownershipDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl.href }) })
        try {
        const beforeMembers = await ownershipDb.volunteer.findMany({ where: { organizationId: "default" } })
        await at("Quand l'aperçu vous convient")
        // Mid-sentence: the imperative follows the conditional opening by 1.6 s.
        // With the pointer's own 0.48 s lead-in, this places the click on « confirmez ».
        await page.waitForTimeout(1200)
        const importStartedAt = new Date().toISOString()
        const response = page.waitForResponse(r => r.url().endsWith("/api/admin/members/import") && r.request().method() === "POST")
        await tap(page, form().getByRole("button", { name: "Importer 40 membres", exact: true }))
        const result = await response
        if (!result.ok()) throw new Error(`Confirmed import failed: ${result.status()}`)
        const body = await result.json()
        if (body.created !== 38 || body.updated !== 2 || body.errors.length) throw new Error("Confirmed import differs from expected plan")
        const afterMembers = await ownershipDb.volunteer.findMany({ where: { organizationId: "default" } })
        const importFinishedAt = new Date().toISOString()
        // Preserve actual response and snapshots even if the strict baseline
        // guard refuses ownership. This is evidence, not permission to reset.
        await writeFile(path.join(dir, "pending-import-receipt.json"), JSON.stringify({ schemaVersion: 1, scenario: "members-import", responseStatus: result.status(), receipt: body, startedAt: importStartedAt, finishedAt: importFinishedAt, before: beforeMembers, after: afterMembers }, null, 2))
        const ledger = await collectImportOwnership(beforeMembers, afterMembers, body, result.status(), importStartedAt, importFinishedAt)
        const ownershipJson = JSON.stringify(ledger, null, 2)
        const { createHash } = await import("node:crypto")
        await writeFile(path.join(dir, `owned-import-members-v2-${createHash("sha256").update(ownershipJson).digest("hex")}.json`), ownershipJson, { flag: "wx" })
        await writeFile(path.join(dir, "owned-import-members-v2.json"), ownershipJson)
        checks.confirmed = body
        await form().getByText(/Import terminé/).waitFor()
        await at("Fermez la fenêtre et recherchez")
        await tap(page, form().getByRole("button", { name: "Fermer", exact: true }).last())
        await fillVisibly(page, page.getByPlaceholder("Rechercher (nom, email, téléphone)…"), "Maya")
        await at("Ouvrez sa fiche pour vérifier")
        await tap(page, page.getByRole("button", { name: "Modifier Maya Perret", exact: true }))
        const edit = page.getByRole("dialog", { name: "Modifier le membre", exact: true })
        if (!(await edit.getByLabel("Étiquettes (séparées par des virgules)", { exact: true }).inputValue()).includes("permis-b")) throw new Error("Imported tags missing")
        await at("Importer une personne ne l'inscrit")
        await tap(page, edit.getByRole("button", { name: "Annuler", exact: true }))
        } finally { await ownershipDb.$disconnect() }
      })
      await scene("repeat", async at => {
        await fillVisibly(page, page.getByPlaceholder("Rechercher (nom, email, téléphone)…"), "")
        await open()
        await form().getByLabel("Choisir un fichier CSV ou Excel", { exact: true }).setInputFiles(fixture("membres-corriges.xlsx"))
        await tap(page, form().getByLabel("Ignorer", { exact: true }))
        const body = await analyse()
        if (body.plan.counts.skip !== 39 || body.plan.counts.create !== 1) throw new Error("Repeat preview must expose the no-email recreation risk")
        checks.repeatPreview = body.plan.counts
        await at("Regardez toujours le nombre de")
        await at(0.94) /* mid-sentence: final-audio cut at 0.86 still ended before « puis annulez »; wait for the actual clause */
        await tap(page, form().getByRole("button", { name: "Retour", exact: true }))
        await tap(page, form().getByRole("button", { name: "Annuler", exact: true }))
      })
      await scene("result", async () => {
        await page.getByRole("heading", { name: "Membres", exact: true }).scrollIntoViewIfNeeded()
      })
      await writeFile(path.join(dir, "import-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...checks }, null, 2))
    } else if (slug === "volunteer-hours-certificate") {
      const { loadCurrentVideoPrisma } = await import("../lib/current-product-prisma")
      const { recordVolunteerHours } = await import("../lib/record-volunteer-hours")
      const { HOURS_OWNER, readHoursScenario } = await import("../lib/volunteer-hours-fixture")
      const { createHash } = await import("node:crypto")
      const { execFile } = await import("node:child_process")
      const { promisify } = await import("node:util")
      const execute = promisify(execFile)
      if (baseUrl !== "http://localhost:43114" || org !== "formation-heures" || process.env.ORG_ADMIN_EMAIL !== HOURS_OWNER) throw new Error("Hours require their dedicated owned local server")
      const { db, product: hoursProduct, unregister } = await loadCurrentVideoPrisma("http://localhost:43114")
      try {
        const preparation = JSON.parse(await readFile(path.join(dir, "preparation.json"), "utf8"))
        if (preparation.product?.commit !== hoursProduct.commit || preparation.product?.buildId !== hoursProduct.buildId || preparation.product?.productSourceSha256 !== hoursProduct.productSourceSha256) throw new Error("Hours preparation must match the current compiled product")
        const facts: Record<string, unknown> = {}
        await recordVolunteerHours({ page, base: baseUrl, product: hoursProduct, scene, tap, settle,
          readScenario: () => readHoursScenario(db, hoursProduct),
          setFrenchDate: async (current, field, iso) => { await fillVisibly(current, field, iso, 1000); if (await field.inputValue() !== iso) throw new Error("Actual date entry differs") },
          showDownloadedCsv: async (current, file) => {
            const csv = await readFile(file, "utf8")
            const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            const rows = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/).map(line => line.split(";"))
            const header = rows.shift()!
            const table = `<table><thead><tr>${header.map(value => `<th>${escape(value)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${escape(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
            await current.setContent(`<html lang="fr"><meta charset="utf-8"><style>body{font:22px Arial;margin:35px;background:#f4f7fb}table{border-collapse:collapse;width:100%;font-size:19px}th,td{padding:18px;border-bottom:1px solid #ccd3de;text-align:left}th{background:#e2e8f0}tbody tr:last-child{font-weight:bold}</style><h1>Lecture du CSV réellement téléchargé</h1><p>Export des heures — septembre 2026. Présentation du fichier, distincte de l'application.</p>${table}</html>`)
          },
          preparePrintedPdf: async current => {
            const printedFrom = current.url()
            const folder = path.join(dir, "documents"); await mkdir(folder, { recursive: true })
            return async () => {
              // The product button has already invoked its genuine window.print.
              // Headless Chromium has no visible print dialog; use its actual
              // print engine afterwards, without intercepting or replacing it.
              const file = path.join(folder, "attestation-aline.pdf")
              await current.pdf({ path: file, format: "A4", printBackground: true, preferCSSPageSize: true })
              const bytes = await readFile(file)
              const extracted = await execute("pdftotext", ["-layout", file, "-"])
              const info = await execute("pdfinfo", [file])
              const pages = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1]); if (!pages) throw new Error("Actual printed PDF pages required")
              const prefix = path.join(folder, "attestation-review")
              await execute("pdftoppm", ["-scale-to", "1500", "-png", file, path.join(folder, "attestation-all-pages")])
              await execute("pdftoppm", ["-f", "1", "-singlefile", "-scale-to", "1500", "-png", file, prefix])
              const png = await readFile(`${prefix}.png`)
              await current.setContent(`<html lang="fr"><meta charset="utf-8"><style>body{font:18px Arial;background:#eef1f5;margin:12px}h1{font-size:21px}img{display:block;height:640px;margin:auto}</style><h1>PDF réel — impression locale du navigateur</h1><p>Lecture de la première page, pas un téléchargement PDF du serveur.</p><img alt="Première page de l'attestation réellement imprimée" src="data:image/png;base64,${png.toString("base64")}"></html>`)
              return { path: file, sha256: createHash("sha256").update(bytes).digest("hex"), text: extracted.stdout, pages, printedFrom, product: hoursProduct, method: "browser-print-engine" as const }
            }
          },
          evidence: async (chapter, observed) => { facts[chapter] = observed; await writeFile(path.join(dir, "hours-evidence.json"), JSON.stringify({ checkedAt: new Date().toISOString(), product: hoursProduct, ...facts }, null, 2)) },
        })
      } finally { await db.$disconnect(); await unregister() }
    } else if (slug === "event-questions") {
      const { loadCurrentVideoPrisma } = await import("../lib/current-product-prisma")
      const { recordEventQuestions } = await import("../lib/record-event-questions")
      const { QUESTIONS_EVENT, QUESTIONS_EMAIL, QUESTIONS_OWNER, assertQuestionsReviewFixture, readQuestionsSnapshot } = await import("../lib/event-questions-fixture")
      const { linkToken } = await import("../../src/lib/token-vault")
      if (baseUrl !== "http://localhost:43112" || org !== "formation-questions" || process.env.ORG_ADMIN_EMAIL !== QUESTIONS_OWNER) throw new Error("Questions require the dedicated owned local server")
      const { db, product: questionsProduct, unregister } = await loadCurrentVideoPrisma("http://localhost:43112")
      try {
        const owned = await assertQuestionsReviewFixture(db)
        const preparation = JSON.parse(await readFile(path.join(dir, "preparation.json"), "utf8"))
        if (preparation.product?.commit !== questionsProduct.commit || preparation.product?.buildId !== questionsProduct.buildId || preparation.product?.productSourceSha256 !== questionsProduct.productSourceSha256) throw new Error("Questions preparation does not match the current compiled product")
        const invite = owned.events[0].memberInvites[0]
        const invitationUrl = `${baseUrl}/atelier-questions?org=formation-questions&token=${encodeURIComponent(linkToken.reveal(invite))}`
        const mailBefore = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json()
        const priorMailIds = new Set(mailBefore.messages.map((mail: { ID: string }) => mail.ID))
        const observations: Record<string, unknown> = {}
        await recordEventQuestions({ page, base: baseUrl, eventId: QUESTIONS_EVENT, email: QUESTIONS_EMAIL, publicSlug: "atelier-questions", invitationUrl, scene, tap, settle,
          readSnapshot: () => readQuestionsSnapshot(db),
          completeVolunteerForm: async current => {
            for (const [label, value] of [["Prénom", "Aline"], ["Nom", "Mercier"], ["Email", QUESTIONS_EMAIL]]) {
              const field = current.getByRole("textbox", { name: label, exact: true })
              if (await field.inputValue() !== value) {
                await tap(current, field); await field.press("ControlOrMeta+A"); await field.pressSequentially(value, { delay: 75 })
              }
            }
            for (const selector of ["#reg-charter", "#reg-consent"]) {
              const checkbox = current.locator(selector)
              if (!await checkbox.isChecked()) await tap(current, checkbox)
              if (!await checkbox.isChecked()) throw new Error("Questions requires the genuinely checked current convention and consent controls")
            }
          },
          evidence: async (chapter, observed) => { observations[chapter] = observed; if (chapter === "required-validation") await page.screenshot({ path: path.join(dir, "native-required-validation-fr.png") }); await writeFile(path.join(dir, "questions-evidence.json"), JSON.stringify({ recordedAt: new Date().toISOString(), product: questionsProduct, ...observations }, null, 2)) },
          showConfirmationEmail: async (current, recipient) => {
            let mail: { ID: string; Subject: string; To: { Address: string }[] } | undefined
            for (let attempt = 0; attempt < 40; attempt++) {
              const inbox = await (await current.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json()
              mail = inbox.messages.find((item: { ID: string; Subject: string; To: { Address: string }[] }) => !priorMailIds.has(item.ID) && item.Subject.includes("Préparer les questions de l'équipe") && item.To.some(to => to.Address === recipient))
              if (mail) break
              await current.waitForTimeout(250)
            }
            if (!mail) throw new Error("Fresh actual confirmation email required; old mailbox messages cannot substitute")
            await current.goto(`http://localhost:48026/view/${encodeURIComponent(mail.ID)}`); await settle(current)
            const frame = current.frameLocator("iframe")
            const anchor = frame.locator('a[href*="/my/"]').first()
            await anchor.waitFor(); await anchor.scrollIntoViewIfNeeded()
            const rawHref = await anchor.getAttribute("href")
            if (!rawHref) throw new Error("Real received email lacks its personal link")
            const actual = new URL(rawHref)
            if (!(actual.hostname === "formation-questions.video.invalid" || actual.hostname === "formation-questions.benevol.app" || actual.origin === baseUrl) || !/^\/my\/[^/]+$/.test(actual.pathname)) throw new Error("Received personal link is outside the fictional organization")
            const local = new URL(actual.pathname, baseUrl)
            local.searchParams.set("org", "formation-questions")
            observations.freshEmail = { mailId: mail.ID, exactRecipient: recipient, messageProducedDuringThisTake: true, trainingDomainReplayedLocally: actual.origin !== baseUrl }
            return { recipient, actualPersonalLink: local.href }
          },
        })
      } finally { await db.$disconnect(); await unregister() }
    } else if (slug === "members-duplicates-merge") {
      const { loadCurrentVideoPrisma } = await import("../lib/current-product-prisma")
      const { memberMergeReaders } = await import("../lib/member-merge-fixture")
      const { recordMemberMerge } = await import("../lib/record-member-merge")
      const databaseUrl = process.env.DATABASE_URL ?? ""
      const { db, unregister } = await loadCurrentVideoPrisma("http://localhost:43110")
      try {
        const evidence = await recordMemberMerge({ page, baseUrl, scene, settle, tap, ...memberMergeReaders(db, databaseUrl, baseUrl) })
        await writeFile(path.join(dir, "member-merge-evidence.json"), JSON.stringify({ recordedAt: new Date().toISOString(), ...evidence }, null, 2))
      } finally { await db.$disconnect(); await unregister() }
    } else if (slug === "members-management") {
      const search = () => page.getByPlaceholder("Rechercher (nom, email, téléphone)…")
      const mayaRow = () => page.getByRole("row").filter({ has: page.getByRole("button", { name: "Modifier Maya Berger", exact: true }) })
      const editMaya = async () => {
        await tap(page, page.getByRole("button", { name: "Modifier Maya Berger", exact: true }))
        await page.getByRole("dialog", { name: "Modifier le membre", exact: true }).waitFor()
      }
      const save = async () => {
        const form = page.getByRole("dialog", { name: "Modifier le membre", exact: true })
        const saved = page.waitForResponse(response => response.request().method() === "PATCH" && /\/api\/admin\/members\/[^/]+$/.test(new URL(response.url()).pathname))
        await tap(page, form.getByRole("button", { name: "Enregistrer", exact: true }))
        const response = await saved
        if (!response.ok()) throw new Error(`Member edit failed (${response.status()}); do not continue with an unsaved form`)
        await form.waitFor({ state: "hidden" })
        await settle(page)
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
        await at("Après la création, Maya apparaît")
        const created = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/admin/members")
        await tap(page, form.getByRole("button", { name: "Créer", exact: true }))
        if (!(await created).ok()) throw new Error("Maya was not actually created")
        await form.waitFor({ state: "hidden" })
        await page.getByRole("button", { name: "Modifier Maya Berger", exact: true }).waitFor()
        await mayaRow().getByText("maya.berger@example.org", { exact: true }).waitFor()
        await page.getByText("61 membres", { exact: true }).waitFor()
      })
      await scene("edit", async at => {
        await editMaya()
        const form = page.getByRole("dialog", { name: "Modifier le membre", exact: true })
        await typeNaturally(page, form.getByLabel("Étiquettes (séparées par des virgules)", { exact: true }), "accueil, permis-b")
        await typeNaturally(page, form.getByLabel("Notes", { exact: true }), "Préfère le stand d'accueil.")
        await at("Enregistrons, puis rouvrons la fiche")
        await save(); await editMaya()
        if (await form.getByLabel("Notes", { exact: true }).inputValue() !== "Préfère le stand d'accueil.") throw new Error("Member notes did not persist")
        if (await form.getByLabel("Étiquettes (séparées par des virgules)", { exact: true }).inputValue() !== "accueil, permis-b") throw new Error("Member tags did not persist")
      })
      await scene("availability", async at => {
        const form = page.getByRole("dialog", { name: "Modifier le membre", exact: true })
        await form.waitFor()
        if (await form.getByLabel("Soir", { exact: true }).isChecked()) throw new Error("Expected initially empty fictional availability")
        await at("Ici, Maya est disponible le")
        await tap(page, form.getByLabel("Soir", { exact: true }))
        await typeNaturally(page, form.getByLabel(/Sauf \/ à savoir/), "Pas le vendredi")
        await at("Après enregistrement, cette indication apparaît")
        await save()
        await mayaRow().getByText(/Soir.*Pas le vendredi/).waitFor()
      })
      await scene("no-email", async at => {
        await tap(page, page.getByRole("button", { name: "+ Nouveau membre", exact: true }))
        const form = page.getByRole("dialog")
        await typeNaturally(page, form.getByLabel(/^Prénom/), "René")
        await typeNaturally(page, form.getByLabel(/^Nom/), "Aubert")
        await typeNaturally(page, form.getByLabel("Téléphone", { exact: true }), "079 000 90 02")
        await at(0.63) /* mid-sentence */
        const created = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/admin/members")
        await tap(page, form.getByRole("button", { name: "Créer", exact: true }))
        const response = await created
        if (response.status() !== 201) throw new Error("René was not actually created")
        const member = await response.json()
        if (org !== "default" || member.organizationId !== "default" || !/^[A-Za-z0-9_-]{8,100}$/.test(member.id ?? "") || member.firstName !== "René" || member.lastName !== "Aubert" || member.email !== null || member.phone?.replace(/\s/g, "") !== "0790009002") throw new Error("Created no-email contact does not match the recorder-owned fictional identity")
        const ledgerPath = path.resolve("videos/output/members-management/owned-members-v2.json")
        let entries: Record<string, unknown>[] = []
        try {
          const ledger = JSON.parse(await readFile(ledgerPath, "utf8"))
          if (ledger.schemaVersion !== 2 || ledger.scenario !== "members-management" || !Array.isArray(ledger.members) || ledger.members.length > 30) throw new Error("Invalid member ownership ledger")
          entries = ledger.members.filter((entry: Record<string, unknown>) => entry.id !== member.id)
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
        if (entries.length >= 30) throw new Error("Member ownership ledger limit reached; do not broaden the reset guard")
        if (!Number.isFinite(Date.parse(member.createdAt))) throw new Error("Actual API member creation date is missing")
        entries.push({ id: member.id, organizationId: "default", firstName: "René", lastName: "Aubert", phone: member.phone, email: null, responseStatus: response.status(), createdAt: new Date().toISOString(), actualCreatedAt: member.createdAt })
        await mkdir(path.dirname(ledgerPath), { recursive: true })
        const memberLedgerJson = JSON.stringify({ schemaVersion: 2, scenario: "members-management", members: entries }, null, 2)
        const { createHash } = await import("node:crypto")
        await writeFile(path.join(path.dirname(ledgerPath), `owned-members-v2-${createHash("sha256").update(memberLedgerJson).digest("hex")}.json`), memberLedgerJson, { flag: "wx" })
        await writeFile(ledgerPath, memberLedgerJson)
        await form.waitFor({ state: "hidden" })
        const row = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Modifier René Aubert", exact: true }) })
        await row.waitFor()
        if ((await row.textContent())?.includes("@")) throw new Error("No-email demonstration has an email")
      })
      await scene("search", async at => {
        await typeNaturally(page, search(), "Emilie")
        await page.getByText("Émilie", { exact: true }).first().waitFor()
        await at("ici, deux Stéphane Favre ont")
        await fillVisibly(page, search(), "Stephane Favre")
        if (await page.getByRole("button", { name: "Modifier Stéphane Favre", exact: true }).count() !== 2) throw new Error("Homonym demonstration must show two distinct members")
      })
      await scene("filter", async at => {
        await fillVisibly(page, search(), "")
        const tags = page.getByRole("combobox", { name: "Étiquette", exact: true })
        await tap(page, tags); await tags.selectOption("accueil")
        await mayaRow().waitFor()
        await at("Les en-têtes permettent aussi de")
        await tap(page, tags); await tags.selectOption("")
        await at("Les heures prévues comptent les")
        await tap(page, page.getByRole("button", { name: /^Nom/ }).first())
        await at("Les heures prévues comptent les")
        await tap(page, page.getByRole("button", { name: /^Heures prévues/ }))
      })
      await scene("deactivate", async at => {
        await fillVisibly(page, search(), "Maya Berger")
        await tap(page, page.getByRole("button", { name: "Désactiver Maya Berger", exact: true }))
        const deactivated = page.waitForResponse(response => response.request().method() === "DELETE" && /\/api\/admin\/members\/[^/]+$/.test(new URL(response.url()).pathname))
        await at("nous confirmons sa désactivation, puis")
        await tap(page, page.getByRole("alertdialog").getByRole("button", { name: "Désactiver", exact: true }))
        if (!(await deactivated).ok()) throw new Error("Maya deactivation did not persist")
        await page.getByRole("alertdialog").waitFor({ state: "hidden" })
        await page.getByRole("button", { name: "Modifier Maya Berger", exact: true }).waitFor({ state: "hidden" })
        await at("Avec Inclure inactifs, nous la")
        await tap(page, page.getByLabel("Inclure inactifs", { exact: true }))
        await at("Dans Modifier, la case Membre")
        await editMaya()
        const active = page.getByRole("dialog", { name: "Modifier le membre", exact: true }).getByLabel("Membre actif", { exact: true })
        if (await active.isChecked()) throw new Error("Inactive member unexpectedly remains active")
        await tap(page, active)
        if (!await active.isChecked()) throw new Error("Actual reactivation checkbox did not change")
        await at("Après enregistrement, elle revient parmi")
        await save()
        await tap(page, page.getByLabel("Inclure inactifs", { exact: true }))
        await page.getByRole("button", { name: "Désactiver Maya Berger", exact: true }).waitFor()
        await page.goto(`${baseUrl}/admin/members?q=Maya%20Berger`); await settle(page)
        await page.getByRole("button", { name: "Désactiver Maya Berger", exact: true }).waitFor()
      })
      await scene("activity", async at => {
        await fillVisibly(page, search(), "Camille Rochat")
        await tap(page, page.getByRole("link", { name: "Activité de Camille Rochat", exact: true }))
        await settle(page)
        await page.getByRole("heading", { name: "Activité de Camille Rochat", exact: true }).waitFor()
        if (!await page.getByRole("list", { name: "Chronologie", exact: true }).getByRole("listitem").count()) throw new Error("Activity demonstration is empty")
        await at("Cette vue rassemble notamment les")
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
        await at("Ce lien donne accès à")
        await page.getByRole("heading", { name: "Ton lien personnel", exact: true }).scrollIntoViewIfNeeded()
      })
      await scene("session", async at => {
        await page.goto(eventUrl); await settle(page)
        await page.getByRole("button", { name: "Quitter la session", exact: true }).waitFor()
        await at(0.60) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: "Quitter la session", exact: true }))
        await page.getByRole("button", { name: "Quitter la session", exact: true }).waitFor({ state: "hidden" })
      })
      await scene("resend", async at => {
        await page.goto(personalUrl); await settle(page)
        await page.getByRole("heading", { name: "Ton lien personnel", exact: true }).scrollIntoViewIfNeeded()
        await at("Avec Recevoir ce lien par")
        await tap(page, page.getByRole("button", { name: "Recevoir ce lien par email", exact: true }))
        await page.getByText(/^Demande enregistrée : tu vas recevoir ce lien par email/).waitFor()
        await at("Attendons le résultat, puis ouvrons")
        await page.goto("http://localhost:48026"); await settle(page)
        await tap(page, page.getByText(/Ton lien pour gérer tes inscriptions/).first())
        await page.frameLocator("iframe").locator('a[href*="/my/"]').first().waitFor()
      })
      await scene("recover", async at => {
        await page.goto(invalidUrl); await settle(page)
        await at("Saisis l’adresse email utilisée pour")
        await typeNaturally(page, page.getByLabel(/Adresse email utilisée/), "camille.rochat@example.org")
        await tap(page, page.getByRole("button", { name: "Recevoir un nouveau lien", exact: true }))
        const answer = page.getByText(/Si une inscription existe à cette adresse/)
        await answer.waitFor()
        const knownAnswer = await answer.textContent()
        await at("elle ne révèle pas les")
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
        await at(0.70) /* mid-sentence */
        const personalPanel = page.getByRole("heading", { name: "Ton lien personnel", exact: true }).locator("..")
        await personalPanel.getByRole("link", { name: "Écrire à l'organisation", exact: true }).scrollIntoViewIfNeeded()
      })
      await scene("availability", async at => {
        await startSeparateReadJourney()
        await section().scrollIntoViewIfNeeded()
        await at("Camille coche Matin et Soir,")
        await tap(page, section().getByLabel("Matin", { exact: true }))
        await tap(page, section().getByLabel("Soir", { exact: true }))
        await typeNaturally(page, section().getByLabel(/Sauf/), "Pas le dimanche matin")
        await at("Après Enregistrer mes disponibilités, le")
        await tap(page, section().getByRole("button", { name: "Enregistrer mes disponibilités", exact: true }))
        await page.getByText(/Disponibilités enregistrées/).waitFor()
        await at("Rechargeons la page ")
        await page.reload(); await settle(page)
        await section().scrollIntoViewIfNeeded()
        if (!await section().getByLabel("Matin", { exact: true }).isChecked() || !await section().getByLabel("Soir", { exact: true }).isChecked()) throw new Error("Availability did not persist")
        if (await section().getByLabel(/Sauf/).inputValue() !== "Pas le dimanche matin") throw new Error("Availability note did not persist")
      })
      await scene("organizer", async at => {
        await startSeparateReadJourney()
        await page.goto(`${baseUrl}/admin/members`); await settle(page)
        await page.getByText(/Pas le dimanche matin/).first().scrollIntoViewIfNeeded()
        await at("Une disponibilité générale ne garantit")
        await page.goto(personalUrl); await settle(page)
        await section().scrollIntoViewIfNeeded()
      })
      await scene("result", async at => {
        await at("Reviens sur ta page Mes inscriptions")
        await tap(page, section().getByLabel("Matin", { exact: true }))
        await tap(page, section().getByLabel("Soir", { exact: true }))
        await fillVisibly(page, section().getByLabel(/Sauf/), "")
        await at("Enregistre à nouveau et vérifie")
        await tap(page, section().getByRole("button", { name: "Enregistrer mes disponibilités", exact: true }))
        await page.getByText("Disponibilités effacées.", { exact: true }).waitFor()
        await at("Le lien personnel reste ton")
        await page.getByRole("heading", { name: "Ton lien personnel", exact: true }).scrollIntoViewIfNeeded()
      })
    } else if (slug === "sector-leaders") {
      // Public pages keep background requests alive; wait for DOM and actual scene controls instead.
      const settleSector = async () => { await page.waitForLoadState("domcontentloaded"); await page.evaluate(() => document.fonts?.ready); await page.waitForTimeout(500) }
      const leadersUrl = `${baseUrl}/admin/events/${featureEventId}/sector-leaders`
      const rosterUrl = `${baseUrl}/leader/demo-leader-buvette-0001`
      await page.goto(`${baseUrl}/admin/events/${featureEventId}`); await settleSector()
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Un accès simple pour accompagner son équipe", duration: 2_300 })
      })
      await scene("nominate", async (at) => {
        await at("Dans l'événement, ouvrez les responsables")
        await tap(page, page.getByRole("link", { name: "Paramètres de l'événement", exact: true }))
        await tap(page, page.getByRole("link", { name: "Responsables de secteur", exact: true }))
        await tap(page, page.getByRole("button", { name: "+ Ajouter un responsable", exact: true }))
        await at("Choisissez le poste, puis renseignez")
        await typeNaturally(page, page.getByLabel(/^Poste(?: \*)?$/), "Montage")
        await typeNaturally(page, page.getByLabel(/^Nom(?: \*)?$/), "Samira Perrin")
        await typeNaturally(page, page.getByLabel(/^Email(?: \*)?$/), "samira.perrin@example.org")
        await at("Ajouter et envoyer le lien")
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
        await at("Être responsable d'un poste et")
        await fillVisibly(page, page.getByLabel(/^Poste(?: \*)?$/), "Démontage")
        await at("la nomination ne remplace pas")
        await tap(page, page.getByRole("button", { name: "Ajouter et envoyer le lien" }))
        await page.getByRole("heading", { name: "Démontage", exact: true }).waitFor()
      })
      let nominationMail: { ID: string } | undefined
      for (let attempt = 0; attempt < 40 && !nominationMail; attempt++) {
        const response = await page.request.get(`${mailpitBase}/api/v1/search`, { params: { query: 'subject:"Fête du village de Montvert"', limit: 500 } })
        const result = await response.json() as { messages: { ID: string; Subject: string; To: { Address: string }[] }[] }
        nominationMail = result.messages.find(m => m.To.some(to => to.Address === "samira.perrin@example.org") && /responsable/i.test(m.Subject))
        if (!nominationMail) await page.waitForTimeout(250)
      }
      if (!nominationMail) throw new Error("Current Samira nomination email missing")
      await openRegistrationTakeMailbox(page, dir, nominationMail.ID)
      await scene("email", async (at) => {
        await at(0.24) /* mid-sentence */
        const link = page.frameLocator("iframe").locator('a[href*="/leader/"]').first()
        const href = await link.getAttribute("href")
        if (!href) throw new Error("Nomination email has no personal leader link")
        const personal = new URL(href)
        await page.goto(`${baseUrl}${personal.pathname}`); await settleSector()
        await page.getByRole("heading", { name: /^Responsable ·/ }).waitFor()
      })
      await page.goto(rosterUrl); await settleSector()
      await page.getByRole("heading", { name: "Responsable · Buvette", exact: true }).waitFor()
      await scene("roster", async (at) => {
        await at("Chaque ligne donne le nom")
        await page.getByText("Liste d'attente", { exact: true }).first().scrollIntoViewIfNeeded()
        await at("La mention Liste d'attente distingue")
        await page.getByText("Liste d'attente", { exact: true }).first().scrollIntoViewIfNeeded()
      })
      await scene("mobile", async (at) => {
        await page.setViewportSize({ width: 390, height: 800 })
        await page.evaluate(() => window.scrollTo(0, 0))
        await at("Les liens email et téléphone")
        await page.locator('a[href^="tel:"]').first().scrollIntoViewIfNeeded()
        await at("On peut ainsi retrouver l'équipe")
        await page.locator("section").last().scrollIntoViewIfNeeded()
      })
      await scene("scope", async (at) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.evaluate(() => window.scrollTo(0, 0))
        if (await page.getByRole("button", { name: /Modifier|Retirer|Ajouter/ }).count()) throw new Error("Leader view unexpectedly has mutation controls")
        await at("Pour une modification du planning")
        await page.locator("section").last().scrollIntoViewIfNeeded()
      })
      await scene("new-signup", async (at) => {
        await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`); await settleSector()
        await tap(page, page.getByRole("button", { name: /^10h–14h \d+\/\d+, Buvette : sélectionner/ }).last())
        await at("Nora choisit ce créneau, puis")
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        await at("Elle renseigne son prénom et")
        await typeNaturally(page, page.getByLabel(/^Prénom(?: \*)?$/), "Nora")
        await typeNaturally(page, page.getByLabel(/^Nom(?: \*)?$/), "Perrin")
        await typeNaturally(page, page.getByLabel(/^Email(?: \*)?$/), "nora.team@example.org")
        await typeNaturally(page, page.getByLabel(/^Téléphone(?: \*)?$/), "079 000 00 12")
        await at("La taille du t-shirt est")
        await at("Elle choisit une taille, accepte")
        await tap(page, page.getByRole("radio", { name: "M", exact: true }))
        await tap(page, page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox"))
        await tap(page, page.getByRole("checkbox", { name: /^J'accepte que l'association qui organise cet événement/ }))
        await at("Avant de confirmer, elle vérifie")
        await page.getByLabel(/^Prénom(?: \*)?$/).evaluate(element => element.scrollIntoView({ block: "center" }))
        await at("Nous confirmons maintenant")
        await tap(page, page.getByRole("button", { name: "Confirmer mon inscription" }))
        await page.getByRole("heading", { name: /inscription confirmée/i }).waitFor()
      })
      const signupQuery = 'to:elodie.rochat@example.org subject:"Nouvelle inscription" "Fête du village de Montvert"'
      let notificationMail: { ID: string } | undefined
      for (let attempt = 0; attempt < 40 && !notificationMail; attempt++) {
        const messages = await verifyRegistrationTakeMailbox(page, dir, signupQuery)
        notificationMail = messages.find(m => /Nouvelle inscription.*Buvette/i.test(m.Subject) && m.To.some(to => to.Address === "elodie.rochat@example.org"))
        if (!notificationMail) await page.waitForTimeout(250)
      }
      if (!notificationMail) throw new Error("Current Buvette leader signup email missing")
      await openRegistrationTakeMailbox(page, dir, notificationMail.ID, signupQuery)
      await scene("notification", async (at) => {
        await at("En rouvrant la page, Nora")
        await page.goto(rosterUrl); await settleSector()
        await page.getByText("Nora Perrin", { exact: true }).scrollIntoViewIfNeeded()
      })
      await scene("contact", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`); await settleSector()
        await tap(page, page.getByRole("button", { name: "+ Ajouter un créneau" }))
        const editor = page.getByRole("group", { name: "Nouveau créneau" })
        await editor.getByLabel("Personne de contact", { exact: true }).scrollIntoViewIfNeeded()
        await typeNaturally(page, editor.getByLabel("Personne de contact", { exact: true }), "Élodie Rochat")
        await typeNaturally(page, editor.getByLabel("Téléphone du contact", { exact: true }), "079 000 00 01")
        await at(0.60) /* mid-sentence */
      })
      await scene("remove", async (at) => {
        await page.goto(leadersUrl); await settleSector()
        await tap(page, page.getByRole("button", { name: "Retirer Élodie Rochat des responsables de Buvette", exact: true }))
        const dialog = page.getByRole("alertdialog")
        await dialog.waitFor()
        await at("Quand la responsabilité change, retirez")
        await tap(page, dialog.getByRole("button", { name: "Retirer", exact: true }))
        await dialog.waitFor({ state: "hidden" })
        await at("Son ancien lien ne donne")
        await page.goto(rosterUrl); await settleSector()
        await page.getByRole("heading", { name: "Lien introuvable", exact: true }).waitFor()
        await at("Vous pouvez ensuite désigner la nouvelle personne")
        await page.goto(leadersUrl); await settleSector()
        await tap(page, page.getByRole("button", { name: "+ Ajouter un responsable", exact: true }))
        await page.getByLabel(/^Email(?: \*)?$/).waitFor()
      })
      // Sector leaders (#1169): the same page in an event organised by sectors (beta organisation).
      await (await import("../lib/record-beta-features")).recordSectorLeadersBySector({ page, base: baseUrl, title: manifest.title, scene, tap, settle, typeNaturally, owner: betaSessions!.owner })
    } else if (slug === "event-archive-delete") {
      const disposableTitle = "Ancienne fête de Montvert — copie de démonstration"
      await page.goto(`${baseUrl}/admin/events/${featureEventId}`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Conserver l’historique ou effacer une édition", duration: 2_300 })
        await page.getByRole("heading", { name: "Fête du village de Montvert", exact: true }).waitFor()
      })

      let disposableId = ""
      await scene("prepare", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/duplicate`); await settle(page)
        const title = page.getByLabel("Titre de la copie")
        await title.fill(disposableTitle)
        await at(0.42) /* mid-sentence */
        await page.getByRole("heading", { name: "Ce que vous allez créer" }).scrollIntoViewIfNeeded()
        await at("Si des bénévoles doivent être")
        await tap(page, page.getByRole("button", { name: "Créer la copie" }))
        await page.waitForURL(/\/admin\/events\/[^/]+$/)
        disposableId = new URL(page.url()).pathname.split("/").at(-1) ?? ""
        await page.getByRole("heading", { name: disposableTitle }).waitFor()
      })

      await scene("archive", async (at) => {
        await at("Le bouton Archiver")
        await tap(page, page.getByRole("button", { name: "Autres actions", exact: true }))
        await tap(page, page.getByRole("button", { name: "Archiver" }))
        await page.getByRole("button", { name: "Confirmer", exact: true }).waitFor()
        await at("Après validation, la page d’inscription disparaît")
        await tap(page, page.getByRole("button", { name: "Confirmer" }))
        await page.getByText("Archivé", { exact: true }).first().waitFor()
      })

      await scene("delete-open", async (at) => {
        await at("La suppression définitive")
        await tap(page, page.getByRole("link", { name: "Paramètres de l'événement", exact: true }))
        await settle(page)
        await page.getByRole("heading", { name: "Suppression définitive" }).scrollIntoViewIfNeeded()
        await at("Le récapitulatif indique précisément combien")
        await tap(page, page.getByRole("button", { name: "Supprimer l'événement…" }))
        await page.getByRole("heading", { name: "Supprimer définitivement cet événement ?" }).waitFor()
        await at(0.72) /* mid-sentence */
        await page.getByText("Action irréversible").scrollIntoViewIfNeeded()
      })

      await scene("backup", async (at) => {
        const deletionUrl = page.url()
        const backup = page.getByRole("link", { name: /Ouvrir l'export PDF/ })
        await backup.scrollIntoViewIfNeeded()
        await at("Avant d’aller plus loin, ouvrez l’export PDF")
        const ready = page.waitForEvent("popup")
        await tap(page, backup)
        const popup = await ready
        await popup.waitForLoadState("networkidle")
        const exportedUrl = new URL(popup.url())
        if (exportedUrl.origin !== new URL(baseUrl).origin || !exportedUrl.pathname.endsWith(`/export/pdf`)) throw new Error("Unexpected archival report destination")
        await popup.close()
        await page.goto(exportedUrl.href); await settle(page)
        await at(0.80) /* mid-sentence */
        await page.goto(deletionUrl); await settle(page)
        // Navigating to the PDF resets this client-side disclosure on return.
        await tap(page, page.getByRole("button", { name: "Supprimer l'événement…" }))
        await page.getByRole("heading", { name: "Supprimer définitivement cet événement ?" }).waitFor()
      })

      await scene("confirm", async (at) => {
        const confirm = page.getByLabel(/Pour confirmer, saisissez le titre/)
        await confirm.scrollIntoViewIfNeeded()
        await at("Tant qu’il ne correspond pas")
        await confirm.fill(disposableTitle)
        await page.getByText("Le titre correspond. Vous pouvez supprimer.").waitFor()
        await at("Une fois la suppression lancée")
        await tap(page, page.getByRole("button", { name: "Supprimer définitivement" }))
        await page.getByRole("heading", { name: "Événements" }).waitFor()
      })

      await scene("result", async (at) => {
        await page.getByRole("heading", { name: "Événements" }).waitFor()
        await at(0.52) /* mid-sentence */
        if (await page.getByText(disposableTitle, { exact: true }).count()) throw new Error(`Disposable event ${disposableId} was not deleted`)
      })
    } else if (slug === "event-milestones") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}`); await settle(page)
      // The heading can be barely visible at the bottom while all milestones
      // remain below the viewport. Show the list during its introduction too.
      await page.getByRole("heading", { name: "Jalons", exact: true }).evaluate(element => element.scrollIntoView({ block: "start" }))
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Les échéances essentielles, au même endroit", duration: 2_300 })
        await page.getByRole("heading", { name: "Jalons" }).waitFor()
      })

      await scene("create", async (at) => {
        await page.getByRole("heading", { name: "Jalons" }).scrollIntoViewIfNeeded()
        await at("Ajoutons Fermer les inscriptions")
        await tap(page, page.getByRole("button", { name: "+ Ajouter un jalon" }))
        await at("Ajoutons Fermer les inscriptions")
        await page.getByLabel(/^Titre/).fill("Fermer les inscriptions")
        await at("Ajoutons Fermer les inscriptions")
        const due = new Date(); due.setDate(due.getDate() + 8)
        await page.getByLabel(/^Échéance/).fill(due.toISOString().slice(0, 10))
        await at("Ajoutons Fermer les inscriptions")
        await at("Un bon jalon décrit un résultat vérifiable")
        await page.getByLabel(/Qui s.en occupe/).selectOption({ label: "Camille Martin" })
        await tap(page, page.getByRole("button", { name: "Ajouter", exact: true }))
        await page.getByText("Fermer les inscriptions", { exact: true }).first().waitFor()
      })

      await scene("states", async (at) => {
        await page.getByRole("heading", { name: "Jalons" }).scrollIntoViewIfNeeded()
        await page.getByRole("checkbox", { name: "Préparer le matériel", exact: true }).waitFor()
        if (!(await page.getByRole("checkbox", { name: "Préparer le matériel", exact: true }).isChecked())) throw new Error("Finished milestone missing")
        if (await page.getByRole("checkbox", { name: "Valider le plan de sécurité", exact: true }).isChecked()) throw new Error("Overdue milestone must remain unfinished")
        await at("On comprend donc en un regard")
        await tap(page, page.getByRole("button", { name: "Modifier le jalon « Fermer les inscriptions »", exact: true }))
        await page.getByRole("form", { name: "Modifier le jalon « Fermer les inscriptions »", exact: true }).waitFor()
        await page.getByLabel(/^Titre/).fill("Fermer les inscriptions")
        await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true }))
        await page.getByText("Fermer les inscriptions", { exact: true }).first().scrollIntoViewIfNeeded()
      })

      await scene("toggle", async (at) => {
        const checkbox = page.getByRole("checkbox", { name: "Fermer les inscriptions", exact: true }).first()
        await checkbox.scrollIntoViewIfNeeded()
        const box = await checkbox.boundingBox()
        if (!box) throw new Error("Milestone checkbox must be visible")
        const detailStart = Math.round(performance.now() - startedAt)
        detailFrames.push({ startMs: detailStart, endMs: detailStart + durations.get("toggle")!, x: Math.max(0, Math.min(640, Math.floor(box.x - 60))), y: Math.max(0, Math.min(400, Math.floor(box.y - 100))), width: 640, height: 400 })
        await at("Quand une étape est terminée")
        const finishSaved = page.waitForResponse(r => r.url().includes(`/api/admin/events/${featureEventId}/milestones/`) && r.request().method() === "PATCH" && r.ok())
        await tap(page, checkbox)
        await finishSaved; await checkbox.waitFor({ state: "visible" }); await settle(page)
        if (!(await checkbox.isChecked())) throw new Error("Milestone did not become finished after the click")
        await at("Si la situation change")
        const reopenSaved = page.waitForResponse(r => r.url().includes(`/api/admin/events/${featureEventId}/milestones/`) && r.request().method() === "PATCH" && r.ok())
        await tap(page, checkbox)
        await reopenSaved; await settle(page)
        if (await checkbox.isChecked()) throw new Error("Milestone did not reopen after the click")
      })

      await scene("dashboard", async (at) => {
        await tap(page, page.getByRole("link", { name: "Tableau de bord", exact: true }).first()); await settle(page)
        await page.getByText(/1 jalon est en retard/).scrollIntoViewIfNeeded()
        const returnToMilestones = page.getByRole("link", { name: /Voir les jalons.*Fête du village de Montvert/ })
        await returnToMilestones.waitFor()
        await at("Les jalons à venir restent visibles")
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
        await page.getByRole("heading", { name: "Informations de l'événement" }).waitFor()
      })

      await scene("program", async (at) => {
        await page.getByText("Spectacles", { exact: true }).scrollIntoViewIfNeeded()
        await at(0.08)
        await tap(page, page.getByRole("button", { name: "+ Ajouter", exact: true }))
        await at("Saisissons Concert du village")
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
        await at("Créons une page Ce qu’il faut apporter")
        await tap(page, page.getByRole("link", { name: "Partage", exact: true }))
        await tap(page, page.getByRole("link", { name: "Pages d'information", exact: true }))
        await settle(page)
        await page.getByRole("heading", { name: "Pages d'information", exact: true }).waitFor()
        await at(0.05)
        await tap(page, page.getByRole("button", { name: "+ Ajouter une page", exact: true }))
        const form = page.getByRole("dialog", { name: "Nouvelle page", exact: true })
        await typeNaturally(page, form.getByLabel(/^Titre/), "Ce qu’il faut apporter")
        await at("Saisissons une courte liste")
        await tap(page, form.getByLabel(/Contenu/))
        await form.getByLabel(/Contenu/).pressSequentially("# Bien préparer sa mission\n\n- **Chaussures fermées**\n- Une veste", { delay: 45 })
        await at("Saisissons une courte liste")
        await tap(page, form.getByRole("button", { name: "Enregistrer", exact: true }))
        await form.waitFor({ state: "hidden" })
        if (await page.getByRole("listitem").filter({ hasText: "Ce qu’il faut apporter" }).count() !== 1) throw new Error("Expected one newly created practical page")
      })

      await scene("page-order", async (at) => {
        await at("Faisons monter Ce qu’il faut apporter")
        const saved = page.waitForResponse(response => response.url().endsWith(`/api/admin/events/${featureEventId}/pages/reorder`) && response.request().method() === "POST")
        await tap(page, page.getByRole("button", { name: "Monter la page « Ce qu’il faut apporter »", exact: true }))
        if (!(await saved).ok()) throw new Error("Page order was not saved")
        await at("Ouvrons ensuite Modifier")
        await tap(page, page.getByRole("button", { name: "Modifier la page « Ce qu’il faut apporter »", exact: true }))
        const form = page.getByRole("dialog", { name: "Modifier la page", exact: true })
        await tap(page, form.getByLabel(/Contenu/))
        await form.getByLabel(/Contenu/).press("End")
        await form.getByLabel(/Contenu/).pressSequentially("\n- Une gourde", { delay: 120 })
        await at("Ouvrons ensuite Modifier")
        await tap(page, form.getByRole("button", { name: "Enregistrer", exact: true }))
        await form.waitFor({ state: "hidden" })
        await at("Pour supprimer une page")
        await tap(page, page.getByRole("button", { name: "Supprimer la page « Ce qu’il faut apporter »", exact: true }))
        const confirmation = page.getByRole("alertdialog")
        await confirmation.waitFor()
        await at("vérifions-la sans perdre notre contenu")
        await tap(page, confirmation.getByRole("button", { name: "Annuler", exact: true }))
      })

      await scene("public", async (at) => {
        // The public page links are relative. A host carrying the organization is
        // required, just as in production; ?org= on localhost isn't propagated by
        // those links. Chromium resolves *.localhost to loopback, never the network.
        const publicOrigin = "https://formation-pages.benevol.app"
        await page.goto(`${publicOrigin}/${eventSlug}`); await settle(page)
        await page.getByText(/Concert du village/).first().scrollIntoViewIfNeeded()
        await at(0.33)
        const link = page.getByRole("link", { name: "Ce qu’il faut apporter", exact: true })
        await link.scrollIntoViewIfNeeded()
        await at("Ouvrons Ce qu’il faut apporter")
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
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/share`); await settle(page)
        await at("Le QR code mène")
        await tap(page, page.getByRole("link", { name: "QR code", exact: true }))
        await settle(page)
        await page.getByRole("heading", { name: "QR code" }).waitFor()
        for (const [fraction, format] of [[0.20, "PNG"], [0.38, "SVG"]] as const) {
          await at(fraction)
          const pending = page.waitForEvent("download")
          await tap(page, page.getByRole("link", { name: `Télécharger ${format}`, exact: true }))
          const download = await pending
          if (!download.suggestedFilename().toLowerCase().endsWith(`.${format.toLowerCase()}`)) throw new Error("Unexpected QR download format")
          await download.saveAs(path.join(dir, `qr-demo.${format.toLowerCase()}`))
        }
        await at("La commande Imprimer")
        await page.getByRole("button", { name: "Imprimer" }).focus()
      })

      await scene("result", async (at) => {
        await page.getByAltText(/QR code vers/).scrollIntoViewIfNeeded()
        await at(0.62)
        await page.getByText("Scanner pour s'inscrire").scrollIntoViewIfNeeded()
      })
    } else if (slug === "event-duplicate") {
      await page.goto(`${baseUrl}/admin/events/${featureEventId}`); await settle(page)
      await scene("welcome", async at => {
        await page.screencast.showChapter(manifest.title, { description: "Reprendre la structure, jamais les engagements", duration: 2_300 })
        await at("La copie reste un nouveau brouillon")
        await tap(page, page.getByRole("button", { name: "Autres actions", exact: true }))
        await tap(page, page.getByRole("link", { name: "Dupliquer", exact: true }))
        await page.getByRole("heading", { name: /Dupliquer/ }).waitFor()
      })

      await scene("identity", async (at) => {
        const title = page.getByLabel("Titre de la copie")
        await title.scrollIntoViewIfNeeded()
        await at("Commencez par donner le titre")
        await fillVisibly(page, title, "Fête du village de Montvert 2027", 300)
        // Non-ambiguous date makes the day/month order reviewable in the pilot.
        await fillVisibly(page, page.getByLabel("Premier jour de la copie"), "2027-11-28", 1_100)
        await page.getByLabel("Premier jour de la copie").blur()
        await page.screenshot({ path: path.join(dir, "date-locale-check.png") })
        await at("Le résumé indique immédiatement de")
        await page.getByRole("listitem").filter({ hasText: /^Toutes les dates décalées de/ }).scrollIntoViewIfNeeded()
      })

      await scene("choices", async (at) => {
        await page.getByRole("group", { name: "Ce qui est copié" }).scrollIntoViewIfNeeded()
        await at(0.22) /* mid-sentence */
        await page.getByRole("checkbox", { name: "Les créneaux" }).hover()
        await at("Les paramètres reprennent les messages")
        await page.getByRole("checkbox", { name: "Les messages et paramètres d'inscription" }).hover()
        await at("Les pages personnalisées peuvent aussi")
        await page.getByRole("checkbox", { name: "Les pages personnalisées" }).hover()
      })

      await scene("leaders", async (at) => {
        const leaders = page.getByRole("checkbox", { name: "Les responsables de secteur" })
        await leaders.scrollIntoViewIfNeeded()
        await at("Activez cette option seulement après")
        await tap(page, leaders)
        await at(0.72) /* mid-sentence */
        await page.getByText(/chacun reçoit tout de suite un email/).scrollIntoViewIfNeeded()
      })

      await scene("summary", async (at) => {
        await page.getByRole("heading", { name: "Ce que vous allez créer" }).scrollIntoViewIfNeeded()
        await at("les inscriptions et les jalons.")
        await page.getByText(/Les inscriptions et les jalons ne sont jamais copiés/).scrollIntoViewIfNeeded()
      })

      let copyId = ""
      let copiedInvitationIds = new Set<string>()
      await scene("create", async (at) => {
        const mailbox = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json() as { messages: { ID: string }[] }
        copiedInvitationIds = new Set(mailbox.messages.map(mail => mail.ID))
        await at("Créons la copie")
        await tap(page, page.getByRole("button", { name: "Créer la copie" }))
        await page.waitForURL(/\/admin\/events\/[^/]+$/)
        copyId = new URL(page.url()).pathname.split("/").at(-1) ?? ""
        await page.getByRole("heading", { name: "Fête du village de Montvert 2027" }).waitFor()
        await at("Elle s’ouvre dans l’administration")
        await page.getByText("Prêt à publier", { exact: true }).first().scrollIntoViewIfNeeded()
        await at("Vérifions ses paramètres")
        await page.goto(`${baseUrl}/admin/events/${copyId}/edit`); await settle(page)
        await page.getByRole("checkbox", { name: "Inscriptions ouvertes" }).scrollIntoViewIfNeeded()
        if (await page.getByRole("checkbox", { name: "Inscriptions ouvertes" }).isChecked()) throw new Error("Copied event registrations must be closed")
      })

      await scene("copied-details", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${copyId}/shifts`); await settle(page)
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
        await at("ouvrons leur liste dans cette nouvelle édition")
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
        await at("Ouvrons le message réellement arrivé")
        await page.goto(`http://localhost:48026/view/${invitationId}`); await settle(page)
        await page.frameLocator("iframe").locator('a[href*="/leader/"]').first().waitFor()
      })

      await scene("result", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${copyId}/shifts`); await settle(page)
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
        await at("La duplication accélère la préparation")
        await page.getByText("Buvette", { exact: true }).first().scrollIntoViewIfNeeded()
      })
    } else if (slug === "event-visibility-registration-window") {
      const saveVisibility = async (action: () => Promise<unknown>) => {
        const saved = page.waitForResponse(response => response.request().method() === "PATCH" && new URL(response.url()).pathname === `/api/admin/events/${featureEventId}`)
        await action()
        const response = await saved
        if (!response.ok()) throw new Error(`Visibility save failed: ${response.status()}`)
        await page.getByText(/^Modifications enregistrées à/).waitFor({ state: "attached" })
      }
      await page.goto(`${baseUrl}/admin/events/${featureEventId}/edit`); await settle(page)
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Qui voit la page, et quand peut-on s’inscrire ?", duration: 2_300 })
        await page.getByRole("heading", { name: "Informations de l'événement" }).waitFor()
      })

      await scene("statuses", async (at) => {
        const status = page.getByLabel("Statut")
        await status.scrollIntoViewIfNeeded()
        await at("Brouillon signifie invisible au public")
        await saveVisibility(() => status.selectOption("draft"))
        await at("Publié rend la page accessible")
        await saveVisibility(() => status.selectOption("published"))
        await at("Un événement ne peut passer à Publié")
        await page.getByText(/Un événement ne peut être publié qu'avec au moins un créneau/).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Partager uniquement par lien", { description: "Publié, mais absent de la liste publique", duration: 1_400 })
      await scene("unlisted", async (at) => {
        const listed = page.getByRole("checkbox", { name: /Afficher cet événement sur la page publique/ })
        await listed.scrollIntoViewIfNeeded()
        await at(0.30)
        if (await listed.isChecked()) await saveVisibility(() => tap(page, listed))
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
        await at("Indiquons une ouverture et une fermeture")
        await saveVisibility(() => fillVisibly(page, open, local(2), 1_000))
        await saveVisibility(() => fillVisibly(page, page.getByLabel("Fermeture programmée (facultatif)"), local(5), 1_000))
        await at(0.72)
        await page.getByText(/Heures du fuseau de l'organisation/).scrollIntoViewIfNeeded()
      })

      // The fully rendered public page can keep background requests open.
      // Wait for its actual content instead of network idleness.
      await page.goto(`${baseUrl}/${eventSlug}?org=${encodeURIComponent(org)}`, { waitUntil: "domcontentloaded" })
      await page.getByRole("heading", { name: "Fête du village de Montvert", exact: true }).waitFor()
      await page.getByText(/inscriptions ouvrent le/i).waitFor()
      await page.evaluate(() => document.fonts.ready)
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
        await at("Après l’événement")
        await saveVisibility(() => status.selectOption("archived"))
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
        await page.getByRole("heading", { name: "Vérifier avant publication" }).waitFor()
      })

      await scene("checks", async (at) => {
        const checks = page.locator("section[aria-labelledby=review-checks]").getByRole("list")
        await checks.scrollIntoViewIfNeeded()
        await at("Un point obligatoire manquant bloque")
        await page.getByRole("button", { name: "Publier", exact: true }).scrollIntoViewIfNeeded()
        await at("Les lignes facultatives, comme le lieu")
        const optional = checks.getByText(/Facultatif/).first()
        if (await optional.isVisible()) await optional.scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Le parcours bénévole complet", { description: "Une simulation sans inscription réelle", duration: 1_400 })
      await scene("preview-start", async (at) => {
        await tap(page, page.getByRole("link", { name: "Prévisualiser comme un bénévole" }))
        await page.waitForURL(/\/preview$/)
        await page.getByText(/Aperçu : la page telle que la verront les bénévoles/).waitFor()
        await at("On vérifie d’abord l’en-tête, le")
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).scrollIntoViewIfNeeded()
        await at(0.72) /* mid-sentence */
        await page.getByText("Place du Collège, Montvert").first().scrollIntoViewIfNeeded()
      })

      await scene("preview-form", async (at) => {
        await at("Sélectionnons un créneau et poursuivons")
        await tap(page, page.getByRole("button", { name: /^09h–12h \d+\/\d+, Accueil : sélectionner/ }))
        await at("Sélectionnons un créneau et poursuivons")
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        await page.getByRole("heading", { name: "Tes informations" }).waitFor()
        await at("Pour ce test, renseignons une identité fictive")
        await fillVisibly(page, page.getByRole("textbox", { name: "Prénom", exact: true }), "Alex", 300)
        await fillVisibly(page, page.getByRole("textbox", { name: "Nom", exact: true }), "Martin", 300)
        await at("Ajoutons son adresse email de")
        await fillVisibly(page, page.getByRole("textbox", { name: "Email", exact: true }), "alex.preview@example.org", 300)
        await fillVisibly(page, page.getByRole("textbox", { name: /^Téléphone/, exact: true }), "079 000 12 34", 300)
        await at("Choisissons aussi une taille de t-shirt")
        await tap(page, page.getByRole("radio", { name: "M", exact: true }))
        if (!await page.getByRole("radio", { name: "M", exact: true }).isChecked()) throw new Error("The demonstrated t-shirt size must actually be selected")
        await at("Acceptons cette convention")
        await tap(page, page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox"))
        await tap(page, page.getByRole("checkbox", { name: /^J'accepte que l'association qui organise cet événement/ }))
      })

      await scene("preview-result", async (at) => {
        await at(0.08) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: "Voir la confirmation (aperçu)" }))
        await page.getByRole("heading", { name: /Aperçu de la confirmation/ }).waitFor()
        await at("C’est ici qu’on repère un")
        await page.getByRole("heading", { name: /Email de confirmation/ }).scrollIntoViewIfNeeded()
      })

      await scene("publish", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/review`); await settle(page)
        await page.getByRole("heading", { name: "Publication", exact: true }).scrollIntoViewIfNeeded()
        await at("Revenons à la vérification et publions")
        await tap(page, page.getByRole("button", { name: "Publier" }))
        await page.getByText("L'événement est publié : les bénévoles peuvent s'inscrire.").waitFor()
        await at(0.76) /* mid-sentence */
        await page.getByText(/Lien à partager/).scrollIntoViewIfNeeded()
      })

      await scene("result", async (at) => {
        await page.getByRole("heading", { name: "Publication", exact: true }).scrollIntoViewIfNeeded()
        await at("Publier ouvre l’accès ")
        await tap(page, page.getByRole("link", { name: "Partage", exact: true }))
        await page.getByRole("link", { name: "QR code", exact: true }).scrollIntoViewIfNeeded()
        await at(0.66) /* mid-sentence */
        await tap(page, page.getByRole("link", { name: "Inscriptions", exact: true }))
        await page.getByRole("link", { name: "Invitations", exact: true }).scrollIntoViewIfNeeded()
      })
    } else if (slug === "event-create-template") {
      let templateEventId = ""
      await scene("welcome", async () => {
        await page.screencast.showChapter(manifest.title, { description: "Une base prête à adapter", duration: 2_300 })
        await tap(page, page.getByRole("link", { name: "+ Nouvel événement" }))
        await page.getByRole("heading", { name: "Nouvel événement" }).waitFor()
      })

      await page.screencast.showChapter("Choisir le bon point de départ", { description: "Neuf structures courantes ou une page blanche", duration: 1_400 })
      await scene("compare", async (at) => {
        await at("Festival couvre plusieurs soirées")
        await tap(page, page.getByRole("radio", { name: /Festival sur plusieurs jours/ }))
        await at("Buvette organise")
        await tap(page, page.getByRole("radio", { name: /^Buvette/ }))
        await at("Manifestation sportive prépare")
        await tap(page, page.getByRole("radio", { name: /Manifestation sportive/ }))
        await at("Fête de village s’étale")
        await tap(page, page.getByRole("radio", { name: /Fête de village/ }))
        await at("Montage, exploitation, démontage sépare")
        await tap(page, page.getByRole("radio", { name: /Montage, exploitation, démontage/ }))
        await at("épicerie participative")
        // The four regular activities (#866): weekly permanences, presented in SHIFT_RECURRENCE.
        for (const [name, mark] of [[/Épicerie participative/, 0.74], [/Distribution alimentaire/, 0.78], [/Permanence d'accueil/, 0.82], [/Repair café/, 0.86]] as const) {
          await page.getByRole("radio", { name }).scrollIntoViewIfNeeded()
          await tap(page, page.getByRole("radio", { name }))
          await at(mark)
        }
        await page.getByRole("radio", { name: /Page blanche/ }).scrollIntoViewIfNeeded()
        await at("La page blanche reste préférable")
        await tap(page, page.getByRole("radio", { name: /Page blanche/ }))
      })

      await scene("preview", async (at) => {
        await tap(page, page.getByRole("radio", { name: /Fête de village/ }))
        await page.getByRole("heading", { name: "Fête de village", exact: true }).scrollIntoViewIfNeeded()
        await at(0.20)
        await page.getByRole("heading", { name: "Ce qui sera créé" }).scrollIntoViewIfNeeded()
        await at("Avant de continuer")
        await fillVisibly(page, page.getByLabel("Titre"), "Fête villageoise de Bellevue", 1_000)
        await at("prenons le samedi")
        await fillVisibly(page, page.getByLabel(/Premier jour/), "2026-11-21", 1_100)
        await at(0.78)
        await page.getByText(/Brouillon, non publié/).scrollIntoViewIfNeeded()
      })

      await scene("create", async (at) => {
        await at("Créer le brouillon génère")
        await tap(page, page.getByRole("button", { name: /Créer le brouillon \(10 créneaux\)/ }))
        await page.waitForURL(/\/admin\/events\/[^/]+\/shifts\?wizard=1$/)
        templateEventId = new URL(page.url()).pathname.split("/")[3]
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
        await at("Le bandeau indique Prêt à publier")
        await page.goto(`${baseUrl}/admin/events/${templateEventId}`); await settle(page)
        await page.getByText("Prêt à publier", { exact: true }).first().waitFor()
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
        await at("Ajustons par exemple")
        const capacity = editor.getByLabel("Places *")
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
        await at(0.48) /* mid-sentence */
        await tap(page, page.getByRole("radio", { name: /Page blanche/ }))
      })

      await page.screencast.showChapter("L’identité et les dates", { description: "Le cadre réel de la manifestation", duration: 1_400 })
      await scene("identity-dates", async (at) => {
        await typeNaturally(page, page.getByLabel("Titre *"), "Fête du quartier des Tilleuls")
        await fillVisibly(page, page.getByLabel("Description"), "Deux jours de rencontres, de musique et de repas partagés avec les habitantes et habitants du quartier.", 1_200)
        await at("pour cette fête sur deux")
        await fillVisibly(page, page.getByLabel("Date début *"), "2026-11-14", 1_100)
        await fillVisibly(page, page.getByLabel("Date fin *"), "2026-11-15", 1_100)
        if (await page.getByLabel("Date début *").inputValue() !== "2026-11-14" || await page.getByLabel("Date fin *").inputValue() !== "2026-11-15") throw new Error("Two-day event dates did not persist in the actual form")
        // Leave both complete native dates readable without the selected-day
        // highlight; do not replace the date picker with a fabricated overlay.
        await tap(page, page.getByLabel("Description"))
      })

      await scene("location", async (at) => {
        await fillVisibly(page, page.getByLabel("Lieu"), "Maison de quartier, 12 avenue des Tilleuls, Montvert", 1_200)
        await at("Juste dessous, collez une paire")
        await typeNaturally(page, page.getByLabel("Coordonnées GPS ou lien de carte"), "46.180573, 6.122829")
        await at(0.72) /* mid-sentence */
        await page.getByRole("link", { name: /Vérifier sur la carte/ }).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Ce que verra le bénévole", { description: "Des consignes et une confirmation utiles", duration: 1_400 })
      await scene("public-content", async (at) => {
        const instructions = page.getByText("Instructions publiques", { exact: true }).locator("xpath=following-sibling::textarea")
        await typeNaturally(page, instructions, "Entre par la cour nord. Arrive quinze minutes avant ton créneau.")
        await at(0.48) /* mid-sentence */
        const confirmation = page.getByText("Message de confirmation", { exact: true }).locator("xpath=following-sibling::textarea")
        await confirmation.fill("")
        await typeNaturally(page, confirmation, "Merci {prénom} ! Ton inscription est confirmée. Retrouve ton planning par email.")
        await at(0.78) /* mid-sentence */
        await page.getByText(/Supporte le \*\*gras\*\*/).scrollIntoViewIfNeeded()
      })

      await scene("phone-color", async (at) => {
        const phone = page.getByRole("checkbox", { name: "Téléphone obligatoire à l'inscription" })
        await phone.scrollIntoViewIfNeeded()
        await at("Rendez le téléphone obligatoire seulement")
        await tap(page, phone)
        await at("Choisissons Émeraude et regardons l’aperçu.")
        await tap(page, page.getByRole("radio", { name: /Émeraude/ }))
        await at("Ces deux paramètres pourront être")
        await page.getByText("Aperçu de l'en-tête").scrollIntoViewIfNeeded()
      })

      await scene("create", async (at) => {
        await at(0.14) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: "Créer l'événement" }))
        await page.waitForURL(/\/admin\/events\/[^/]+\/shifts\?wizard=1$/)
        createdEventId = new URL(page.url()).pathname.split("/")[3]
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
        await at(0.56) /* mid-sentence */
        await page.getByRole("navigation", { name: "Étapes de création de l'événement" }).scrollIntoViewIfNeeded()
      })

      await scene("autosave", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${createdEventId}/edit`); await settle(page)
        const description = page.getByLabel("Description")
        await description.scrollIntoViewIfNeeded()
        await at("Corrigeons la description")
        await tap(page, description)
        await description.fill("Deux jours de rencontres, de musique, de repas partagés et d’activités pour les familles du quartier.")
        await page.getByText(/^Modifications enregistrées à/).waitFor({ timeout: 10_000 })
      })

      await scene("result", async (at) => {
        await page.getByLabel("Statut").scrollIntoViewIfNeeded()
        await at(0.37) /* mid-sentence */
        await page.getByText(/Un événement ne peut être publié qu'avec au moins un créneau/).scrollIntoViewIfNeeded()
        await at("Retrouvons-le dans les événements")
        await page.goto(`${baseUrl}/admin/events`); await settle(page)
        await page.getByRole("link", { name: "Fête du quartier des Tilleuls", exact: true }).scrollIntoViewIfNeeded()
      })
    } else if (slug === "org-team-permissions") {
      await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
      await scene("welcome", async (at) => {
        await page.screencast.showChapter(manifest.title, { description: "Le bon accès pour chaque personne", duration: 2_300 })
        await page.getByRole("heading", { name: /^Organisateurs/ }).waitFor()
        await at("Ici, trois personnes sont déjà")
        await page.getByText("Samira Diallo", { exact: true }).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Deux rôles complémentaires", { description: "Protéger les paramètres sans bloquer l’équipe", duration: 1_400 })
      await scene("roles", async (at) => {
        await at("L’organisateur prépare les événements, les")
        await tap(page, page.getByRole("button", { name: "Inviter" }))
        await page.getByRole("heading", { name: "Inviter un organisateur" }).waitFor()
        await at(0.34) /* mid-sentence */
        await page.getByText(/Tous les droits, dont l'équipe/).scrollIntoViewIfNeeded()
        await at("désigné pour un événement, il")
        await page.getByText(/Événements, créneaux, inscriptions/).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
      await scene("invite", async (at) => {
        await at("Pour inviter Léa, ouvrez le")
        await tap(page, page.getByRole("button", { name: "Inviter" }))
        const form = page.getByRole("heading", { name: "Inviter un organisateur" }).locator("xpath=ancestor::form")
        await fillVisibly(page, form.getByLabel("Nom"), "Léa Martin")
        await fillVisibly(page, form.getByLabel("Email"), "video.team.lea@example.org")
        await at("Prenons Organisateur")
        await tap(page, form.getByRole("radio", { name: /Organisateur/ }))
        await at("Cliquez sur Envoyer l’invitation ")
        await tap(page, form.getByRole("button", { name: "Envoyer l'invitation" }))
        await page.getByRole("status").filter({ hasText: "Invitation envoyée à video.team.lea@example.org. Le lien d'activation, valable 7 jours, lui a été envoyé par email." }).waitFor()
      })

      await scene("invite-result", async (at) => {
        await at("La confirmation indique")
        await page.getByRole("status").filter({ hasText: "Invitation envoyée à video.team.lea@example.org." }).scrollIntoViewIfNeeded()
        if (await page.getByRole("button", { name: "Copier le lien", exact: true }).count()) throw new Error("Owner must never receive the activation link")
        await at("Son accès ne devient actif")
        await page.getByText("Léa Martin", { exact: true }).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Faire évoluer un rôle", { description: "Choisir, puis confirmer explicitement", duration: 1_400 })
      await scene("change-role", async (at) => {
        const row = page.locator("div.px-4.py-3").filter({ hasText: "Léa Martin" })
        const role = row.getByLabel("Rôle de Léa Martin")
        await role.scrollIntoViewIfNeeded()
        await at("On choisit d’abord Propriétaire dans")
        await role.selectOption("admin")
        // Measured Puck WAV: sentence 1.716–5.509 s; short-clip ASR verifies
        // « puis on confirme avec Appliquer » in 3.75–5.23 s. Target its centre
        // (4.49 s), minus tap’s 420 ms pointer lead: cue 4.07 / 17.147.
        // Retain the sentence anchor; check the actual input time in rehearsal.
        await at("On choisit d’abord Propriétaire dans")
        await at(4.07 / 17.147) /* mid-sentence: measured clause, including tap pointer lead */
        await tap(page, row.getByRole("button", { name: /Appliquer/ }))
        await page.getByRole("status").filter({ hasText: /Léa Martin : propriétaire/ }).waitFor()
        await at(0.74) /* mid-sentence */
        await page.getByText("Léa Martin", { exact: true }).scrollIntoViewIfNeeded()
      })

      await scene("organizer-view", async (at) => {
        await page.context().clearCookies()
        await page.goto(`${baseUrl}/admin/login`); await settle(page)
        await page.getByLabel("Email").fill("video.team.samira@example.org")
        await page.getByLabel("Mot de passe").fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
        await tap(page, page.getByRole("button", { name: "Se connecter" }))
        await page.waitForURL(/\/admin\/(events|dashboard)/)
        await at(0.48) /* mid-sentence */
        await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
        await page.getByText(/Votre rôle : organisateur\. Seuls les propriétaires/).waitFor()
        await at(0.76) /* mid-sentence */
        await page.getByText(/Seuls les propriétaires invitent/).scrollIntoViewIfNeeded()
      })

      await scene("limits", async (at) => {
        await page.getByText(/Votre rôle : organisateur\. Seuls les propriétaires/).scrollIntoViewIfNeeded()
        await at(0.48) /* mid-sentence */
        await page.getByText(/Seuls les propriétaires invitent/).scrollIntoViewIfNeeded()
        await at(0.74) /* mid-sentence */
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
        await page.getByRole("heading", { name: "Paramètres des emails" }).waitFor()
      })

      await page.screencast.showChapter("Les rappels automatiques", { description: "Choisir les moments vraiment utiles", duration: 1_400 })
      await scene("reminders", async (at) => {
        const group = page.getByRole("group", { name: "Rappels automatiques aux bénévoles inscrits" })
        await group.scrollIntoViewIfNeeded()
        const box = await group.boundingBox()
        if (!box) throw new Error("Reminder controls are not visible")
        const detailStart = Math.round(performance.now() - startedAt)
        detailFrames.push({ startMs: detailStart, endMs: detailStart + 1, x: Math.max(0, Math.min(640, Math.floor(box.x - 25))), y: Math.max(0, Math.min(400, Math.floor(box.y - 35))), width: 640, height: 400 })
        await at("Décochons puis recochons le premier rappel")
        const j2 = page.getByRole("checkbox", { name: /Rappel J-2/ })
        if (await j2.isChecked()) await tap(page, j2)
        await at("Décochons puis recochons le premier rappel")
        await page.waitForTimeout(650)
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
        await at("Son onglet Messages")
        await page.goto(`${baseUrl}/admin/events/${emailEventId}/message`); await settle(page)
        await page.getByRole("heading", { name: "Messages", exact: true }).scrollIntoViewIfNeeded()
        await page.getByText("Rappels automatiques coupés pour cet événement", { exact: true }).waitFor()
      })

      await scene("admin-alert", async (at) => {
        await page.goto(`${baseUrl}/admin/settings/notifications`); await settle(page)
        const alert = page.getByRole("checkbox", { name: /Prévenir les organisateurs/ })
        await alert.scrollIntoViewIfNeeded()
        await at(0.30)
        if (await alert.isChecked()) await tap(page, alert)
        await at(0.62)
        await tap(page, alert)
      })

      await scene("withdrawal", async (at) => {
        const checkbox = page.getByRole("checkbox", { name: "Prévenir en cas de désistement", exact: true })
        await checkbox.scrollIntoViewIfNeeded()
        await at("Décocher cette option coupe aussi")
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
        await at("Saisissons benevoles arobase example point org")
        await tap(page, replyTo)
        await replyTo.fill("")
        await replyTo.pressSequentially("benevoles@example.org", { delay: 115 })
        if (await replyTo.inputValue() !== "benevoles@example.org") throw new Error("Reply address must be fully entered before showing its result")
        await at(0.72)
        await page.getByText(/Cette adresse figure aussi sur la page « Mes inscriptions »/).scrollIntoViewIfNeeded()
      })

      await scene("save", async (at) => {
        await at("Enregistrez les paramètres avant de les tester")
        await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true }))
        await page.getByRole("status").filter({ hasText: "Paramètres enregistrés." }).waitFor()
        await at("Le message Paramètres enregistrés")
        await page.getByRole("status").filter({ hasText: "Paramètres enregistrés." }).scrollIntoViewIfNeeded()
      })

      await page.screencast.showChapter("Tester avant d’envoyer", { description: "Contrôler le transport et l’expéditeur", duration: 1_400 })
      await scene("test", async (at) => {
        const inboxBefore = await (await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")).json() as { messages: { ID: string }[] }
        const priorIds = new Set(inboxBefore.messages.map(mail => mail.ID))
        const testButton = page.getByRole("button", { name: "M'envoyer un email de test" })
        await testButton.scrollIntoViewIfNeeded()
        await at("M’envoyer un email de test")
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
        await at("Ouvrons le message reçu")
        await page.goto(`http://localhost:48026/view/${mailId}`); await settle(page)
        await page.frameLocator("iframe").locator("body").getByText(/Cet email vérifie l'envoi/).filter({ visible: true }).waitFor()
        const detailStart = Math.round(performance.now() - startedAt)
        detailFrames.push({ startMs: detailStart, endMs: detailStart + 1, x: 300, y: 0, width: 960, height: 600 })
      })

      await scene("result", async (at) => {
        await at("Les paramètres sont enregistrés")
        await page.goto(`${baseUrl}/admin/settings/notifications`); await settle(page)
        await page.getByRole("heading", { name: "Paramètres des emails" }).waitFor()
        await at("Dans Emails envoyés")
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

      await scene("basics", async (at) => {
        await at("Donnez-lui un nom clair")
        await fillVisibly(page, page.getByLabel("Titre *"), "Fête des voisins", 200)
        await fillVisibly(page, page.getByLabel("Description"), "Une journée conviviale organisée par le quartier.", 200)
        await fillVisibly(page, page.getByLabel("Lieu"), "Place du village, Montvert", 200)
        await fillVisibly(page, page.getByLabel("Date début *"), "2031-05-10", 200)
        await fillVisibly(page, page.getByLabel("Date fin *"), "2031-05-10", 200)
        const create = page.getByRole("button", { name: "Créer l'événement" })
        await create.scrollIntoViewIfNeeded()
        await tap(page, create)
        await page.waitForURL(/\/admin\/events\/[^/]+\/shifts\?wizard=1$/)
        organizerEventId = new URL(page.url()).pathname.split("/")[3]
      })

      await scene("series", async (at) => {
        await at("Quand les horaires se répètent")
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
        await fillVisibly(page, editor.getByLabel("Libellé"), "Livraison — permis B requis", 400)
        await fillVisibly(page, editor.getByLabel("Début *"), "09:00", 400)
        await fillVisibly(page, editor.getByLabel("Fin *"), "12:00", 400)
        await fillVisibly(page, editor.getByLabel("Âge minimum (optionnel)"), "18", 400)
        await fillVisibly(page, editor.getByLabel("Description"), "Permis B valide obligatoire", 400)
        await fillVisibly(page, editor.getByLabel("Consigne pratique"), "Permis de conduire valide obligatoire. Véhicule fourni.", 400)
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
        await page.getByText(/^Modifications enregistrées à/).waitFor({ timeout: 10_000 })
        await page.getByText(/Heures du fuseau de l'organisation/).scrollIntoViewIfNeeded()
      })

      await scene("review", async () => {
        await page.goto(`${baseUrl}/admin/events/${organizerEventId}/review`)
        await page.waitForURL(/\/review$/)
        await page.getByText("4 créneaux, 3 postes, 8 places").first().scrollIntoViewIfNeeded()
      })

      await scene("preview", async (at) => {
        await tap(page, page.getByRole("link", { name: "Prévisualiser comme un bénévole" }))
        await page.waitForURL(/\/preview$/)
        await page.getByText(/Aperçu : la page telle que la verront les bénévoles/).waitFor()
        const previewShift = page.getByRole("button", { name: /, Accueil[^:]* : sélectionner/ }).first()
        await at("Choisissez un créneau")
        await tap(page, previewShift)
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        await page.getByRole("heading", { name: "Tes informations" }).waitFor()
        await fillVisibly(page, page.getByRole("textbox", { name: "Prénom", exact: true }), "Alex", 180)
        await fillVisibly(page, page.getByRole("textbox", { name: "Nom", exact: true }), "Martin", 180)
        await fillVisibly(page, page.getByRole("textbox", { name: "Email", exact: true }), "alex.martin@example.org", 180)
        const charter = page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox")
        await tap(page, charter)
        const privacy = page.getByRole("checkbox", { name: /^J'accepte que l'association qui organise cet événement/ })
        await tap(page, privacy)
        await tap(page, page.getByRole("button", { name: "Voir la confirmation (aperçu)" }))
        await page.getByRole("heading", { name: /Aperçu de la confirmation/ }).waitFor()
      })

      await scene("preview-result", async (at) => {
        await page.getByText("Message affiché après l'inscription").scrollIntoViewIfNeeded()
        await page.waitForTimeout(1_400)
        await page.getByRole("heading", { name: /Email de confirmation/ }).scrollIntoViewIfNeeded()
        await page.waitForTimeout(1_400)
        await at("Rien n’est réellement enregistré")
        await page.goto(`${baseUrl}/admin/events/${organizerEventId}/review`)
        await settle(page)
      })

      await scene("publish", async () => {
        await tap(page, page.getByRole("button", { name: "Publier" }))
        await page.getByText("L'événement est publié : les bénévoles peuvent s'inscrire.").waitFor()
        organizerPublicUrl = (await page.getByText("Lien à partager :", { exact: false }).locator("span").textContent())?.trim() ?? ""
        if (!organizerPublicUrl) throw new Error("Published event has no public URL")
      })

      await scene("qr", async () => {
        await tap(page, page.getByRole("link", { name: "Partage", exact: true }))
        await tap(page, page.getByRole("link", { name: "QR code", exact: true }))
        await page.getByRole("heading", { name: "QR code", exact: true }).waitFor()
        await page.getByText("Scanner pour s'inscrire").scrollIntoViewIfNeeded()
      })

      await scene("import", async (at) => {
        await page.goto(`${baseUrl}/admin/members`)
        await tap(page, page.getByRole("button", { name: "Importer CSV/Excel" }))
        const csv = [
          "Prénom,Nom,Email,Téléphone,Étiquettes",
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
        await page.getByLabel("Choisir un fichier CSV ou Excel").setInputFiles({ name: "membres-fete.csv", mimeType: "text/csv", buffer: Buffer.from(csv) })
        await at("L’application analyse les colonnes")
        await tap(page, page.getByRole("button", { name: "Analyser le fichier" }))
        await page.getByText("Analyse du fichier, rien n'est encore enregistré.").waitFor()
        await at(0.86) /* mid-sentence: confirm after the analysis explanation */
        await tap(page, page.getByRole("button", { name: "Importer 12 membres" }))
        await page.getByText(/Import terminé :/).waitFor()
        await tap(page, page.getByRole("button").filter({ hasText: /^Fermer$/ }))
        await page.getByText("Sophie").first().waitFor()
      })

      await scene("invite", async (at) => {
        await page.goto(`${baseUrl}/admin/events/${organizerEventId}/invitations`)
        await tap(page, page.getByRole("button", { name: "+ Inviter des membres" }))
        await at("Filtrez les membres par étiquette")
        await page.getByLabel("Filtrer par étiquette").selectOption("caisse")
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
        const show = async (name: string, fraction: number) => {
          await at(fraction)
          await page.getByRole("heading", { name, exact: true }).evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }))
        }
        await show("Adresse de votre espace", 0.12)
        await show("Titre de la page publique", 0.48)
        await show("Fuseau horaire", 0.68)
        await show("Charte des bénévoles", 0.82)
      })

      await scene("team", async (at) => {
        await at(0.05) /* mid-sentence */
        await page.getByRole("heading", { name: /^Organisateurs/ }).scrollIntoViewIfNeeded()
        await at("Les responsables de secteur reçoivent")
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/sector-leaders`); await settle(page)
        await page.getByRole("heading", { name: "Responsables de secteur" }).waitFor()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}`); await settle(page)
      await page.screencast.showChapter("Préparer l’événement", { description: "Publication, inscriptions et apparence", duration: 1_400 })
      await scene("lifecycle", async (at) => {
        await page.getByRole("heading", { name: "Fête du village de Montvert" }).waitFor()
        await at("Un événement suit un cycle")
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/edit`); await settle(page)
        await page.getByText("Visibilité", { exact: true }).scrollIntoViewIfNeeded()
        await at("Même publié, il peut rester")
        await at("Les inscriptions peuvent être immédiates")
        await page.getByText("Inscriptions", { exact: true }).last().scrollIntoViewIfNeeded()
      })

      await scene("appearance", async (at) => {
        await at(0.08) /* mid-sentence */
        const editHeading = page.getByRole("heading", { name: "Informations de l'événement" })
        if (await editHeading.isVisible()) await editHeading.scrollIntoViewIfNeeded()
        await at(0.35) /* mid-sentence: color in the first sentence */
        await page.getByText("Couleur de la page d'inscription").scrollIntoViewIfNeeded()
        await at("Le lieu peut recevoir des")
        await page.getByLabel("Lieu").scrollIntoViewIfNeeded()
        const coordinates = page.getByText(/coordonnées/i).first()
        if (await coordinates.isVisible()) await coordinates.scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/duplicate`); await settle(page)
      await scene("duplicate", async (at) => {
        await page.getByRole("heading", { name: "Dupliquer l'événement" }).waitFor()
        await at("Vous choisissez ce qui est repris")
        await page.getByRole("checkbox", { name: /Les responsables de secteur/ }).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/shifts`)
      await settle(page)
      await page.screencast.showChapter("Construire le planning", { description: "Postes, créneaux et horaires", duration: 1_400 })
      await scene("shift-methods", async (at) => {
        await page.getByRole("heading", { name: "Créneaux" }).waitFor()
        await at(0.10) /* mid-sentence */
        const listButton = page.getByRole("button", { name: "Liste" })
        if (await listButton.isVisible()) await tap(page, listButton)
        await at("ajouter un créneau depuis la")
        await tap(page, page.getByRole("button", { name: "+ Ajouter un créneau" }))
        const quickEditor = page.getByRole("group", { name: "Nouveau créneau" })
        await at("ajouter un créneau depuis la")
        await tap(page, quickEditor.getByRole("button", { name: "Annuler" }))
        await at(0.30) /* mid-sentence */
        const timelineButton = page.getByRole("button", { name: "Frise", exact: true })
        if (await timelineButton.isVisible()) await tap(page, timelineButton)
        await at(0.36) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: /Montage.*modifier/i }).first())
        await at(0.42) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: "Dupliquer" }))
        await at(0.49) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: "Fermer et enregistrer" }))

        await at(0.55) /* mid-sentence */
        const firstPlanning = page.getByRole("region", { name: /Planning du/ }).first()
        const firstRow = firstPlanning.locator(".cursor-crosshair").first()
        const rowBox = await firstRow.boundingBox()
        if (!rowBox) throw new Error("Timeline row is not visible")
        const beforeDraw = await firstPlanning.locator("[data-shift-bar]").count()
        const drawFrom = { x: Math.min(rowBox.x + rowBox.width - 180, rowBox.x + 720), y: rowBox.y + rowBox.height / 2 }
        await dragVisibly(page, drawFrom, { x: drawFrom.x + 90, y: drawFrom.y })
        await page.waitForFunction((before) => document.querySelectorAll('[role="region"][aria-label^="Planning du"] [data-shift-bar]').length > before, beforeDraw)

        await at(0.66) /* mid-sentence: widen the bar before the series sentence */
        const newBar = firstRow.locator("[data-shift-bar]").last()
        const resizeHandle = newBar.locator(".cursor-ew-resize").last()
        const handleBox = await resizeHandle.boundingBox()
        if (!handleBox) throw new Error("Timeline resize handle is not visible")
        const resizeFrom = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 }
        await dragVisibly(page, resizeFrom, { x: resizeFrom.x + 48, y: resizeFrom.y })

        await at("Pour des horaires répétitifs, la")
        await tap(page, page.getByRole("button", { name: "Créer une série" }))
      })

      await scene("shift-fields", async (at) => {
        await tap(page, page.getByRole("button", { name: "+ Ajouter un créneau" }))
        const editor = page.getByRole("group", { name: "Nouveau créneau" })
        await at(0.12) /* mid-sentence */
        await editor.getByLabel("Poste *").scrollIntoViewIfNeeded()
        await at(0.48) /* mid-sentence */
        await editor.getByLabel("Lieu de rendez-vous").scrollIntoViewIfNeeded()
        await at(0.70) /* mid-sentence: minimum age ends the field description */
        await editor.getByLabel("Âge minimum (optionnel)").scrollIntoViewIfNeeded()
        await at("La liste d’attente et l’inscription")
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
        await at("taille de t-shirt, régime alimentaire")
        await tap(page, page.getByRole("button", { name: "Ajouter une question" }))
        await at(0.30) /* mid-sentence */
        await fillVisibly(page, page.getByLabel("Question posée aux bénévoles *"), "Taille de t-shirt")
        await at(0.54) /* mid-sentence */
        await page.getByLabel("Type de réponse").selectOption("single")
        await page.getByLabel("Choix proposés *").fill("S\nM\nL\nXL")
        await at("Une question de suivi peut")
        await page.getByLabel(/^Afficher seulement si/).scrollIntoViewIfNeeded()
        await at("Vous décidez si la réponse")
        await page.getByLabel("Réponse obligatoire").scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/pages`); await settle(page)
      await scene("pages", async (at) => {
        await page.getByRole("heading", { name: "Pages d'information" }).waitFor()
        await at(0.20) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: "+ Ajouter une page" }))
        await at("Donnez un titre et rédigez")
        await fillVisibly(page, page.getByLabel("Titre *"), "Accès bénévoles")
        await fillVisibly(page, page.getByLabel(/Contenu/), "Parking au nord. Entrée bénévoles côté scène.")
        await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true }))
        await page.getByRole("dialog", { name: "Nouvelle page" }).waitFor({ state: "hidden" })
        await at("Puis organisez leur ordre avec")
        const order = page.getByRole("list", { name: "Ordre des pages" })
        const beforeMove = await order.getByRole("listitem").allTextContents()
        const savedMove = page.waitForResponse(response => response.url().endsWith(`/api/admin/events/${featureEventId}/pages/reorder`) && response.request().method() === "POST")
        await tap(page, page.getByRole("button", { name: "Monter la page « Accès bénévoles »", exact: true }))
        if (!(await savedMove).ok()) throw new Error("Page order was not saved")
        const afterMove = await order.getByRole("listitem").allTextContents()
        if (beforeMove.join("|") === afterMove.join("|") || !afterMove[1]?.includes("Accès bénévoles")) throw new Error("Created page did not move up in the list")
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/message`); await settle(page)
      await page.screencast.showChapter("Communiquer", { description: "Messages, modèles et rappels", duration: 1_400 })
      await scene("messages", async (at) => {
        await page.getByRole("heading", { name: "Messages", exact: true }).waitFor()
        await page.getByText("Destinataires", { exact: true }).scrollIntoViewIfNeeded()
        await at("Les modèles réutilisables acceptent des")
        await page.goto(`${baseUrl}/admin/settings/message-templates`); await settle(page)
        await page.getByRole("heading", { name: "Modèles de messages" }).waitFor()
        await at("Vous choisissez un envoi immédiat")
        await page.goto(`${baseUrl}/admin/events/${featureEventId}/message`); await settle(page)
        await page.getByRole("group", { name: "Quand l'envoyer ?", exact: true }).scrollIntoViewIfNeeded()
        await at("La section Messages programmés permet")
        await page.getByRole("heading", { name: "Messages programmés", exact: true }).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/settings/notifications`); await settle(page)
      await scene("reminders", async () => {
        await page.getByRole("heading", { name: "Emails", exact: true }).waitFor()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/print`); await settle(page)
      await page.screencast.showChapter("Préparer le jour J", { description: "Rapports, listes et badges", duration: 1_400 })
      await scene("reports", async (at) => {
        await page.getByRole("heading", { name: "Documents à imprimer" }).waitFor()
        await at(0.12) /* mid-sentence */
        await page.getByRole("heading", { name: "À afficher ou à remettre aux bénévoles" }).scrollIntoViewIfNeeded()
        await at(0.30) /* mid-sentence: presence sheet and organizer-only list in the opening sentence */
        await page.getByRole("heading", { name: "Pour les organisateurs seulement", exact: true }).evaluate((element) => element.scrollIntoView({ block: "center" }))
        await at("Les badges se génèrent en")
        await page.getByRole("heading", { name: "Badges" }).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/log`); await settle(page)
      await page.screencast.showChapter("Suivre l’activité", { description: "Historique et recherche", duration: 1_400 })
      await scene("activity", async (at) => {
        await page.getByRole("heading", { name: "Journal" }).waitFor()
        await at("La recherche globale permet ensuite")
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
        await at(0.58) /* mid-sentence */
        await page.getByRole("heading", { name: "Messages", exact: true }).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/staffing`); await settle(page)
      await page.screencast.showChapter("Lire le planning", { description: "Places, demandes et listes d’attente", duration: 1_400 })
      await scene("coverage", async (at) => {
        await page.getByRole("heading", { name: "Où manque-t-il du monde ?" }).waitFor()
        await at("Les capacités et les inscriptions")
        await page.getByRole("heading", { name: /Créneaux à compléter/ }).scrollIntoViewIfNeeded()
        await at(0.62) /* mid-sentence */
        await page.getByRole("heading", { name: /Personnes en liste d'attente/ }).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations`); await settle(page)
      await scene("registrations", async (at) => {
        await page.getByRole("heading", { name: "Inscriptions" }).waitFor()
        await at(0.24) /* mid-sentence */
        await page.getByText("Camille Rochat", { exact: true }).first().scrollIntoViewIfNeeded()
        await at(0.65) /* mid-sentence */
        const answer = page.getByText(/Taille de t-shirt/).first()
        if (await answer.isVisible()) await answer.scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations?demandes=1`); await settle(page)
      await scene("requests", async (at) => {
        await page.getByText(/Demande à traiter/).first().waitFor()
        await at(0.28) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: /Accepter la demande de/ }).first())
        await page.getByRole("dialog").waitFor()
        await at("Ici, on referme simplement la fenêtre")
        await tap(page, page.getByRole("button", { name: "Annuler" }))
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/registrations`); await settle(page)
      await scene("filters", async (at) => {
        await at("Quand la liste grandit")
        const roleFilter = page.getByLabel("Filtrer par poste")
        await roleFilter.selectOption("Buvette")
        const shiftFilter = page.getByRole("combobox", { name: "Filtrer par créneau", exact: true })
        await tap(page, shiftFilter)
        await tap(page, page.getByRole("option").filter({ visible: true }).nth(1))
        await tap(page, shiftFilter)
        await tap(page, page.getByRole("option", { name: "Tous les créneaux", exact: true }).filter({ visible: true }))
        await roleFilter.selectOption("")
        await tap(page, page.getByLabel(/Demandes à traiter/))
        await tap(page, page.getByLabel(/Demandes à traiter/))
        await roleFilter.selectOption("Buvette")
        await at(0.42) /* mid-sentence */
        const registrationSearch = page.locator("#reg-search")
        await fillVisibly(page, registrationSearch, "Camille")
        await at("En quelques secondes, vous isolez")
      })
      await page.locator("#reg-search").fill("")
      await page.getByLabel("Filtrer par poste").selectOption("")

      await scene("actions", async (at) => {
        const selectCamille = page.getByLabel(/Sélectionner l'inscription de Camille Rochat/).first()
        await tap(page, selectCamille)
        await at(0.42) /* mid-sentence */
        await tap(page, page.getByLabel(/Sélectionner l'inscription de Camille Rochat/).nth(1))
        await page.getByRole("group", { name: "Actions sur la sélection" }).scrollIntoViewIfNeeded()
        await at(0.78) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: "Désélectionner" }))
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/message`); await settle(page)
      await page.screencast.showChapter("Relancer sans arroser tout le monde", { description: "Le bon message aux bonnes personnes", duration: 1_400 })
      await scene("audience", async (at) => {
        await page.getByRole("heading", { name: "Écrire aux bénévoles" }).waitFor()
        await at("tous les inscrits, un poste")
        await tap(page, page.getByLabel("Les bénévoles d'un poste"))
        await at(0.38) /* mid-sentence */
        await page.getByLabel("Poste", { exact: true }).selectOption("Buvette")
        await at("la liste d’attente")
        await tap(page, page.getByLabel("Les personnes en liste d'attente"))
        await at("ou les invités qui n’ont encore aucun créneau confirmé")
        await tap(page, page.getByLabel("Les invités sans créneau confirmé"))
        await at(0.88) /* mid-sentence */
        await tap(page, page.getByLabel("Les personnes en liste d'attente"))
      })

      await scene("message", async (at) => {
        await page.getByText(/personnes? recevr(?:a|ont) ce message/).waitFor()
        await at(0.10) /* mid-sentence */
        await page.getByLabel("Partir d'un modèle").selectOption({ label: "Point de rendez-vous" })
        await tap(page, page.getByRole("button", { name: "Utiliser ce modèle" }))
        await at("Avant d’envoyer quoi que ce")
        await tap(page, page.getByRole("button", { name: "Voir l'aperçu et envoyer" }))
        await page.getByRole("heading", { name: "Aperçu de l'email" }).waitFor()
        await at("vous contrôlez le rendu exact")
      })
      await tap(page, page.getByRole("button", { name: "Retour au message" }))

      await scene("channels", async (at) => {
        await at("Pour une information urgente, vous")
        const push = page.getByLabel("Envoyer aussi une notification (téléphone ou ordinateur)")
        await tap(page, push)
        await at(0.42) /* mid-sentence */
        await tap(page, page.getByRole("button", { name: "Voir l'aperçu et envoyer" }))
        const previewHeading = page.getByRole("heading", { name: "Aperçu de l'email" })
        await page.waitForTimeout(1_000)
        if (!(await previewHeading.isVisible())) {
          const alerts = await page.locator('[role="alert"]').allTextContents()
          const formText = await page.locator("form").last().innerText()
          throw new Error(`Message preview did not open. Alerts: ${alerts.join(" | ") || "none"}. Form: ${formText.slice(0, 800)}`)
        }
        await at("La confirmation finale évite les")
      })
      await tap(page, page.getByRole("button", { name: "Retour au message" }))

      await page.goto(`${baseUrl}/admin/settings/notifications`); await settle(page)
      await scene("reminders", async (at) => {
        await page.getByRole("heading", { name: "Emails", exact: true }).waitFor()
        await at(0.18) /* mid-sentence */
        await page.getByText("Rappels automatiques aux bénévoles inscrits").scrollIntoViewIfNeeded()
        await at(0.62) /* mid-sentence */
        await page.getByText(/Pour toute l'organisation/).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/print`); await settle(page)
      await page.screencast.showChapter("Préparer le jour J", { description: "Listes, plannings et badges", duration: 1_400 })
      await scene("reports", async (at) => {
        await page.getByRole("heading", { name: "Documents à imprimer" }).waitFor()
        await at(0.14) /* mid-sentence */
        await page.getByRole("heading", { name: "À afficher ou à remettre aux bénévoles" }).scrollIntoViewIfNeeded()
        await at(0.46) /* mid-sentence */
        await page.getByRole("heading", { name: "Pour les organisateurs seulement" }).scrollIntoViewIfNeeded()
        await at("Vous générez seulement les documents")
        await page.getByRole("heading", { name: "Badges" }).scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/events/${featureEventId}/log`); await settle(page)
      await scene("history", async (at) => {
        await page.getByRole("heading", { name: "Journal" }).waitFor()
        await at("publication, nouvelle inscription, désinscription, modification")
        await page.getByRole("button", { name: "Voir le récit" }).first().waitFor()
        await at("Chaque action est datée, avec")
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
        await at(0.30) /* mid-sentence */
        await checklist.getByText("Créer votre premier événement").scrollIntoViewIfNeeded()
        await at("Les coches sont calculées à")
        await checklist.getByText("Faire une inscription de test").scrollIntoViewIfNeeded()
      })

      await page.goto(`${baseUrl}/admin/settings/admins`); await settle(page)
      await scene("identity", async (at) => {
        const titleField = page.getByLabel("Titre affiché en haut de la page de vos événements")
        await at("Dans les paramètres, donnez à")
        await fillVisibly(page, titleField, "Les bénévoles du Parc")
        const titleForm = titleField.locator("xpath=ancestor::form")
        await tap(page, titleForm.getByRole("button", { name: "Enregistrer" }))
        await titleForm.getByText("Titre enregistré.").waitFor()
        const charterHeading = page.getByRole("heading", { name: "Charte des bénévoles" })
        await charterHeading.scrollIntoViewIfNeeded()
        const charterBox = charterHeading.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')]")
        const charter = charterBox.locator("textarea")
        const completeCharter = await charter.inputValue()
        if (completeCharter.trim().length < 400) throw new Error("First-steps fixture must contain the complete legal convention, not a one-sentence substitute")
        // Demonstrate the real complete text without rewriting its legal clauses.
        await at("Gardons toutes ses clauses")
        await tap(page, charter)
        await charter.press("ControlOrMeta+End")
        await at("Enregistrons le texte entier")
        await tap(page, charterBox.getByRole("button", { name: "Enregistrer" }))
        await charterBox.getByText("Enregistré ✓").waitFor()
        if (await charter.inputValue() !== completeCharter) throw new Error("First-steps demonstration altered the full convention")
      })

      await scene("timezone", async (at) => {
        const timezone = page.getByLabel("Fuseau horaire de vos événements")
        await timezone.scrollIntoViewIfNeeded()
        await at(0.22) /* mid-sentence */
        await timezone.selectOption("Europe/Zurich")
        const timezoneForm = timezone.locator("xpath=ancestor::form")
        await at("Changer ce paramètre adapte les")
        await tap(page, timezoneForm.getByRole("button", { name: "Enregistrer" }))
        await timezoneForm.getByText(/Fuseau horaire enregistré/).waitFor()
      })

      await page.goto(`${baseUrl}/admin/events`); await settle(page)
      await scene("event", async (at) => {
        const checklist = page.getByRole("region", { name: "Premiers pas" })
        await checklist.getByText(/Personnaliser la page publique.*fait/).waitFor()
        await at("Créons la Fête du parc")
        await tap(page, page.getByRole("link", { name: "+ Nouvel événement" }))
        await page.getByRole("heading", { name: "Nouvel événement" }).waitFor()
        await tap(page, page.getByRole("radio", { name: /Page blanche/ }))
        await at("Créons la Fête du parc")
        await typeNaturally(page, page.getByLabel("Titre *"), "Fête du parc")
        await fillVisibly(page, page.getByLabel("Lieu"), "Kiosque du parc, Montvert")
        await fillVisibly(page, page.getByLabel("Date début *"), "2031-06-14")
        await fillVisibly(page, page.getByLabel("Date fin *"), "2031-06-14")
        await tap(page, page.getByRole("button", { name: "Créer l'événement" }))
        await page.waitForURL(/\/admin\/events\/[^/]+\/shifts\?wizard=1$/)
        onboardingEventId = new URL(page.url()).pathname.split("/")[3]
      })

      await scene("shift", async (at) => {
        await at("Ajoutez un créneau, choisissez le")
        await tap(page, page.getByRole("button", { name: "+ Ajouter un créneau" }))
        const editor = page.getByRole("group", { name: "Nouveau créneau" })
        await typeNaturally(page, editor.getByLabel("Poste *"), "Accueil")
        await at(0.38) /* mid-sentence */
        await editor.getByLabel("Début *").fill("09:00")
        await editor.getByLabel("Fin *").fill("12:00")
        await editor.getByLabel("Places *").fill("3")
        await at("Après validation, le créneau apparaît")
        await tap(page, editor.getByRole("button", { name: "Ajouter", exact: true }))
        await page.getByRole("status").filter({ hasText: /Créneau ajouté/ }).waitFor()
      })

      await scene("publish", async (at) => {
        await at(0.10) /* mid-sentence */
        const continueButton = page.getByRole("link", { name: /Continuer : vérification et publication/ })
        await tap(page, continueButton)
        await page.waitForURL(/\/review$/)
        await page.getByRole("heading", { name: "Vérifier avant publication" }).waitFor()
        await page.getByRole("button", { name: "Publier" }).scrollIntoViewIfNeeded()
        await at("Ici, le minimum est prêt")
        await tap(page, page.getByRole("button", { name: "Publier" }))
        await page.getByText("L'événement est publié : les bénévoles peuvent s'inscrire.").waitFor()
        onboardingPublicUrl = (await page.getByText("Lien à partager :", { exact: false }).locator("span").textContent())?.trim() ?? ""
        if (!onboardingPublicUrl) throw new Error("Onboarding event has no public URL")
      })

      await page.goto(onboardingPublicUrl); await settle(page)
      await scene("test", async (at) => {
        await page.getByRole("heading", { name: "Fête du parc" }).waitFor()
        await at("Sélectionnez Accueil")
        await tap(page, page.getByRole("button", { name: /, Accueil[^:]* : sélectionner/ }))
        await tap(page, page.getByRole("button", { name: /^Continuer/ }))
        await page.getByRole("heading", { name: "Tes informations" }).waitFor()
        await typeNaturally(page, page.getByRole("textbox", { name: "Prénom", exact: true }), "Alex")
        await typeNaturally(page, page.getByRole("textbox", { name: "Nom", exact: true }), "Martin")
        await fillVisibly(page, page.getByRole("textbox", { name: "Email", exact: true }), "alex.masterclass@example.org", 180)
        await at("Sélectionnez Accueil")
        await tap(page, page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox"))
        await tap(page, page.getByRole("checkbox", { name: /^J'accepte que l'association qui organise cet événement/ }))
        await tap(page, page.getByRole("button", { name: "Confirmer mon inscription" }))
        await page.getByRole("heading", { name: /inscription confirmée/i }).waitFor()
      })

      await page.goto(`${baseUrl}/admin/events`); await settle(page)
      const { recordInlineHelp } = await import("../lib/record-inline-help")
      await recordInlineHelp(page, baseUrl, tap, scene)
      await page.goto(`${baseUrl}/admin/events`); await settle(page)
      await scene("result", async (at) => {
        await page.getByRole("heading", { name: "Événements" }).waitFor()
        if (await page.getByRole("heading", { name: "Premiers pas" }).isVisible()) {
          throw new Error("Onboarding checklist should be complete after the test registration")
        }
        await at(0.42) /* mid-sentence */
        await page.getByRole("link", { name: "Fête du parc", exact: true }).scrollIntoViewIfNeeded()
      })
    }
  } catch (error) {
    captureFailed = true
    throw error
  } finally {
    // Preserve the original scene failure: a closed page may also make stop()
    // fail, but that secondary error must not hide the actionable cause.
    let cleanupFailure: unknown
    for (const cleanup of [
      async () => { if (recording) await page.screencast.stop() },
      async () => { await context.close() },
      async () => { await browser.close() },
    ]) {
      try { await cleanup() } catch (error) { cleanupFailure ??= error }
    }
    if (cleanupFailure) {
      if (!captureFailed) throw cleanupFailure
      console.error("Capture cleanup also failed; preserving the original scene failure")
    }
  }

  const timeline: Timeline = {
    slug: manifest.slug,
    capturePurpose: rehearsal ? "rehearsal" : "narration-timed",
    recordedAt: new Date().toISOString(),
    video: path.basename(rawVideo),
    product,
    captureEnvironment: { locale: batch22French ? "fr-CH" : "fr-FR", timeZone: "Europe/Zurich", organization: org, scenario: manifest.id, viewport: { width: manifest.viewport.width, height: manifest.viewport.height }, mobile: manifest.viewport.width < 600 },
    inputAudioVersion: 1,
    inputEvents,
    cues,
    ...(anchors.length ? { anchors } : {}),
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
