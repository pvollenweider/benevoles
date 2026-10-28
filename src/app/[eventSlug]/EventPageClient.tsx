"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react"
import { closedMessage, openUntilMessage, registrationState } from "@/lib/registration-window"
import { eventAccent } from "@/lib/event-accent"
import type { OrgLogo } from "@/lib/org-logo"
import OrgLogoImage from "@/components/OrgLogoImage"
import { coordinatesOf, MAP_LINK_LABEL, MAP_LINK_SR_SUFFIX, osmLink } from "@/lib/map-link"
import { describeSignupFailure, type Failure } from "@/lib/form-errors"
import { SIGNUP_COMMENT_MAX, SIGNUP_PHONE_MAX } from "@/lib/signup-limits"
import SignupRecap from "@/components/public/SignupRecap"
import { blocksWorkload, recapWorkloadNotices, type WorkloadMode } from "@/lib/workload-view"
import { isWaitlistShift } from "@/lib/signup-recap"
import ShiftRow from "@/components/public/ShiftRow"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { formatCalendarDay } from "@/lib/utils"
import {
  CONSENT_PRIVACY_HREF,
  EMPTY_SIGNUP_FORM,
  conflictingShiftIds as computeConflictingShiftIds,
  hasAvailableShift as anyShiftAvailable,
  isShiftSelectable,
  prefillContact,
  proposedShiftState,
  proposedShiftText,
  shiftsByDay as groupShiftsByDay,
  toMyRegistrations,
  validateSignup,
  type MyRegistration,
  type SignupForm,
} from "@/lib/public-signup"
import { roleLimitBreaches, roleLimitSelectionMessage, roleLimits } from "@/lib/role-limit"
import { spokenShift } from "@/lib/spoken-time"
import { announce } from "@/lib/announce"
import { forgetRememberedContact, loadRememberedContact, saveRememberedContact } from "@/lib/remembered-contact"
import { focusFirstAvailable, isFocusDropped, type FocusCandidate } from "@/lib/focus-return"
import { withdrawCopy, withdrawDoneMessage, withdrawFailureMessage } from "@/lib/volunteer-withdraw"
import ModalShell from "@/components/admin/ModalShell"
import WithdrawDialog from "@/components/public/WithdrawDialog"
import DeclineInvite from "@/components/public/DeclineInvite"
import SignupQuestions, { type Answers } from "@/components/public/SignupQuestions"
import { checkAnswers, visibleQuestions, type Question } from "@/lib/event-questions"
import { askedQuestions } from "@/lib/question-scope"
import DayTimeline from "@/components/DayTimeline"
import ShiftDayList from "@/components/ShiftDayList"
import { useHydrated } from "@/lib/use-hydrated"
import { groupDaysByMonth, isLongEvent, usesMonthView, visibleDays } from "@/lib/long-event"
import { readShiftView, saveShiftView, type ShiftView } from "@/lib/shift-view"
import { heldKinds } from "@/lib/public-timeline"
import PublicFooter, { type FooterSite } from "@/components/PublicFooter"
import SkipLink, { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"
import { resolveCharterText } from "@/lib/volunteer-charter"
import {
  ROSTER_NOTICE_VERSION, ROSTER_QUERY_PARAM, eventPageRosterViewer, signupRosterBox, type ShiftRosterEntry,
} from "@/lib/shift-roster"
import {
  ROSTER_MINOR_TEXT, ROSTER_SIGNUP_HINT, ROSTER_SIGNUP_LABEL, ROSTER_SWITCH_EXPLAIN, ROSTER_SWITCH_FAILURE, ROSTER_SWITCH_LABEL,
  ROSTER_SWITCH_LOADED, ROSTER_SWITCH_UNAVAILABLE, ROSTER_DOC_LINKS, ROSTER_DOC_TOPIC,
} from "@/lib/shift-roster-text"
import { RosterName } from "@/components/public/RosterName"
import Switch from "@/components/public/Switch"
import DocMoreLink from "@/components/DocMoreLink"
import { SECTION_DOC_LINKS, docHref } from "@/lib/help-links"
import LinkRequestForm from "@/components/LinkRequestForm"
import { LOST_LINK_SUMMARY, PERSONAL_LINK_DOC_LINKS, showsLostLinkEntry } from "@/lib/personal-link"
import { readStored, removeStored, writeStored } from "@/lib/device-storage"
import { tokenOrNull, tokenPath } from "@/lib/token-path"
import { NEW_TAB_HINT, takeReturnToSchedule } from "@/lib/embed"
import { successPath } from "@/lib/registration-success"
import EmbedFrame from "@/components/public/EmbedFrame"
import { attributionCode, groupFilterLine, groupFilterNotice, groupToggleAnnouncement, shiftsForGroup, type GroupFilter } from "@/lib/group-links"
import RequiredMark from "@/components/RequiredMark"
import { startingAnswers, type MyAnswerRow } from "@/lib/my-answers"
import { SESSION_EMAIL_HINT, sessionFormNote, type SignupUpdates } from "@/lib/signup-updates"


type Shift = {
  id: string
  roleName: string
  label: string
  description: string | null
  date: string
  startTime: string
  endTime: string
  capacity: number
  registered: number
  spotsLeft: number
  status: string
  locationDetails: string | null
  instructions?: string | null
  latitude?: number | null
  longitude?: number | null
  displayOrder: number
  waitlistEnabled: boolean
  requiresApproval?: boolean
  minAge: number | null
  colorKey: string | null
  /** Shifts per volunteer for this role (#466). */
  maxPerVolunteer?: number | null
  /** Reserved to some members (#470); which tags is never sent to the page. */
  reserved?: boolean
  /** Its role may overlap another shift (#986): never shown as a conflict. */
  overlapAllowed?: boolean
}

type Show = { name: string; date: string; startTime: string; endTime: string }

export type EventData = {
  /** Custom sign-up questions (#483). */
  questions?: Question[]
  id: string
  slug: string
  title: string
  organizationName: string
  /** The organization's logo (#300), shown next to its name in the header. */
  organizationLogo?: OrgLogo | null
  description: string | null
  location: string | null
  latitude?: number | null
  longitude?: number | null
  startDate: string
  endDate: string
  publicInstructions: string | null
  confirmationMessage: string | null
  requirePhone: boolean
  /** Shift roster (#1068): the form offers the optional « show my name » box. */
  shiftRosterEnabled?: boolean
  registrationsOpen: boolean
  registrationOpensAt: string | null
  registrationClosesAt: string | null
  timeZone: string
  /** Workload (#465 warnings, or the #1171 protection limits); absent from an older payload = warnings. */
  workload?: WorkloadMode
  accentColorKey: string | null
  showSchedule: Show[]
  volunteerCharter: string | null
  /** With volunteerCharter, picks the exact text the sign-up route hashes (#569). */
  hasOrgInsurance: boolean
  shifts: Shift[]
  pages: { slug: string; title: string }[]
  /** Only in the admin preview (#370). */
  publicStatus?: string
}

type PreviewResult = { subject: string; html: string; confirmationMessage: string | null; waitlistedShiftIds: string[] }

/**
 * `preview` (#370): the admin's « Prévisualiser comme un bénévole ». Reads the event through the
 * admin API (drafts included), keeps no local session, ignores invitation links, and shows the
 * confirmation and email a volunteer would get instead of registering.
 *
 * `initialEvent` (#773): the public page's data, read by the server page as the public API sends
 * it. The page is then server-rendered with its schedule; without it (the preview), the event is
 * fetched after mounting.
 *
 * `groupFilter` (#947): the share link per group the page was opened with (`?groupe=`), resolved by
 * the server. A filtered page shows only the link's roles, says so, and lets the visitor see every
 * role; the sign-up is counted for the link either way.
 *
 * `embed` (#948): the sign-up in the association's own website, inside an iframe (`?embed=1`). The
 * organisation's branding and the whole flow stay; the « Retour » link and the site footer go,
 * what leaves the flow (event pages, personal page, legal pages) opens in a new tab, the
 * « Continuer » bar is not fixed (a resized frame is as tall as its content) and the page's height
 * is posted to the site around it (EmbedFrame).
 */
export default function EventPageClient({ orgSlug, eventSlug, preview, initialEvent, privacyHref = CONSENT_PRIVACY_HREF, groupFilter = { kind: "none" }, embed = false, footerSite }: {
  /** The consent's privacy link, from the server (#760: the operator page on another instance). */
  privacyHref?: string
  orgSlug: string
  eventSlug: string
  /** `helpLink` (#1096): the preview page's « Aide : … », shown in the preview banner. */
  preview?: { eventId: string; adminEventUrl: string; helpLink?: React.ReactNode }
  initialEvent?: EventData
  groupFilter?: GroupFilter
  embed?: boolean
  /** The footer's links to the site's pages and its name, from the server (src/lib/urls.ts, `orgPageFooterSite`). */
  footerSite?: FooterSite
}) {
  const previewEventId = preview?.eventId ?? null
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  // Only a value shaped like a token counts as an invitation: anything else is as if there were none.
  const inviteToken = tokenOrNull(searchParams.get("token"))
  // « Je prends ce créneau » from an organizer's email (#869): the proposed shift, offered in one click.
  const proposedShiftId = searchParams.get("creneau")
  const proposalTextRef = useRef<HTMLParagraphElement>(null)
  // The email's second link (#558): opens the decline confirmation step right away.
  const autoOpenDecline = searchParams.get("decline") === "1"

  type MyReg = MyRegistration

  const [event, setEvent] = useState<EventData | null>(initialEvent ?? null)
  const [loading, setLoading] = useState(!initialEvent)
  const serverRendered = !!initialEvent
  const [selectedShifts, setSelectedShifts] = useState<Set<string>>(new Set())
  const [limitNotice, setLimitNotice] = useState("")
  const [answers, setAnswers] = useState<Answers>({})
  const [questionErrors, setQuestionErrors] = useState<Map<string, string>>(new Map())
  // Reserved roles (#470) the visitor's invitation opens; none without an invitation.
  const [allowedReserved, setAllowedReserved] = useState<Set<string>>(new Set())
  // Whether this invitation already answered « pas disponible » (#558), from the member-invite GET.
  const [declined, setDeclined] = useState(false)
  // The day of the refused shift: the visible note sits under that day's schedule, where the click was.
  const [limitNoticeDay, setLimitNoticeDay] = useState<string | null>(null)
  const [myRegistrations, setMyRegistrations] = useState<MyReg[]>([])
  // The personal link of this device's session on the event (#1013): sent with a sign-up for more
  // shifts, so what the volunteer changes in the form (name, phone, answers) is saved.
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  // The withdrawal confirmation of a held shift (#584), its request and its failure.
  const [pendingCancel, setPendingCancel] = useState<{ token: string; shiftId: string; label: string; status: string } | null>(null)
  const [withdrawing, setWithdrawing] = useState(false)
  const withdrawingRef = useRef(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  // The optional « Un mot pour l'organisation ? » (#559), reset whenever a new confirmation opens.
  const [withdrawMessage, setWithdrawMessage] = useState("")
  const withdrawConfirmRef = useRef<HTMLButtonElement>(null)
  const withdrawKeepRef = useRef<HTMLButtonElement>(null)
  // Where the withdrawal was asked from: the ✕, its list and its place there, for the focus after.
  const withdrawFrom = useRef<{ trigger: HTMLButtonElement; list: Element | null; index: number } | null>(null)
  // Result of an action outside the sign-up steps (a withdrawal), voiced once.
  const [actionNotice, setActionNotice] = useState("")
  const [step, setStep] = useState<"select" | "form">("select")
  // « Voir tous les postes » (#947): the visitor lifts the group link's filter, and can put it back.
  const [showAllRoles, setShowAllRoles] = useState(false)
  const [groupNote, setGroupNote] = useState("")
  // « Frise » or « Liste » (#808): the timeline by default (and in the server HTML), the visitor's
  // choice kept on the device and read once hydrated. The admin preview never reads storage.
  const hydrated = useHydrated()
  const [chosenShiftView, setChosenShiftView] = useState<ShiftView | null>(null)
  const shiftView: ShiftView = chosenShiftView ?? (hydrated && !preview ? readShiftView() : null) ?? "frise"
  const chooseShiftView = (view: ShiftView) => {
    setChosenShiftView(view)
    if (!preview) saveShiftView(view)
  }
  // Long events (#866): one month at a time, chosen by the visitor; null = the first month shown.
  const [chosenMonth, setChosenMonth] = useState<string | null>(null)
  // Said once the month is changed: the dates below the buttons are swapped silently otherwise.
  const [monthNote, setMonthNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A structured failure of the sign-up itself (#375): kind, what to do, whether to retry.
  const [failure, setFailure] = useState<Failure | null>(null)
  const failureRef = useRef<HTMLDivElement>(null)
  // « Quitter la session » removes itself: the focus lands on the title instead of the body.
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [charterAccepted, setCharterAccepted] = useState(false)
  // The shift roster's optional box (#1068): unticked by default, never required.
  const [rosterNameVisible, setRosterNameVisible] = useState(false)
  // « Voir qui est inscrit » (#1068): off on load (on with `?inscrits=1`, a display preference
  // only), its data by shift once loaded, its messages (status and alert, mounted from the start).
  const [rosterOn, setRosterOn] = useState(searchParams.get(ROSTER_QUERY_PARAM) === "1")
  // The last answer, for the link and the visitor's shifts it was read with (see rosterKey).
  const [rosterResult, setRosterResult] = useState<{ key: string; shifts: Map<string, ShiftRosterEntry> | null } | null>(null)
  const [rosterStatus, setRosterStatus] = useState("")
  const [rosterFailure, setRosterFailure] = useState("")
  // Only a press of the switch is announced: on at load (`?inscrits=1`), the page's title is read first.
  const rosterPressed = useRef(false)
  // Which consent checkbox the last refusal was about (#569): marked invalid and focused.
  const [invalidCheckbox, setInvalidCheckbox] = useState<"charter" | "consent" | null>(null)
  const [showCharter, setShowCharter] = useState(false)
  const charterTriggerRef = useRef<HTMLButtonElement>(null)
  const [form, setForm] = useState<SignupForm>(EMPTY_SIGNUP_FORM)
  // Contact details brought back from this device's last signup (#901), with a way to clear them.
  const [usedRemembered, setUsedRemembered] = useState(false)
  // Preview (#370): focus the result when it appears, and the submit button when going back to
  // the form (the result panel unmounts, focus would otherwise fall to <body>).
  const resultHeadingRef = useRef<HTMLHeadingElement>(null)
  const submitButtonRef = useRef<HTMLButtonElement>(null)
  const hadPreviewResult = useRef(false)
  // Between the two steps, the button that had the focus unmounts: the form's title takes it
  // when the form opens, « Continuer » (else the title) when going back. In the embedded page
  // (#948) this also brings the step into view in the site around the frame.
  const formHeadingRef = useRef<HTMLHeadingElement>(null)
  const stepFocus = useRef<"form" | "select" | null>(null)
  useEffect(() => {
    if (stepFocus.current !== step) return
    stepFocus.current = null
    if (step === "form") { formHeadingRef.current?.focus(); return }
    const visibleContinue = () => [...document.querySelectorAll<HTMLElement>("[data-continue]")].find((b) => b.offsetParent !== null) ?? null
    focusFirstAvailable([visibleContinue, titleRef.current])
  }, [step])
  // Back from the embedded confirmation (« Revenir au planning »): the title takes the focus.
  useEffect(() => {
    if (embed && takeReturnToSchedule()) titleRef.current?.focus()
  }, [embed])

  // Focus to move once React has committed the render it goes with (a dialog closed, a row removed),
  // the RoleManagerPanel pattern. Only while focus is in a dialog or was dropped to <body> by an
  // unmounted control: an answer that arrives after the user went elsewhere does not pull it back.
  const [focusRequest, setFocusRequest] = useState<{ candidates: FocusCandidate[] } | null>(null)
  useLayoutEffect(() => {
    if (!focusRequest) return
    const active = document.activeElement
    // Dropped focus includes <main>: WebKit focuses it (tabIndex={-1}, the skip link's target) when a
    // tapped control inside it doesn't take focus, e.g. after a withdrawal removed the ✕.
    const free = isFocusDropped(active) || !!active?.closest("[role=dialog],[role=alertdialog]")
    if (free) focusFirstAvailable(focusRequest.candidates)
  }, [focusRequest])
  useEffect(() => {
    if (previewResult) {
      hadPreviewResult.current = true
      resultHeadingRef.current?.focus()
    } else if (hadPreviewResult.current) {
      hadPreviewResult.current = false
      submitButtonRef.current?.focus()
    }
  }, [previewResult])

  const storageKey = `benevoles_token_${eventSlug}`
  const myShiftIds = useMemo(() => new Set(myRegistrations.map((r) => r.shiftId)), [myRegistrations])
  const myStatus = useMemo(() => new Map(myRegistrations.map((r) => [r.shiftId, r.status])), [myRegistrations])
  // Held shifts the volunteer can't cancel online any more (#946): no ✕, a sentence instead.
  const myTokenByShift = useMemo(() => new Map(myRegistrations.map((r) => [r.shiftId, `/my/${encodeURIComponent(r.token)}`])), [myRegistrations])
  const closedShiftIds = useMemo(() => new Set(myRegistrations.filter((r) => r.cancellable === false).map((r) => r.shiftId)), [myRegistrations])
  // Held shifts by status, for the schedule: named and drawn as the visitor's own (#534).
  const heldByShift = useMemo(() => heldKinds(myRegistrations), [myRegistrations])
  // Shifts of reserved roles (#470) this visitor can't take; the server checks it again at sign-up.
  const reservedShiftIds = useMemo(
    () => new Set((event?.shifts ?? []).filter((s) => s.reserved && !allowedReserved.has(s.roleName)).map((s) => s.id)),
    [event, allowedReserved],
  )

  // Roles whose limit per person is already used by held + selected shifts (#466): their other
  // bars say so in their accessible name, before a click is refused.
  const limitReachedRoles = useMemo(() => {
    const shifts = event?.shifts ?? []
    const limits = roleLimits(shifts)
    const taken = shifts.filter((s) => myShiftIds.has(s.id) || selectedShifts.has(s.id))
    return new Map([...limits].filter(([role, max]) => taken.filter((s) => s.roleName === role).length >= max))
  }, [event, myShiftIds, selectedShifts])

  // Shifts already held and not re-selected, for the workload warnings of the recap (#465).
  const heldShifts = useMemo(
    () => (event?.shifts ?? []).filter((s) => myShiftIds.has(s.id) && !selectedShifts.has(s.id)),
    [event, myShiftIds, selectedShifts],
  )

  // The protection's limits (#1171) the selection would break: read with the confirm button.
  const workloadBlocked = useMemo(() => {
    if (!event?.workload || !blocksWorkload(event.workload)) return false
    const chosen = event.shifts.filter((shift) => selectedShifts.has(shift.id) && !isWaitlistShift(shift))
    return recapWorkloadNotices(chosen, heldShifts, event.workload).length > 0
  }, [event, selectedShifts, heldShifts])

  // Shifts among the current selection that require a minimum age (#192) — drives whether the
  // form asks for a date of birth.
  const ageGatedSelectedShifts = useMemo(
    () => (event?.shifts ?? []).filter((s) => selectedShifts.has(s.id) && !myShiftIds.has(s.id) && s.minAge != null),
    [event, selectedShifts, myShiftIds]
  )

  // The shift roster's box (#1068): shown when the event has the roster, replaced by a sentence
  // when the birth date asked for an age-gated shift says under 18.
  const rosterBox = signupRosterBox(!!event?.shiftRosterEnabled, ageGatedSelectedShifts.length > 0 ? form.birthDate : "", event?.startDate ?? "")

  const conflictingShiftIds = useMemo(
    () => (event ? computeConflictingShiftIds(event.shifts, selectedShifts, myShiftIds) : new Set<string>()),
    [event, selectedShifts, myShiftIds]
  )

  useEffect(() => {
    if (serverRendered) return
    const url = previewEventId
      ? `/api/admin/events/${previewEventId}/preview`
      : `/api/public/${eventSlug}?org=${encodeURIComponent(orgSlug)}`
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setLoading(false); return }
        setEvent(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [eventSlug, orgSlug, previewEventId, serverRendered])

  useEffect(() => {
    const inviteUrl = tokenPath("/api/public/member-invite", inviteToken, `?slug=${encodeURIComponent(eventSlug)}`)
    if (!inviteUrl || previewEventId) return
    fetch(inviteUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.member) return
        setForm((f) => prefillContact(f, data.member, "form"))
        setAllowedReserved(new Set<string>(data.reservedRolesAllowed ?? []))
        setDeclined(!!data.declined)
      })
      .catch(() => {})
  }, [inviteToken, eventSlug, previewEventId])

  useEffect(() => {
    if (previewEventId) return // a preview never picks up a volunteer's session on this browser
    // Storage may be refused or partitioned (a third-party frame, #948): no session then.
    const token = tokenOrNull(readStored(storageKey))
    const sessionUrl = tokenPath("/api/public/registrations", token)
    if (!token || !sessionUrl) return
    fetch(sessionUrl)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.registrations) return
        const regs = toMyRegistrations(data.registrations)
        setMyRegistrations(regs)
        setSessionToken(token)
        if (data.volunteer) setForm((f) => prefillContact(f, data.volunteer, "source"))
        // Their answers for this event (#1013), as « Mes réponses » shows them: once, what was
        // already typed wins.
        if (Array.isArray(data.answers)) setAnswers((a) => ({ ...startingAnswers(data.answers as MyAnswerRow[]), ...a }))
        setSelectedShifts((prev) => {
          const next = new Set(prev)
          regs.forEach((r: MyReg) => next.add(r.shiftId))
          return next
        })
      })
      .catch(() => {})
  }, [storageKey, previewEventId])

  // Who the roster is read as (#1068): an invitation in the address, else this browser's session
  // with a confirmed place; nobody on a group link, in the embed or the preview. The server decides.
  const hasConfirmedSession = myRegistrations.some((r) => r.status === "active")
  const rosterViewer = eventPageRosterViewer({
    enabled: !!event?.shiftRosterEnabled,
    embed,
    preview: !!previewEventId,
    groupLink: groupFilter.kind !== "none",
    inviteToken,
    sessionToken: hasConfirmedSession ? sessionToken : null,
  })
  const rosterUrl = rosterViewer
    ? rosterViewer.kind === "invite"
      ? `/api/public/member-invite/${encodeURIComponent(rosterViewer.token)}/roster?slug=${encodeURIComponent(eventSlug)}&org=${encodeURIComponent(orgSlug)}`
      : `/api/public/registrations/${encodeURIComponent(rosterViewer.token)}/roster`
    : null
  // Read whenever the switch is on and again after the visitor's own shifts change (a withdrawal);
  // forgotten as soon as it is off, the link changes or the server says no.
  const rosterKey = `${rosterUrl}|${myRegistrations.map((r) => `${r.shiftId}:${r.status}`).join(",")}`
  useEffect(() => {
    if (!rosterOn || !rosterUrl) return
    let current = true
    fetch(rosterUrl)
      .then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) }))
      .then(({ ok, status, body }) => {
        if (!current) return
        if (ok && body?.available === true && Array.isArray(body.shifts)) {
          setRosterResult({ key: rosterKey, shifts: new Map((body.shifts as ShiftRosterEntry[]).map((e) => [e.shiftId, e])) })
          if (rosterPressed.current) announce(setRosterStatus, ROSTER_SWITCH_LOADED)
        } else {
          setRosterResult({ key: rosterKey, shifts: null })
          // Refused (nothing to show for this link now): said as such, not as a failure to retry.
          announce(setRosterFailure, (ok && body?.available === false) || status === 404 ? ROSTER_SWITCH_UNAVAILABLE : ROSTER_SWITCH_FAILURE)
        }
      })
      .catch(() => {
        if (!current) return
        setRosterResult({ key: rosterKey, shifts: null })
        announce(setRosterFailure, ROSTER_SWITCH_FAILURE)
      })
    return () => { current = false }
  }, [rosterOn, rosterUrl, rosterKey])
  const rosterLoading = rosterOn && !!rosterUrl && rosterResult?.key !== rosterKey
  // Only the answer for this very link and these shifts, only while the switch is on.
  const shownRoster = rosterOn && rosterUrl && rosterResult?.key === rosterKey ? rosterResult.shifts : null

  if (loading) return <div role="status" className="flex items-center justify-center min-h-screen text-gray-500">Chargement…</div>
  if (!event) return <div role="alert" className="flex items-center justify-center min-h-screen text-gray-500">Événement introuvable.</div>

  // Registration window (#463). This page only shows published events, or a preview of what
  // volunteers will see once published: either way, the window decides.
  const windowState = registrationState({ ...event, publicStatus: "published" })
  const accepting = windowState.open
  const windowClosedText = closedMessage(windowState, event.timeZone)
  const windowUntilText = openUntilMessage(windowState, event.timeZone)
  // A group link (#947) shows its roles only; the visitor's held and selected shifts always stay.
  const groupFiltered = groupFilter.kind === "filtered"
  const keptShiftIds = new Set([...myShiftIds, ...selectedShifts])
  const shownShifts = groupFiltered && !showAllRoles ? shiftsForGroup(event.shifts, groupFilter, keptShiftIds) : event.shifts
  const groupNotice = groupFilterNotice(groupFilter)
  const shiftsByDay = groupShiftsByDay(shownShifts)
  // A season of permanences (#866): past days left out, one month at a time from 8 dates on.
  // « Today » in the organisation's zone; the server answers the same for the days it renders.
  const longEvent = isLongEvent(event.startDate, event.endDate)
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: event.timeZone })
  const shownDays = visibleDays(Object.keys(shiftsByDay), today, longEvent)
  const months = usesMonthView(shownDays) ? groupDaysByMonth(shownDays) : null
  const month = months ? (months.find((m) => m.key === chosenMonth) ?? months[0]) : null
  const daysOnPage = month ? month.days : shownDays
  const hasAvailableShift = anyShiftAvailable(shownShifts)
  // Coming back with the session of a sign-up on this event (#1013): the form starts from it.
  const inSession = !previewEventId && !!sessionToken && myRegistrations.length > 0
  // The questions asked for the postes of the shifts chosen (#1140), plus those already held from
  // the personal link, as the server decides. Recomputed with the selection: back on the form, a
  // question of a poste no longer chosen is gone, neither checked nor sent (what was typed in it
  // stays in memory, should the shift be chosen again).
  const askedRoles = (event?.shifts ?? []).filter((s) => selectedShifts.has(s.id) || (inSession && myShiftIds.has(s.id))).map((s) => s.roleName)
  const formQuestions = askedQuestions(event?.questions ?? [], askedRoles)

  function toggleGroupFilter() {
    if (groupFilter.kind !== "filtered") return
    const next = !showAllRoles
    setShowAllRoles(next)
    announce(setGroupNote, groupToggleAnnouncement(next, groupFilter.name))
  }

  /** Selects or unselects a shift; false when refused (the reason is said where it applies). */
  function toggleShift(id: string): boolean {
    if (!accepting && !selectedShifts.has(id)) return false
    const target = event?.shifts.find((s) => s.id === id)
    if (!isShiftSelectable(target, myShiftIds)) return false
    // Reserved bars are disabled (#470); this guards any other way in.
    if (reservedShiftIds.has(id) && !selectedShifts.has(id)) return false
    // Shifts per volunteer for a role (#466): said here, before the form; the server decides.
    if (target && event && !selectedShifts.has(id)) {
      const asked = event.shifts.filter((s) => selectedShifts.has(s.id) && !myShiftIds.has(s.id))
      const held = event.shifts.filter((s) => myShiftIds.has(s.id))
      const [breach] = roleLimitBreaches([...asked, target], held, roleLimits(event.shifts))
      if (breach) {
        setLimitNoticeDay(target.date.slice(0, 10))
        announce(setLimitNotice, roleLimitSelectionMessage(breach))
        return false
      }
    }
    setLimitNotice("")
    setLimitNoticeDay(null)
    setSelectedShifts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); return next }
      next.add(id)
      return next
    })
    return true
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const invalid = validateSignup({
      form,
      charterAccepted,
      requirePhone: event?.requirePhone ?? false,
      ageGatedShifts: ageGatedSelectedShifts,
    })
    if (invalid) {
      setFailure(null); setQuestionErrors(new Map()); setError(invalid)
      const box = !charterAccepted ? "charter" : !form.consent ? "consent" : null
      setInvalidCheckbox(box)
      if (box) requestAnimationFrame(() => document.getElementById(`reg-${box}`)?.focus())
      return
    }
    setInvalidCheckbox(null)
    // Custom questions (#483): the same check as the server, the first refused field focused.
    const answerCheck = checkAnswers(formQuestions, answers)
    if (!answerCheck.ok) {
      setFailure(null)
      setQuestionErrors(new Map(answerCheck.errors.map((e) => [e.questionId, e.message])))
      setError(answerCheck.errors.map((e) => e.message).join(" "))
      const first = answerCheck.errors[0].questionId
      requestAnimationFrame(() => (document.getElementById(`q-${first}`) ?? document.getElementById(`q-${first}-0`))?.focus())
      return
    }
    setQuestionErrors(new Map())
    if (submitting) return

    setSubmitting(true)
    setError(null)

    if (previewEventId) {
      // Preview: render what the volunteer would receive, register nothing.
      try {
        const res = await fetch(`/api/admin/events/${previewEventId}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstName: form.firstName, lastName: form.lastName, shiftIds: Array.from(selectedShifts) }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) setError(typeof data?.error === "string" ? data.error : "Aperçu indisponible.")
        else setPreviewResult(data as PreviewResult)
      } catch {
        setError("Aperçu indisponible. Vérifiez votre connexion et réessayez.")
      } finally {
        setSubmitting(false)
      }
      return
    }

    setFailure(null)
    let res: Response
    try {
      res = await fetch("/api/public/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event!.id,
          shiftIds: Array.from(selectedShifts).filter((id) => !myShiftIds.has(id)),
          ...form,
          // Proof of acceptance (#569): validateSignup already refused to get here without it.
          charterAccepted,
          // Only while the box is shown: never for a minor, nor once hidden by a birth date.
          rosterNameVisible: rosterBox === "box" && rosterNameVisible,
          // The text the box showed (#1068): its audience is the one stored with the choice.
          rosterNoticeVersion: ROSTER_NOTICE_VERSION,
          // Only the questions asked (#1140): the server would ignore the others anyway.
          answers: Object.fromEntries(Object.entries(answers).filter(([id]) => formQuestions.some((q) => q.id === id))),
          inviteToken: inviteToken ?? undefined,
          // The sign-up counts for the group link the page was opened with (#947).
          groupCode: attributionCode(groupFilter) ?? undefined,
          // From the personal page (#1013): the changes made here are saved.
          personalToken: inSession ? sessionToken! : undefined,
        }),
      })
    } catch {
      // Everything typed stays in place; retrying is safe, the server re-sends the link instead of duplicating.
      setFailure(describeSignupFailure({ network: true }))
      setSubmitting(false)
      requestAnimationFrame(() => failureRef.current?.focus())
      return
    }

    let data: Record<string, string> = {}
    try {
      data = await res.json()
    } catch {
      setFailure(describeSignupFailure({ status: res.status, network: !res.ok }))
      setSubmitting(false)
      requestAnimationFrame(() => failureRef.current?.focus())
      return
    }
    setSubmitting(false)

    if (!res.ok) {
      // A refused answer (#483) marks its field, like the page's own check.
      const refused = (data as unknown as { questionErrors?: unknown }).questionErrors
      if (Array.isArray(refused)) setQuestionErrors(new Map(refused.filter((x): x is { questionId: string; message: string } => typeof x?.questionId === "string" && typeof x?.message === "string").map((x) => [x.questionId, x.message])))
      // Errors never carry a management token (#285): the owner gets it by email instead.
      setFailure(describeSignupFailure({ status: res.status, body: data }))
      // The server refused the charter (#569): back to the checkbox, the alert is still announced.
      if (data.field === "charterAccepted") {
        setCharterAccepted(false)
        setInvalidCheckbox("charter")
        requestAnimationFrame(() => document.getElementById("reg-charter")?.focus())
        return
      }
      requestAnimationFrame(() => failureRef.current?.focus())
      return
    }

    // No editToken when the address already belonged to a volunteer and nothing proved the
    // submitter owns it: the management link then only goes out by email (#285).
    saveRememberedContact(form)
    if (data.editToken) writeStored(storageKey, data.editToken)
    router.push(successPath(eventSlug, { ...data, updated: (data as unknown as { updated?: SignupUpdates }).updated }, searchParams, embed))
  }

  function quitSession() {
    removeStored(storageKey)
    forgetRememberedContact()
    setUsedRemembered(false)
    setMyRegistrations([])
    setSessionToken(null)
    setSelectedShifts(new Set())
    setForm(EMPTY_SIGNUP_FORM)
    setAnswers({})
    setQuestionErrors(new Map())
    requestAnimationFrame(() => titleRef.current?.focus())
  }

  // Another event's signup on this device (#901) fills the empty contact fields when the form
  // opens. An invitation brings its own member, and this event's session its own volunteer.
  function openForm() {
    stepFocus.current = "form"
    setStep("form")
    if (previewEventId || inviteToken || myRegistrations.length > 0) return
    const remembered = loadRememberedContact()
    if (!remembered) return
    setForm((f) => prefillContact(f, remembered, "form"))
    setUsedRemembered(true)
  }

  // A shared device (#901): someone else's details go, and so does the memory of them.
  function forgetContact() {
    forgetRememberedContact()
    setUsedRemembered(false)
    setForm((f) => ({ ...f, firstName: "", lastName: "", email: "", phone: "" }))
    announce(setActionNotice, "Coordonnées effacées de cet appareil.")
    requestAnimationFrame(() => document.getElementById("reg-firstname")?.focus())
  }

  // The charter closes back to its link (ModalShell also restores its opener; WebKit never focused a tapped one).
  function closeCharter() {
    setShowCharter(false)
    setFocusRequest({ candidates: [charterTriggerRef.current] })
  }

  // orgSlug is received as prop but only used in the storageKey (already included via eventSlug)
  void orgSlug

  // A held shift's ✕ in a ShiftRow: ask before cancelling. The ✕, its list and its place there
  // are kept for the focus once the dialog closes.
  function requestCancel(s: Shift, trigger: HTMLButtonElement) {
    const reg = myRegistrations.find((r) => r.shiftId === s.id)
    if (!reg) return
    const list = trigger.closest("[data-shift-list]")
    const index = list ? [...list.querySelectorAll("button")].indexOf(trigger) : -1
    withdrawFrom.current = { trigger, list, index }
    setWithdrawError(null)
    setWithdrawMessage("")
    setPendingCancel({ token: reg.token, shiftId: s.id, label: s.label || s.roleName, status: reg.status })
  }

  const shiftBar = (shiftId: string) => () => document.querySelector<HTMLElement>(`[data-shift-id="${CSS.escape(shiftId)}"]`)

  /** « Non, garder », Escape or « Fermer »: back to the ✕ (WebKit never focused a tapped one), else its bar, else the title. */
  function keepRegistration() {
    if (withdrawingRef.current || !pendingCancel) return
    const from = withdrawFrom.current
    setPendingCancel(null)
    setWithdrawError(null)
    setFocusRequest({ candidates: [from?.trigger, shiftBar(pendingCancel.shiftId), titleRef.current] })
  }

  /**
   * The withdrawal, with the dialog open until the server answers. A failure is said in the dialog
   * and removes nothing; a success removes the shift, closes the dialog, announces the result once
   * and moves focus to the row now at the ✕'s place (else the last one), else the shift's bar, else
   * the title.
   */
  async function withdraw() {
    const pending = pendingCancel
    if (!pending || withdrawingRef.current) return
    withdrawingRef.current = true
    setWithdrawing(true)
    setWithdrawError(null)
    let failure: { status?: number; network?: boolean; error?: string } | null = null
    const url = tokenPath("/api/public/registrations", pending.token)
    try {
      // Not a token (never from the server): nothing to cancel, said like an unknown link.
      const res = url ? await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: withdrawMessage }),
      }) : null
      if (!res) failure = { status: 404 }
      else if (!res.ok) {
        // Too late to cancel online (#946): the server says why, in words for the volunteer.
        const body = res.status === 409 ? await res.json().catch(() => null) : null
        failure = { status: res.status, error: typeof body?.error === "string" ? body.error : undefined }
      }
    } catch {
      failure = { network: true }
    }
    withdrawingRef.current = false
    setWithdrawing(false)

    if (failure) {
      if (failure.status === 409) setMyRegistrations((prev) => prev.map((r) => (r.token === pending.token ? { ...r, cancellable: false } : r)))
      setWithdrawError(withdrawFailureMessage(failure))
      // Already there after a keyboard press; WebKit leaves a tapped button unfocused. Refused for
      // good (#946): the confirm button goes, focus on « J'ai compris ».
      setFocusRequest({ candidates: [() => (failure?.status === 409 ? withdrawKeepRef.current : withdrawConfirmRef.current)] })
      return
    }

    const from = withdrawFrom.current
    const shift = event?.shifts.find((s) => s.id === pending.shiftId)
    setMyRegistrations((prev) => prev.filter((r) => r.token !== pending.token))
    setSelectedShifts((prev) => { const next = new Set(prev); next.delete(pending.shiftId); return next })
    setPendingCancel(null)
    if (shift) announce(setActionNotice, withdrawDoneMessage(pending.status, { ...shift, label: pending.label }))
    setFocusRequest({
      candidates: [
        () => {
          if (!from?.list?.isConnected || from.index < 0) return null
          const buttons = [...from.list.querySelectorAll<HTMLElement>("button")]
          return buttons[from.index] ?? buttons[buttons.length - 1]
        },
        shiftBar(pending.shiftId),
        titleRef.current,
      ],
    })
  }

  const allSelectedShifts = event.shifts.filter((s) => selectedShifts.has(s.id))
  const newShiftIds = new Set(allSelectedShifts.map((s) => s.id).filter((id) => !myShiftIds.has(id)))
  // The fixed « Continuer » bar of the shift choice, below lg (see the footer's bottom room).
  const showMobileCta = !previewResult && step === "select" && newShiftIds.size > 0
  // Embedded (#948): a resized frame is as tall as its content, a bar fixed to its bottom would sit
  // far below the visitor's screen. The button follows the selection instead.
  const fixedMobileCta = showMobileCta && !embed

  // The organiser's colour (#300): a band behind the title, neutral header otherwise.
  const accent = eventAccent(event.accentColorKey)

  const page = (
    <div className={embed ? "bg-gray-50" : "min-h-screen bg-gray-50"}>
      {/* The preview sits inside the admin layout, which already has its own skip link and main. */}
      {!preview && <SkipLink />}
      {preview && (
        <div className="bg-amber-50 border-b border-amber-300 px-4 py-3 text-sm text-amber-950">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <p>
              <strong>Aperçu</strong> : la page telle que la verront les bénévoles
              {event.publicStatus === "published" ? "" : ", alors que l'événement n'est pas encore publié"}. Rien n'est enregistré ni envoyé.
            </p>
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
              <Link href={preview.adminEventUrl} className="font-medium underline underline-offset-2">Retour à l&apos;événement</Link>
              {preview.helpLink}
            </div>
          </div>
        </div>
      )}
      <header className={`px-4 py-4 ${accent ? accent.band : "bg-white border-b border-gray-200"}`}>
        <div className="max-w-6xl mx-auto">
          <div className={`flex items-center ${embed ? "justify-end" : "justify-between"}`}>
            {/* Embedded (#948): no way back to the organisation's site, the frame is the association's. */}
            {!embed && <Link
              href={preview ? preview.adminEventUrl : "/"}
              className={`text-sm rounded focus-visible:outline-2 focus-visible:outline-offset-2 ${accent ? `underline underline-offset-2 ${accent.focus}` : "text-blue-600 focus-visible:outline-blue-600"}`}
            >
              <span aria-hidden="true">← </span>Retour
            </Link>}
            {myRegistrations.length > 0 && (
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${accent ? "" : "text-gray-600"}`}>
                  <span className="sr-only">Session ouverte au nom de </span>{form.firstName} {form.lastName}
                </span>
                <button
                  type="button"
                  onClick={quitSession}
                  className={`text-xs transition-colors border rounded-lg px-2 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 ${accent ? `border-white/70 hover:bg-white/15 ${accent.focus}` : "text-gray-500 hover:text-red-500 border-gray-200 focus-visible:outline-blue-600"}`}
                >
                  Quitter la session
                </button>
              </div>
            )}
          </div>
          {event.organizationLogo ? (
            <div className="flex items-center gap-2 mt-2">
              <OrgLogoImage logo={event.organizationLogo} organizationName={event.organizationName} nameShownBeside maxWidth={120} maxHeight={40} />
              <p className={`min-w-0 break-words text-xs font-medium ${accent ? accent.soft : "text-gray-500"}`}>{event.organizationName}</p>
            </div>
          ) : (
            <p className={`text-xs font-medium mt-2 ${accent ? accent.soft : "text-gray-500"}`}>{event.organizationName}</p>
          )}
          <h1 id="event-title" ref={titleRef} tabIndex={-1} className={`text-xl font-bold focus:outline-none ${accent ? "" : "text-gray-900"}`}>{event.title}</h1>
          {(event.location || coordinatesOf(event)) && (
            <p className={`text-sm ${accent ? accent.soft : "text-gray-500"}`}>
              <span aria-hidden="true">📍 </span>{event.location || "Point de rendez-vous"}
              {coordinatesOf(event) && (
                <>
                  {" "}
                  <a href={osmLink(coordinatesOf(event)!)} target="_blank" rel="noopener noreferrer" className={`underline underline-offset-2 whitespace-nowrap rounded focus-visible:outline-2 focus-visible:outline-offset-2 ${accent ? accent.focus : "text-blue-700 focus-visible:outline-blue-600"}`}>
                    {MAP_LINK_LABEL}<span className="sr-only">{MAP_LINK_SR_SUFFIX}</span>
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      </header>

      <ContentLandmark preview={!!preview} className={`max-w-6xl mx-auto px-4 py-6 ${embed ? "pb-6" : "pb-28"} lg:pb-10 space-y-4`}>
        {windowClosedText && (
          <p id="registration-window-msg" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">{windowClosedText}</p>
        )}
        {windowUntilText && <p className="text-sm text-gray-700">{windowUntilText}</p>}
        {reservedShiftIds.size > 0 && (
          <p id="reserved-roles-msg" className="text-sm text-gray-700">Les postes marqués « Réservé » sont réservés à certains membres. Si tu en fais partie, inscris-toi avec le lien personnel reçu par email.</p>
        )}
        {event.publicInstructions && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
            {event.publicInstructions}
          </div>
        )}

        {/* « Je ne suis pas disponible » (#558): only from an invitation link, only before any
            registration on this event — the open question answers "no" to offering it again once
            every shift has been withdrawn, and this page only ever sees the current session. */}
        {inviteToken && !preview && myRegistrations.length === 0 && !previewResult && (
          <DeclineInvite token={inviteToken} eventSlug={eventSlug} initialDeclined={declined} autoOpen={autoOpenDecline} fallbackFocusOnClose={() => titleRef.current} />
        )}

        {event.pages.length > 0 && (
          <nav aria-label="Pages de l'événement" className="flex flex-wrap gap-2">
            {event.pages.map((p) => (
              <Link
                key={p.slug}
                href={preview ? `${preview.adminEventUrl}/pages` : `/${eventSlug}/${p.slug}`}
                {...(embed ? { target: "_blank", rel: "noopener" } : {})}
                className="text-sm text-blue-600 border border-blue-200 px-3 py-1.5 rounded-full hover:bg-blue-50 transition-colors"
              >
                {p.title}
                {embed && <>{" "}<span className="sr-only">{NEW_TAB_HINT}</span></>}
              </Link>
            ))}
          </nav>
        )}

        {previewResult && (
          <section aria-labelledby="preview-result-heading" className="bg-white border border-amber-300 rounded-2xl p-5 space-y-4">
            <h2 id="preview-result-heading" tabIndex={-1} ref={resultHeadingRef} className="text-lg font-semibold text-gray-900 focus:outline-none">
              Aperçu de la confirmation (rien n&apos;a été enregistré)
            </h2>
            {previewResult.waitlistedShiftIds.length > 0 && (
              <p className="text-sm text-amber-950">
                {previewResult.waitlistedShiftIds.length} créneau{previewResult.waitlistedShiftIds.length > 1 ? "x" : ""} déjà complet{previewResult.waitlistedShiftIds.length > 1 ? "s" : ""} : le bénévole y serait placé en liste d&apos;attente et recevrait un autre email.
              </p>
            )}
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Message affiché après l&apos;inscription</h3>
              <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">
                {previewResult.confirmationMessage || "Aucun message de confirmation personnalisé (réglable dans les paramètres de l'événement)."}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Email de confirmation : {previewResult.subject}</h3>
              <iframe
                title={`Aperçu de l'email : ${previewResult.subject}`}
                srcDoc={previewResult.html}
                sandbox=""
                className="mt-2 w-full h-[70vh] max-h-[32rem] border border-gray-200 rounded-xl bg-white"
              />
              <p className="text-xs text-gray-600 mt-1">Le lien personnel de l&apos;email est factice dans cet aperçu.</p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewResult(null)}
              className="text-sm font-medium text-blue-700 underline underline-offset-2"
            >
              Revenir au formulaire
            </button>
          </section>
        )}

        {!previewResult && step === "select" && (
          <>
            {/* Always mounted, for the announcement; the visible note sits under the day's schedule. */}
            <p role="status" className="sr-only">{limitNotice}</p>
            {error && (
              <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} aria-label="Fermer le message d'erreur" className="text-red-700 hover:text-red-900 flex-shrink-0"><span aria-hidden="true">✕</span></button>
              </div>
            )}

            {proposedShiftId && (() => {
              const proposed = event.shifts.find((s) => s.id === proposedShiftId)
              const state = proposedShiftState(proposed, { myShiftIds, selected: selectedShifts, reservedIds: reservedShiftIds, accepting })
              const text = proposedShiftText(state, proposed ? spokenShift(proposed) : "")
              return (
                <div className={`rounded-xl border p-4 text-sm ${state === "unavailable" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-blue-200 bg-blue-50 text-blue-950"}`}>
                  {/* Focused after « Je prends ce créneau »: the button is gone, this says what happened. */}
                  <p ref={proposalTextRef} tabIndex={-1} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded">{text}</p>
                  {proposed && (state === "offer" || state === "waitlist") && (
                    <button
                      type="button"
                      onClick={() => {
                        if (toggleShift(proposed.id)) requestAnimationFrame(() => proposalTextRef.current?.focus())
                      }}
                      className="mt-3 min-h-11 rounded-xl bg-blue-700 px-4 font-medium text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      {state === "offer" ? "Je prends ce créneau" : "Rejoindre la liste d'attente"}
                    </button>
                  )}
                </div>
              )
            })()}

            {/* Share link per group (#947): which group the page is for, and the way out of the filter.
                One button whose label flips, so the focus stays on it; the result is announced. */}
            {groupFilter.kind === "filtered" && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 break-words">
                  {showAllRoles ? "Tous les postes de l'événement sont affichés." : groupFilterLine(groupFilter.name, groupFilter.roleNames.length)}
                </p>
                <button
                  type="button"
                  onClick={toggleGroupFilter}
                  className="min-h-11 rounded-xl border border-blue-700 bg-white px-4 font-medium text-blue-800 hover:bg-blue-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  {showAllRoles ? `Revenir aux postes de « ${groupFilter.name} »` : "Voir tous les postes"}
                </button>
              </div>
            )}
            {groupFilter.kind === "filtered" && <p role="status" className="sr-only">{groupNote}</p>}
            {groupNotice && (
              <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">{groupNotice}</p>
            )}

            {/* Frise or Liste (#808), once above every day; the pressed state says which is shown.
                « Voir qui est inscrit » (#1068) beside it, a separate switch, only for an identified
                visitor; its label never changes. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div role="group" aria-label="Affichage des créneaux" className="inline-flex rounded-xl border border-gray-300 text-sm">
              {(["frise", "liste"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={shiftView === view}
                  onClick={() => chooseShiftView(view)}
                  className={`min-h-11 px-4 font-medium transition-colors first:rounded-l-[11px] last:rounded-r-[11px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 forced-colors:aria-pressed:bg-[Highlight] ${shiftView === view ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"}`}
                >
                  {view === "frise" ? "Frise" : "Liste"}
                </button>
              ))}
            </div>
            {rosterUrl && (
              // A switch (DESIGN.md §5), not a third view: an on/off display setting beside the
              // group, its label constant, the whole line its 44 px target.
              <Switch
                checked={rosterOn}
                describedBy={rosterOn ? "roster-switch-explain" : undefined}
                onToggle={() => { rosterPressed.current = true; setRosterOn((on) => !on); setRosterResult(null); setRosterStatus(""); setRosterFailure("") }}
                data-roster-switch
              >
                {ROSTER_SWITCH_LABEL}
              </Switch>
            )}
            </div>
            {/* The guide's page on reading the schedule (#1096); in a sentence, not beside the switches. */}
            <p className="text-sm text-gray-700">Comment lire le planning et choisir tes créneaux : <DocMoreLink href={docHref(SECTION_DOC_LINKS.benevole.chooseShifts)} about="la lecture du planning" /></p>
            {rosterUrl && rosterOn && (
              <p id="roster-switch-explain" className="text-sm text-gray-700">
                {ROSTER_SWITCH_EXPLAIN}
                {/* Visible only: the result is said once by the status line below (DESIGN.md). */}
                {rosterLoading && <span className="ml-1 text-gray-600">Chargement…</span>}
              </p>
            )}
            {rosterUrl && (
              <>
                <p role="status" className="sr-only">{rosterStatus}</p>
                <p role="alert" className={rosterFailure && rosterOn ? "rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950" : "sr-only"}>{rosterOn ? rosterFailure : ""}</p>
              </>
            )}

            {/* minmax(0,1fr): the timelines column may shrink below the chart width and scroll */}
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8 lg:items-start">
              {/* Left: timelines */}
              <div className="space-y-6">
                {months && month && (
                  // A view filter of this page, not navigation: a group, like « Affichage des créneaux ».
                  <div role="group" aria-label="Choisir le mois" className="flex flex-wrap gap-2">
                    {months.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        aria-pressed={m.key === month.key}
                        onClick={() => { setChosenMonth(m.key); setMonthNote(`${m.label} : ${m.days.length} date${m.days.length > 1 ? "s" : ""} affichée${m.days.length > 1 ? "s" : ""}.`) }}
                        className={`min-h-11 px-4 rounded-xl border text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 forced-colors:aria-pressed:bg-[Highlight] ${m.key === month.key ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
                      >
                        <span className="first-letter:uppercase inline-block">{m.label}</span>
                        <span className="sr-only">, </span>
                        <span className={`ml-1 ${m.key === month.key ? "text-gray-200" : "text-gray-600"}`}>({m.days.length} date{m.days.length > 1 ? "s" : ""})</span>
                      </button>
                    ))}
                  </div>
                )}
                {months && <p aria-live="polite" className="sr-only">{monthNote}</p>}
                {longEvent && shownDays.length === 0 && (
                  <p className="text-center py-8 text-gray-700">Plus aucune date à venir.</p>
                )}
                {daysOnPage.map((day) => [day, shiftsByDay[day]] as const).map(([day, dayShifts]) => {
                  const dayShows = (event.showSchedule ?? []).filter((s) => s.date === day)
                  return (
                    <div key={day}>
                      <h2 className="text-sm font-semibold text-gray-600 mb-3">
                        {formatCalendarDay(day)}
                      </h2>
                      {shiftView === "frise" && (
                        <p className="sm:hidden text-[11px] text-gray-500 text-center mb-1.5">
                          <span aria-hidden="true">← </span>Fais défiler pour voir toutes les plages<span aria-hidden="true"> →</span>
                        </p>
                      )}
                      {shiftView === "liste" ? (
                        <ShiftDayList
                          shifts={dayShifts}
                          shows={dayShows}
                          selected={selectedShifts}
                          held={heldByShift}
                          conflicts={conflictingShiftIds}
                          onToggle={toggleShift}
                          locked={!accepting}
                          lockedMessageId={!accepting ? "registration-window-msg" : undefined}
                          reservedMessageId={reservedShiftIds.size > 0 ? "reserved-roles-msg" : undefined}
                          limitReachedRoles={limitReachedRoles}
                          reservedShiftIds={reservedShiftIds}
                          dayLabel={formatCalendarDay(day)}
                          roster={shownRoster}
                        />
                      ) : (
                      <DayTimeline
                        shifts={dayShifts}
                        shows={dayShows}
                        selected={selectedShifts}
                        held={heldByShift}
                        conflicts={conflictingShiftIds}
                        onToggle={toggleShift}
                        locked={!accepting}
                        describedBy={[!accepting && "registration-window-msg", reservedShiftIds.size > 0 && "reserved-roles-msg"].filter(Boolean).join(" ") || undefined}
                        limitReachedRoles={limitReachedRoles}
                        reservedShiftIds={reservedShiftIds}
                        dayLabel={formatCalendarDay(day)}
                        roster={shownRoster}
                      />
                      )}
                      {limitNotice && limitNoticeDay === day && (
                        <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">{limitNotice}</p>
                      )}
                    </div>
                  )
                })}

                {!hasAvailableShift && (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-lg font-medium">{groupFiltered && !showAllRoles ? "Tous les créneaux de ces postes sont complets." : "Tous les créneaux sont complets."}</p>
                    <p className="text-sm mt-1">Merci pour ton intérêt !</p>
                  </div>
                )}

                {/* Mobile: selected shifts summary card */}
                {allSelectedShifts.length > 0 && (
                  <div data-shift-list className="lg:hidden rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
                    {allSelectedShifts.map((s) => <ShiftRow key={s.id} shift={s} registered={myShiftIds.has(s.id)} status={myStatus.get(s.id)} cancellable={!closedShiftIds.has(s.id)} personalHref={myTokenByShift.get(s.id)} newTab={embed} selected={selectedShifts.has(s.id)} onCancel={(trigger) => requestCancel(s, trigger)} onRemove={() => toggleShift(s.id)} />)}
                  </div>
                )}
              </div>

              {/* Desktop right sidebar */}
              <div className="hidden lg:block">
                <div className="sticky top-6 space-y-4">
                  {/* Event info card */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <p className="text-xs text-gray-500 font-semibold mb-1">{event.organizationName}</p>
                    <p className="text-sm font-bold text-gray-900">{event.title}</p>
                    {event.description && (
                      <p className="text-sm text-gray-500 mt-2 leading-relaxed line-clamp-4">{event.description}</p>
                    )}
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-xs text-gray-500">
                      <div>
                        <span aria-hidden="true">📅 </span>{formatCalendarDay(event.startDate)}
                        {event.startDate !== event.endDate && ` – ${formatCalendarDay(event.endDate)}`}
                      </div>
                      {event.location && <div><span aria-hidden="true">📍 </span>{event.location}</div>}
                    </div>
                  </div>

                  {/* Selected shifts + CTA */}
                  {allSelectedShifts.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                      <p className="px-4 pt-3 pb-2 text-xs font-semibold text-gray-500 border-b border-gray-100">
                        Créneaux sélectionnés
                      </p>
                      <div data-shift-list className="divide-y divide-gray-100">
                        {allSelectedShifts.map((s) => <ShiftRow key={s.id} shift={s} compact registered={myShiftIds.has(s.id)} status={myStatus.get(s.id)} cancellable={!closedShiftIds.has(s.id)} personalHref={myTokenByShift.get(s.id)} newTab={embed} selected={selectedShifts.has(s.id)} onCancel={(trigger) => requestCancel(s, trigger)} onRemove={() => toggleShift(s.id)} />)}
                      </div>
                      {newShiftIds.size > 0 && (
                        <div className="p-3 border-t border-gray-100">
                          <button
                            data-continue
                            onClick={openForm}
                            className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 motion-safe:active:scale-[0.98] transition-all"
                          >
                            Continuer ({newShiftIds.size} nouveau{newShiftIds.size > 1 ? "x" : ""} créneau{newShiftIds.size > 1 ? "x" : ""})
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* « J'ai perdu mon lien personnel » (#1097): the request of the « Ce lien ne fonctionne
                pas » page (same route, limits and neutral answer, no link on screen, #285) for a
                visitor without a session. A native disclosure; under lg its controls keep clear of
                the fixed « Continuer » bar when focused (scroll-margin, WCAG 2.4.11). */}
            {showsLostLinkEntry({ preview: !!preview, sessionRegistrations: myRegistrations.length }) && (
              <details className="group scroll-mb-32 lg:scroll-mb-0">
                <summary className="inline-flex min-h-11 lg:min-h-6 cursor-pointer list-none items-center gap-1 rounded py-0.5 text-sm font-medium text-blue-700 hover:text-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 scroll-mb-32 lg:scroll-mb-0 [&::-webkit-details-marker]:hidden">
                  {/* Underline on the words only: on the summary it would turn with the ▸ once open. */}
                  <span aria-hidden="true" className="inline-block motion-safe:transition-transform group-open:rotate-90">▸</span>
                  <span className="underline underline-offset-2">{LOST_LINK_SUMMARY}</span>
                </summary>
                <div className="mt-3 max-w-md rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                  <LinkRequestForm variant="lost" scrollClass="scroll-mb-32 lg:scroll-mb-0" />
                  <p className="text-xs"><DocMoreLink href={PERSONAL_LINK_DOC_LINKS.lostLink} about="le lien personnel perdu" className="scroll-mb-32 lg:scroll-mb-0" /></p>
                </div>
              </details>
            )}

            {/* Embedded, mobile: the same button after the selection, in the flow of the page. */}
            {showMobileCta && embed && (
              <div className="lg:hidden">
                <button
                  data-continue
                  onClick={openForm}
                  className="w-full bg-blue-600 text-white rounded-2xl py-4 text-base font-semibold hover:bg-blue-700 motion-safe:active:scale-[0.98] transition-all"
                >
                  Continuer ({newShiftIds.size} nouveau{newShiftIds.size > 1 ? "x" : ""} créneau{newShiftIds.size > 1 ? "x" : ""})
                </button>
              </div>
            )}

            {/* Mobile: fixed bottom CTA */}
            {fixedMobileCta && (
              <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
                <div className="max-w-2xl mx-auto px-4 pb-5 pt-10 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent pointer-events-none">
                  <button
                    data-continue
                    onClick={openForm}
                    className="w-full bg-blue-600 text-white rounded-2xl py-4 text-base font-semibold shadow-xl hover:bg-blue-700 motion-safe:active:scale-[0.98] transition-all pointer-events-auto"
                  >
                    Continuer ({newShiftIds.size} nouveau{newShiftIds.size > 1 ? "x" : ""} créneau{newShiftIds.size > 1 ? "x" : ""})
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {!previewResult && step === "form" && (
          <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-8 lg:items-start">
            {/* Desktop right sidebar for form step: first in the DOM so the recap is read before the confirm button, placed on the right by the grid. */}
            <div className="hidden lg:block lg:col-start-2 lg:row-start-1">
              <div className="sticky top-6 bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <SignupRecap
                  shifts={event.shifts.filter((s) => selectedShifts.has(s.id))}
                  requirePhone={event.requirePhone}
                  phoneGiven={form.phone.trim().length > 0}
                  commentGiven={form.comment.trim().length > 0}
                  answeredQuestions={visibleQuestions(formQuestions, answers).filter((q) => { const v = answers[q.id]; return Array.isArray(v) ? v.length > 0 : !!v && String(v).trim() !== "" }).map((q) => q.label)}
                  heldShifts={heldShifts}
                  timeZone={event.timeZone}
                  workload={event.workload}
                  variant="sidebar"
                />
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                  <p className="text-[11px] text-gray-500 font-medium">{event.organizationName}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{event.title}</p>
                  {event.location && <p className="text-xs text-gray-500 mt-1"><span aria-hidden="true">📍 </span>{event.location}</p>}
                </div>
              </div>
            </div>
            {/* Form */}
            <div className="bg-white rounded-2xl border border-blue-200 p-5 lg:col-start-1 lg:row-start-1">
              <div className="flex items-center gap-2 mb-5">
                <button onClick={() => { stepFocus.current = "select"; setStep("select") }} className="text-blue-600 text-sm"><span aria-hidden="true">← </span>Retour</button>
                <h2 ref={formHeadingRef} tabIndex={-1} className="text-base font-semibold text-gray-800 focus:outline-none">Tes informations</h2>
              </div>

              {/* Mobile: the recap inside the form card (#373); the desktop sidebar shows the same. */}
              <div className="lg:hidden bg-gray-50 rounded-xl p-3 mb-5">
                <SignupRecap
                  shifts={event.shifts.filter((s) => selectedShifts.has(s.id))}
                  requirePhone={event.requirePhone}
                  phoneGiven={form.phone.trim().length > 0}
                  commentGiven={form.comment.trim().length > 0}
                  answeredQuestions={visibleQuestions(formQuestions, answers).filter((q) => { const v = answers[q.id]; return Array.isArray(v) ? v.length > 0 : !!v && String(v).trim() !== "" }).map((q) => q.label)}
                  heldShifts={heldShifts}
                  timeZone={event.timeZone}
                  workload={event.workload}
                  variant="card"
                />
              </div>

              {/* Above the form (#1096): not a Tab stop between its fields. */}
              <p className="mb-4 text-sm"><DocMoreLink href={docHref(SECTION_DOC_LINKS.benevole.signUp)} about="l'inscription" /></p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <p aria-hidden="true" className="text-xs text-gray-600">Les champs marqués d&apos;un astérisque (*) sont obligatoires.</p>
                {inSession && (
                  <p className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">{sessionFormNote(formQuestions.length > 0)}</p>
                )}
                {usedRemembered && myRegistrations.length === 0 && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
                    <p className="text-sm text-gray-700">Coordonnées reprises de ta dernière inscription sur cet appareil.</p>
                    <button
                      type="button"
                      onClick={forgetContact}
                      className="text-sm text-blue-700 underline underline-offset-2 rounded min-h-11 sm:min-h-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      Ce n&apos;est pas moi, effacer
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-firstname" className="block text-sm font-medium text-gray-700 mb-1">Prénom<RequiredMark /></label>
                    <input
                      id="reg-firstname"
                      type="text"
                      required
                      autoComplete="given-name"
                      value={form.firstName}
                      onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                      className="w-full border border-gray-500 rounded-xl px-3 py-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-lastname" className="block text-sm font-medium text-gray-700 mb-1">Nom<RequiredMark /></label>
                    <input
                      id="reg-lastname"
                      type="text"
                      required
                      autoComplete="family-name"
                      value={form.lastName}
                      onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                      className="w-full border border-gray-500 rounded-xl px-3 py-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="reg-email" className="block text-sm font-medium text-gray-700 mb-1">Email<RequiredMark /></label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    autoComplete="email"
                    aria-describedby={inSession ? "reg-email-hint" : undefined}
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-500 rounded-xl px-3 py-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                  {inSession && <p id="reg-email-hint" className="text-xs text-gray-600 mt-1">{SESSION_EMAIL_HINT}</p>}
                </div>
                <div>
                  <label htmlFor="reg-phone" className="block text-sm font-medium text-gray-700 mb-1">
                    {event?.requirePhone
                      ? <>Téléphone<RequiredMark /></>
                      : <>Téléphone <span className="text-gray-500 font-normal">(facultatif, mais super utile)</span></>}
                  </label>
                  <input
                    id="reg-phone"
                    type="tel"
                    required={event?.requirePhone ?? false}
                    autoComplete="tel"
                    maxLength={SIGNUP_PHONE_MAX}
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full border border-gray-500 rounded-xl px-3 py-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {ageGatedSelectedShifts.length > 0 && (
                  <div>
                    <label htmlFor="reg-birthdate" className="block text-sm font-medium text-gray-700 mb-1">Date de naissance<RequiredMark /></label>
                    <input
                      id="reg-birthdate"
                      type="date"
                      required
                      autoComplete="bday"
                      aria-describedby="reg-birthdate-hint"
                      value={form.birthDate}
                      onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                      className="w-full border border-gray-500 rounded-xl px-3 py-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                    <p id="reg-birthdate-hint" className="text-xs text-gray-500 mt-1">
                      Requis : {ageGatedSelectedShifts.map((s) => `${s.label} (${s.minAge} ans min.)`).join(", ")}
                    </p>
                  </div>
                )}
                <SignupQuestions
                  questions={formQuestions}
                  answers={answers}
                  onChange={(qid, value) => {
                    setAnswers((a) => ({ ...a, [qid]: value }))
                    // A corrected field no longer says it is invalid.
                    setQuestionErrors((m) => { if (!m.has(qid)) return m; const n = new Map(m); n.delete(qid); return n })
                  }}
                  errors={questionErrors}
                  clearable={inSession}
                />
                <div>
                  <label htmlFor="reg-comment" className="block text-sm font-medium text-gray-700 mb-1">Commentaire <span className="text-gray-500 font-normal">(facultatif)</span></label>
                  <textarea
                    id="reg-comment"
                    rows={2}
                    maxLength={SIGNUP_COMMENT_MAX}
                    value={form.comment}
                    onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                    className="w-full border border-gray-500 rounded-xl px-3 py-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    id="reg-charter"
                    type="checkbox"
                    checked={charterAccepted}
                    aria-invalid={invalidCheckbox === "charter" || undefined}
                    aria-describedby={invalidCheckbox === "charter" ? (failure ? "signup-failure" : "signup-error") : undefined}
                    onChange={(e) => { setCharterAccepted(e.target.checked); if (e.target.checked && invalidCheckbox === "charter") setInvalidCheckbox(null) }}
                    className="mt-0.5 h-4 w-4 rounded border-gray-500 text-blue-600"
                  />
                  <span className="text-sm text-gray-600">
                    J&apos;ai lu et j&apos;accepte la{" "}
                    <button
                      ref={charterTriggerRef}
                      type="button"
                      // Same WebKit fallback to <main> as for the ✕: ModalShell restores its opener.
                      onClick={() => setShowCharter(true)}
                      className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
                    >
                      convention des bénévoles
                    </button>
                    .
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    id="reg-consent"
                    type="checkbox"
                    checked={form.consent}
                    aria-invalid={invalidCheckbox === "consent" || undefined}
                    aria-describedby={invalidCheckbox === "consent" ? "signup-error" : undefined}
                    onChange={(e) => { const checked = e.target.checked; setForm((f) => ({ ...f, consent: checked })); if (checked && invalidCheckbox === "consent") setInvalidCheckbox(null) }}
                    className="mt-0.5 h-4 w-4 rounded border-gray-500 text-blue-600"
                  />
                  <span className="text-sm text-gray-600">
                    J&apos;accepte que l&apos;association qui organise cet événement utilise mes données pour gérer ses bénévoles, pour cet événement et les suivants.
                  </span>
                </label>
                {/* Outside the label, so the checkbox name stays the sentence; a new tab, so the form is kept (#706). */}
                <p className="pl-7 -mt-2 text-sm">
                  <Link href={privacyHref} target="_blank" className="text-blue-600 underline underline-offset-2 hover:text-blue-800 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                    Mes droits et combien de temps mes données sont gardées<span className="sr-only"> (ouvre dans un nouvel onglet)</span>
                  </Link>
                </p>

                {/* Shift roster (#1068): a separate, optional choice, unticked; never part of the
                    required boxes above. A minor's birth date replaces it with a sentence (not a
                    live region: it changes while typing in the date field). */}
                {rosterBox && (
                  <div>
                    {rosterBox === "box" ? (
                      <>
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            id="reg-roster"
                            type="checkbox"
                            checked={rosterNameVisible}
                            aria-describedby="reg-roster-hint"
                            onChange={(e) => setRosterNameVisible(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-gray-500 text-blue-600"
                          />
                          <span className="text-sm text-gray-600">{(() => {
                            // « Aline M. » spoken « Aline, initiale M » (not « Monsieur »).
                            const [before, after] = ROSTER_SIGNUP_LABEL.split("Aline M.")
                            return after === undefined ? ROSTER_SIGNUP_LABEL : <>{before}<RosterName name="Aline M." />{after}</>
                          })()}</span>
                        </label>
                        <p id="reg-roster-hint" className="pl-7 mt-1 text-xs text-gray-600">{ROSTER_SIGNUP_HINT}</p>
                        {/* Outside the hint: the box's description must not read the link. */}
                        <p className="pl-7 text-xs"><DocMoreLink href={ROSTER_DOC_LINKS.signup} about={ROSTER_DOC_TOPIC} /></p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-600">{ROSTER_MINOR_TEXT}</p>
                    )}
                  </div>
                )}

                {error && (
                  <div id="signup-error" role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
                {failure && (
                  // Focused when it appears: the submit button lost the focus while the request ran.
                  <div id="signup-failure" ref={failureRef} tabIndex={-1} role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800 space-y-1 focus:outline-none">
                    <p className="font-semibold">{failure.title}</p>
                    <p>{failure.message}</p>
                    <p className="text-red-700">{failure.hint}</p>
                    {(failure.kind === "conflict" || failure.kind === "duplicate") && (
                      <button type="button" onClick={() => { setFailure(null); stepFocus.current = "select"; setStep("select") }} className="mt-1 text-sm font-medium text-red-800 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
                        Revenir au planning
                      </button>
                    )}
                  </div>
                )}

                {workloadBlocked && <p id="signup-workload-blocked" className="sr-only">Ces créneaux dépassent les limites de pauses et de charge de l&apos;événement : retire ou change un créneau.</p>}
                <button
                  ref={submitButtonRef}
                  type="submit"
                  aria-disabled={submitting || undefined}
                  aria-describedby={workloadBlocked ? "signup-workload-blocked" : undefined}
                  className={`w-full bg-blue-600 text-white rounded-2xl py-4 text-base font-semibold hover:bg-blue-700 motion-safe:active:scale-[0.98] transition-all ${submitting ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {submitting ? "Envoi en cours…" : preview ? "Voir la confirmation (aperçu)" : "Confirmer mon inscription"}
                </button>
              </form>
            </div>

          </div>
        )}
      </ContentLandmark>

      {showCharter && (
        <ModalShell
          title="Convention des Bénévoles"
          onClose={closeCharter}
          closeOnBackdrop={false}
          panelClassName="max-w-lg"
        >
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {resolveCharterText(event.volunteerCharter, event.hasOrgInsurance)}
          </div>
          <div className="pt-4 mt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => { setCharterAccepted(true); closeCharter() }}
              className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              J&apos;ai lu et j&apos;accepte
            </button>
          </div>
        </ModalShell>
      )}

      {pendingCancel && (
        <WithdrawDialog
          copy={withdrawCopy(pendingCancel.status, pendingCancel.label)}
          label={pendingCancel.label}
          busy={withdrawing}
          error={withdrawError}
          message={withdrawMessage}
          onMessageChange={setWithdrawMessage}
          onConfirm={withdraw}
          onKeep={keepRegistration}
          confirmRef={withdrawConfirmRef}
          keepRef={withdrawKeepRef}
          closed={myRegistrations.find((r) => r.token === pendingCancel.token)?.cancellable === false}
        />
      )}

      {/* Always mounted, outside the steps: the result of a withdrawal. The role limit has its own. */}
      <p id="action-notice" role="status" className="sr-only">{actionNotice}</p>

      {/* Below lg the fixed « Continuer » bar covers the bottom of the page: room under the
          footer so a focused footer link is never hidden behind it (WCAG 2.4.11). */}
      <div className={`px-4 ${fixedMobileCta ? "pb-28 lg:pb-0" : ""}`}>
        <PublicFooter variant={embed ? "embed" : "event"} site={footerSite} />
      </div>
    </div>
  )
  return embed ? <EmbedFrame>{page}</EmbedFrame> : page
}

/**
 * The page content after the header: the skip link's target on the public page. In the admin
 * preview it is a plain <div>, the admin layout's <main id="main"> already wrapping the page.
 * The header (title, session) stays a banner outside it, the dialogs and the footer after it.
 */
function ContentLandmark({ preview, className, children }: { preview: boolean; className: string; children: React.ReactNode }) {
  if (preview) return <div className={className}>{children}</div>
  return (
    // Named by the event title (in the banner above): « Aller au contenu » lands on « <title>, main ».
    <main id={MAIN_CONTENT_ID} tabIndex={-1} aria-labelledby="event-title" className={`${className} focus:outline-none`}>
      {children}
    </main>
  )
}
