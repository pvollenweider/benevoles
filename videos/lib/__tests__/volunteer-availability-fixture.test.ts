// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { BETA_CAPABILITIES } from "../../../src/lib/beta-capabilities"
import {
  AVAILABLE_CHOICE_LABEL, UNAVAILABLE_CHOICE_LABEL, addRange, chooseDay, copyPreviousDay, dayAnswerText, editorFrom, editorSubmission, nextDayHint, setRangeTime, type EditorState,
} from "../../../src/lib/availability-editor"
import { answerState, applySubmission, availabilityDates } from "../../../src/lib/event-availability"
import { AVAILABILITY_LINK_LABEL, answersOpen, deadlineSentence, eventDatesLabel, myAvailabilityTitle, savedSentence } from "../../../src/lib/event-availability-text"
import { renderAvailabilityRequest, type AvailabilityRequestData } from "../../../src/lib/notifications/templates/availability"
import { formatMoment } from "../../../src/lib/registration-window"
import { addDays } from "../../../src/lib/shift-series"
import { dayLabel } from "../../../src/lib/spoken-time"
import { fullNameOf } from "../fixture-names"
import { VA_EXPECTED, VA_TYPED, VOLUNTEER_AVAILABILITY_OWNER_EMAIL } from "../record-volunteer-event-availability"
import {
  VA_BETA_OPEN, VA_DEADLINE, VA_EVENT, VA_ORG, VA_OWNER, VA_PERSON_EMAIL, VA_TIME_ZONE, VA_VOLUNTEER, vaDeadline, vaFirstDay,
} from "../../../scripts/seed-video-volunteer-availability"

/**
 * The VOLUNTEER_EVENT_AVAILABILITY take judged before it is filmed: the seeded event
 * (scripts/seed-video-volunteer-availability.ts), the email the product sends, and the page's own
 * words for what the take types (VA_TYPED) and what the narration says (VA_EXPECTED): the deadline
 * sentences, the dates, the copy of Friday's hours, the night hint, the saved answer and its state.
 */

const root = path.resolve(__dirname, "../../..")
const read = (file: string) => readFileSync(path.join(root, file), "utf8")
const recorder = read("videos/lib/record-volunteer-event-availability.ts")
const page = read("src/app/disponibilites/[token]/page.tsx")
const editor = read("src/components/AvailabilityEditor.tsx")
const mailbox = read("videos/lib/prepare-settings-mailbox.ts")
const manifest = JSON.parse(read("videos/manifests/volunteer-event-availability.json")) as { segments: { id: string; transcript: string }[]; viewer: { remember: string[] } }
const viewer = manifest.viewer
const transcript = (id: string) => manifest.segments.find((s) => s.id === id)!.transcript

const TODAY = "2026-10-31"
/** Take days whose event weekend or deadline meets a clock change, and an ordinary one. */
const TAKE_DAYS = [TODAY, "2026-10-09", "2027-03-12", "2026-10-16", "2027-03-19", "2026-12-20"]
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
/** Spaces as Playwright compares text: non-breaking ones (French typography) read as plain spaces. */
const norm = (s: string) => s.replace(/\s+/g, " ")

/** The form after the take's actions, built with the page's own functions in the take's order. */
function takeForm(today: string): { dates: string[]; state: EditorState } {
  const first = vaFirstDay(today)
  const dates = availabilityDates(new Date(first), new Date(addDays(first, 2)))
  let state = editorFrom(dates, [])
  const [fri, sat, sun] = dates
  state = chooseDay(state, fri, "available")
  state = setRangeTime(state, fri, state.days[0].ranges[0].key, "start", VA_TYPED.friday[0].start)
  state = setRangeTime(state, fri, state.days[0].ranges[0].key, "end", VA_TYPED.friday[0].end)
  state = addRange(state, fri)
  state = setRangeTime(state, fri, state.days[0].ranges[1].key, "start", VA_TYPED.friday[1].start)
  state = setRangeTime(state, fri, state.days[0].ranges[1].key, "end", VA_TYPED.friday[1].end)
  state = copyPreviousDay(state, sat)
  state = chooseDay(state, sun, "unavailable")
  return { dates, state }
}

describe("VOLUNTEER_EVENT_AVAILABILITY fixture", () => {
  test("the event runs Friday to Sunday at least two weeks ahead; the deadline is the Friday before, at 20h", () => {
    for (const today of TAKE_DAYS) {
      const first = vaFirstDay(today)
      const dates = availabilityDates(new Date(first), new Date(addDays(first, 2)))
      expect(dates.map((d) => dayLabel(d).split(" ")[0]), today).toEqual(["Vendredi", "Samedi", "Dimanche"])
      expect(first >= addDays(today, 14), today).toBe(true)
      const deadline = vaDeadline(first)
      expect(formatMoment(deadline, VA_TIME_ZONE), today).toBe(`${lower(dayLabel(addDays(first, -VA_DEADLINE.daysBefore)))} à 20h`)
      expect(formatMoment(deadline, VA_TIME_ZONE).startsWith("vendredi "), today).toBe(true)
      // Open during the take (« jusque-là, tu peux répondre ou changer tes réponses »).
      expect(answersOpen(deadline, new Date(`${today}T12:00:00Z`)), today).toBe(true)
    }
  })

  test("the page's sentences the narration reads: title, intro, deadline, not answered yet", () => {
    const first = vaFirstDay(TODAY)
    const deadline = vaDeadline(first)
    expect(myAvailabilityTitle(VA_EVENT.title)).toBe(VA_EXPECTED.pageTitle)
    expect(VA_EXPECTED.eventTitle).toBe(VA_EVENT.title)
    expect(VA_EXPECTED.organizationName).toBe(VA_ORG.name)
    expect(norm(page)).toContain(`nbspQuotes("${VA_EXPECTED.intro}")`)
    expect(VA_EXPECTED.intro).toContain("Pas besoin de compte. Seule l'organisation voit tes réponses.")
    expect(norm(deadlineSentence(deadline, true, VA_TIME_ZONE)!)).toBe(`${VA_EXPECTED.deadlineLead}${formatMoment(deadline, VA_TIME_ZONE)}.`)
    expect(page).toContain(`case "none": return "${VA_EXPECTED.notAnswered}"`)
    expect(page).toContain(`case "complete": return "${VA_EXPECTED.answered}"`)
    expect(page).toContain(`submitLabel="${VA_EXPECTED.save}"`)
  })

  test("the email: subject the recorder waits for, the deadline, the link label", () => {
    const first = vaFirstDay(TODAY)
    const deadline = vaDeadline(first)
    // What src/lib/event-availability-server.ts availabilityRequestPayload puts in the email.
    const data: AvailabilityRequestData = {
      firstName: VA_VOLUNTEER.firstName, organizationName: VA_ORG.name, eventTitle: VA_EVENT.title,
      datesLabel: eventDatesLabel(new Date(first), new Date(addDays(first, 2))), deadlineLabel: formatMoment(deadline, VA_TIME_ZONE),
      orgSlug: VA_ORG.slug, token: "x".repeat(43), reminder: false,
    }
    const mail = renderAvailabilityRequest({ kind: "availability_request", recipient: { email: VA_VOLUNTEER.email, name: fullNameOf(VA_VOLUNTEER.firstName) }, organizationId: VA_ORG.id, dedupeKey: "k", data })
    expect(recorder).toContain("m.Subject === `[${VA_EXPECTED.organizationName}] Tes disponibilités pour ${VA_EXPECTED.eventTitle}`")
    expect(mail.subject).toBe(`[${VA_EXPECTED.organizationName}] Tes disponibilités pour ${VA_EXPECTED.eventTitle}`)
    const text = norm(mail.text)
    expect(text).toContain(`Bonjour ${VA_TYPED.firstName},`)
    expect(text).toContain(`${VA_EXPECTED.emailDeadlineLead}${formatMoment(deadline, VA_TIME_ZONE)}.`)
    expect(text).toContain("Ce lien est personnel : ne le transmets pas.")
    expect(AVAILABILITY_LINK_LABEL).toBe(VA_EXPECTED.linkLabel)
    expect(mail.html).toContain(`>${VA_EXPECTED.linkLabel}</a>`)
    // The recorder reads the link path from the text version.
    expect(/https?:\/\/\S+?(\/disponibilites\/[A-Za-z0-9_-]+)/.exec(mail.text)?.[1]).toBe(`/disponibilites/${"x".repeat(43)}`)
  })

  test("the labels the take taps are the editor's", () => {
    expect(AVAILABLE_CHOICE_LABEL).toBe(VA_EXPECTED.available)
    expect(UNAVAILABLE_CHOICE_LABEL).toBe(VA_EXPECTED.unavailable)
    expect(editor).toContain(`${VA_EXPECTED.addRange}<span className="sr-only">`)
    expect(editor).toContain(`"${VA_EXPECTED.allUnavailableHeading}"`)
    expect(editor).toContain("Pas disponible pendant tout l&apos;événement")
    expect(VA_EXPECTED.allUnavailableButton).toBe("Pas disponible pendant tout l'événement")
    expect(editor).toContain('"Reprendre les horaires du"')
  })

  test("Friday's night range ends the next morning, on Saturday; the copy names Friday and brings both ranges to Saturday", () => {
    for (const today of TAKE_DAYS) {
      const { dates, state } = takeForm(today)
      expect(nextDayHint(dates[0]).startsWith("se termine le lendemain, samedi "), today).toBe(true)
      expect(nextDayHint(dates[1]).startsWith("se termine le lendemain, dimanche "), today).toBe(true)
      expect(`Reprendre les horaires du ${lower(dayLabel(dates[0]))}`.startsWith("Reprendre les horaires du vendredi "), today).toBe(true)
      expect(state.days[1].choice).toBe("available")
      expect(state.days[1].ranges.map((r) => `${r.start}-${r.end}`)).toEqual(VA_TYPED.friday.map((r) => `${r.start}-${r.end}`))
    }
  })

  test("the saved answer: every date answered, no overlap, whatever the take's day, clock changes included", () => {
    for (const today of TAKE_DAYS) {
      const { dates, state } = takeForm(today)
      const built = editorSubmission(state, "tu")
      expect(built.ok, today).toBe(true)
      if (!built.ok) continue
      const applied = applySubmission(built.days, [], dates, VA_TIME_ZONE, "tu")
      expect(applied.ok, `${today}: ${applied.ok ? "" : applied.error}`).toBe(true)
      expect(answerState(dates, built.days.map((d) => ({ date: d.date, rangeCount: d.ranges.length }))), today).toBe("complete")
      const stored = built.days.map((d) => ({ date: d.date, ranges: d.ranges.map((r) => ({ startTime: r.start, endTime: r.end })) }))
      expect(stored.map((d) => dayAnswerText(d))).toEqual([
        "disponible de 9h à 12h et de 20h à 3h le lendemain",
        "disponible de 9h à 12h et de 20h à 3h le lendemain",
        "pas disponible",
      ])
    }
  })

  test("the saved confirmation says until when the same link can change the answers", () => {
    const deadline = vaDeadline(vaFirstDay(TODAY))
    expect(norm(savedSentence(deadline, VA_TIME_ZONE))).toBe(`${VA_EXPECTED.savedLead}${formatMoment(deadline, VA_TIME_ZONE)}.`)
  })

  test("the narration says what the take types and shows", () => {
    expect(transcript("va-hours")).toContain("le début, neuf heures, et la fin, midi")
    expect(VA_TYPED.friday[0]).toEqual({ start: "09:00", end: "12:00" })
    expect(transcript("va-night")).toContain("de vingt heures jusqu'à trois heures")
    expect(VA_TYPED.friday[1]).toEqual({ start: "20:00", end: "03:00" })
    expect(transcript("va-copy")).toContain("Reprendre les horaires du vendredi")
    expect(transcript("va-unavailable")).toContain(`bouton ${VA_EXPECTED.allUnavailableButton}`)
    expect(transcript("va-save")).toContain(VA_EXPECTED.save)
    expect(transcript("va-email")).toContain(`appuie sur ${VA_EXPECTED.linkLabel}`)
    // Volunteer video: the viewer is « tu » (codex-video-rules); one event's dates, the habitual availability named apart in the viewer notes.
    expect(transcript("va-welcome")).toContain("pour cet événement précis, date par date")
    expect(viewer.remember.join(" ")).toContain("Tes disponibilités habituelles, sur ta page « Mes inscriptions », sont une autre chose.")
    for (const s of manifest.segments) expect(s.transcript, s.id).not.toMatch(/\bvous\b/i)
  })

  test("the recorder opens what the seed created, and the mailbox cleanup owns exactly the fixture's addresses", () => {
    expect(recorder).toContain(`const EVENT_ID = "${VA_EVENT.id}"`)
    expect(recorder).toContain(`const VOLUNTEER_ID = "${VA_VOLUNTEER.id}"`)
    expect(recorder).toContain(`const VOLUNTEER_EMAIL = "${VA_VOLUNTEER.email}"`)
    expect(VOLUNTEER_AVAILABILITY_OWNER_EMAIL).toBe(VA_OWNER.email)
    expect(VA_TYPED.firstName).toBe(VA_VOLUNTEER.firstName)
    expect(fullNameOf(VA_VOLUNTEER.firstName)).toBe("Morgane Korhonen")
    for (const address of [VA_OWNER.email, VA_VOLUNTEER.email]) {
      expect(VA_PERSON_EMAIL.test(address)).toBe(true)
      expect(address.endsWith("@example.org")).toBe(true)
    }
    expect(mailbox).toContain(`"volunteer-event-availability": /${VA_PERSON_EMAIL.source}/,`)
    expect(recorder).not.toMatch(/from ["'][./]*scripts\//)
  })

  test("the beta list opens only the dated availability, a shipped capability", () => {
    expect(VA_BETA_OPEN).toEqual(["availability"])
    expect(BETA_CAPABILITIES.availability.shipped).toBe(true)
  })
})
