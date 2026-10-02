"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react"
import { closedMessage, openUntilMessage, registrationState } from "@/lib/registration-window"
import { eventAccent } from "@/lib/event-accent"
import { coordinatesOf, MAP_LINK_LABEL, MAP_LINK_SR_SUFFIX, osmLink } from "@/lib/map-link"
import { describeSignupFailure, type Failure } from "@/lib/form-errors"
import SignupRecap from "@/components/public/SignupRecap"
import ShiftRow from "@/components/public/ShiftRow"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { formatDate } from "@/lib/utils"
import {
  EMPTY_SIGNUP_FORM,
  conflictingShiftIds as computeConflictingShiftIds,
  hasAvailableShift as anyShiftAvailable,
  isShiftSelectable,
  prefillContact,
  shiftsByDay as groupShiftsByDay,
  toMyRegistrations,
  validateSignup,
  type MyRegistration,
  type SignupForm,
} from "@/lib/public-signup"
import { roleLimitBreaches, roleLimitSelectionMessage, roleLimits } from "@/lib/role-limit"
import { announce } from "@/lib/announce"
import { focusFirstAvailable, type FocusCandidate } from "@/lib/focus-return"
import { withdrawCopy, withdrawDoneMessage, withdrawFailureMessage } from "@/lib/volunteer-withdraw"
import ModalShell from "@/components/admin/ModalShell"
import WithdrawDialog from "@/components/public/WithdrawDialog"
import SignupQuestions, { type Answers } from "@/components/public/SignupQuestions"
import { checkAnswers, type Question } from "@/lib/event-questions"
import DayTimeline from "@/components/DayTimeline"
import { heldKinds } from "@/lib/public-timeline"
import PublicFooter from "@/components/PublicFooter"
import { DEFAULT_VOLUNTEER_CHARTER } from "@/lib/volunteer-charter"


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
}

type Show = { name: string; date: string; startTime: string; endTime: string }

type EventData = {
  /** Custom sign-up questions (#483). */
  questions?: Question[]
  id: string
  slug: string
  title: string
  organizationName: string
  description: string | null
  location: string | null
  latitude?: number | null
  longitude?: number | null
  startDate: string
  endDate: string
  publicInstructions: string | null
  confirmationMessage: string | null
  requirePhone: boolean
  registrationsOpen: boolean
  registrationOpensAt: string | null
  registrationClosesAt: string | null
  timeZone: string
  accentColorKey: string | null
  showSchedule: Show[]
  volunteerCharter: string | null
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
 */
export default function EventPageClient({ orgSlug, eventSlug, preview }: {
  orgSlug: string
  eventSlug: string
  preview?: { eventId: string; adminEventUrl: string }
}) {
  const previewEventId = preview?.eventId ?? null
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get("token")

  type MyReg = MyRegistration

  const [event, setEvent] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedShifts, setSelectedShifts] = useState<Set<string>>(new Set())
  const [limitNotice, setLimitNotice] = useState("")
  const [answers, setAnswers] = useState<Answers>({})
  const [questionErrors, setQuestionErrors] = useState<Map<string, string>>(new Map())
  // Reserved roles (#470) the visitor's invitation opens; none without an invitation.
  const [allowedReserved, setAllowedReserved] = useState<Set<string>>(new Set())
  // The day of the refused shift: the visible note sits under that day's schedule, where the click was.
  const [limitNoticeDay, setLimitNoticeDay] = useState<string | null>(null)
  const [myRegistrations, setMyRegistrations] = useState<MyReg[]>([])
  // The withdrawal confirmation of a held shift (#584), its request and its failure.
  const [pendingCancel, setPendingCancel] = useState<{ token: string; shiftId: string; label: string; status: string } | null>(null)
  const [withdrawing, setWithdrawing] = useState(false)
  const withdrawingRef = useRef(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const withdrawConfirmRef = useRef<HTMLButtonElement>(null)
  // Where the withdrawal was asked from: the ✕, its list and its place there, for the focus after.
  const withdrawFrom = useRef<{ trigger: HTMLButtonElement; list: Element | null; index: number } | null>(null)
  // Result of an action outside the sign-up steps (a withdrawal), voiced once.
  const [actionNotice, setActionNotice] = useState("")
  const [step, setStep] = useState<"select" | "form">("select")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A structured failure of the sign-up itself (#375): kind, what to do, whether to retry.
  const [failure, setFailure] = useState<Failure | null>(null)
  const failureRef = useRef<HTMLDivElement>(null)
  // « Quitter la session » removes itself: the focus lands on the title instead of the body.
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [charterAccepted, setCharterAccepted] = useState(false)
  const [showCharter, setShowCharter] = useState(false)
  const charterTriggerRef = useRef<HTMLButtonElement>(null)
  const [form, setForm] = useState<SignupForm>(EMPTY_SIGNUP_FORM)
  // Preview (#370): focus the result when it appears, and the submit button when going back to
  // the form (the result panel unmounts, focus would otherwise fall to <body>).
  const resultHeadingRef = useRef<HTMLHeadingElement>(null)
  const submitButtonRef = useRef<HTMLButtonElement>(null)
  const hadPreviewResult = useRef(false)

  // Focus to move once React has committed the render it goes with (a dialog closed, a row removed),
  // the RoleManagerPanel pattern. Only while focus is in a dialog or was dropped to <body> by an
  // unmounted control: an answer that arrives after the user went elsewhere does not pull it back.
  const [focusRequest, setFocusRequest] = useState<{ candidates: FocusCandidate[] } | null>(null)
  useLayoutEffect(() => {
    if (!focusRequest) return
    const active = document.activeElement
    const free = active === null || active === document.body || !!active.closest("[role=dialog],[role=alertdialog]")
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

  // Shifts among the current selection that require a minimum age (#192) — drives whether the
  // form asks for a date of birth.
  const ageGatedSelectedShifts = useMemo(
    () => (event?.shifts ?? []).filter((s) => selectedShifts.has(s.id) && !myShiftIds.has(s.id) && s.minAge != null),
    [event, selectedShifts, myShiftIds]
  )

  const conflictingShiftIds = useMemo(
    () => (event ? computeConflictingShiftIds(event.shifts, selectedShifts, myShiftIds) : new Set<string>()),
    [event, selectedShifts, myShiftIds]
  )

  useEffect(() => {
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
  }, [eventSlug, orgSlug, previewEventId])

  useEffect(() => {
    if (!inviteToken || previewEventId) return
    fetch(`/api/public/member-invite/${inviteToken}?slug=${encodeURIComponent(eventSlug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.member) return
        setForm((f) => prefillContact(f, data.member, "form"))
        setAllowedReserved(new Set<string>(data.reservedRolesAllowed ?? []))
      })
      .catch(() => {})
  }, [inviteToken, eventSlug, previewEventId])

  useEffect(() => {
    if (previewEventId) return // a preview never picks up a volunteer's session on this browser
    const token = localStorage.getItem(storageKey)
    if (!token) return
    fetch(`/api/public/registrations/${token}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.registrations) return
        const regs = toMyRegistrations(data.registrations)
        setMyRegistrations(regs)
        if (data.volunteer) setForm((f) => prefillContact(f, data.volunteer, "source"))
        setSelectedShifts((prev) => {
          const next = new Set(prev)
          regs.forEach((r: MyReg) => next.add(r.shiftId))
          return next
        })
      })
      .catch(() => {})
  }, [storageKey, previewEventId])

  if (loading) return <div role="status" className="flex items-center justify-center min-h-screen text-gray-500">Chargement…</div>
  if (!event) return <div role="alert" className="flex items-center justify-center min-h-screen text-gray-500">Événement introuvable.</div>

  // Registration window (#463). This page only shows published events, or a preview of what
  // volunteers will see once published: either way, the window decides.
  const windowState = registrationState({ ...event, publicStatus: "published" })
  const accepting = windowState.open
  const windowClosedText = closedMessage(windowState, event.timeZone)
  const windowUntilText = openUntilMessage(windowState, event.timeZone)
  const shiftsByDay = groupShiftsByDay(event.shifts)
  const hasAvailableShift = anyShiftAvailable(event.shifts)

  function toggleShift(id: string) {
    if (!accepting && !selectedShifts.has(id)) return
    const target = event?.shifts.find((s) => s.id === id)
    if (!isShiftSelectable(target, myShiftIds)) return
    // Reserved bars are disabled (#470); this guards any other way in.
    if (reservedShiftIds.has(id) && !selectedShifts.has(id)) return
    // Shifts per volunteer for a role (#466): said here, before the form; the server decides.
    if (target && event && !selectedShifts.has(id)) {
      const asked = event.shifts.filter((s) => selectedShifts.has(s.id) && !myShiftIds.has(s.id))
      const held = event.shifts.filter((s) => myShiftIds.has(s.id))
      const [breach] = roleLimitBreaches([...asked, target], held, roleLimits(event.shifts))
      if (breach) {
        setLimitNoticeDay(target.date.slice(0, 10))
        announce(setLimitNotice, roleLimitSelectionMessage(breach))
        return
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
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const invalid = validateSignup({
      form,
      charterAccepted,
      requirePhone: event?.requirePhone ?? false,
      ageGatedShifts: ageGatedSelectedShifts,
    })
    if (invalid) { setFailure(null); setQuestionErrors(new Map()); setError(invalid); return }
    // Custom questions (#483): the same check as the server, the first refused field focused.
    const answerCheck = checkAnswers(event?.questions ?? [], answers)
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
          answers,
          inviteToken: inviteToken ?? undefined,
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
      requestAnimationFrame(() => failureRef.current?.focus())
      return
    }

    // No editToken when the address already belonged to a volunteer and nothing proved the
    // submitter owns it: the management link then only goes out by email (#285).
    const params = new URLSearchParams()
    if (data.editToken) {
      localStorage.setItem(storageKey, data.editToken)
      params.set("token", data.editToken)
    }
    if (data.onWaitlist) params.set("waitlist", "1")
    if (Number(data.requestedShifts) > 0) {
      params.set("requested", String(data.requestedShifts))
      params.set("active", String(data.activeShifts ?? 0))
    }
    const query = params.toString()
    router.push(`/${eventSlug}/success${query ? `?${query}` : ""}`)
  }

  function quitSession() {
    localStorage.removeItem(storageKey)
    setMyRegistrations([])
    setSelectedShifts(new Set())
    setForm(EMPTY_SIGNUP_FORM)
    requestAnimationFrame(() => titleRef.current?.focus())
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
    let failure: { status?: number; network?: boolean } | null = null
    try {
      const res = await fetch(`/api/public/registrations/${pending.token}`, { method: "DELETE" })
      if (!res.ok) failure = { status: res.status }
    } catch {
      failure = { network: true }
    }
    withdrawingRef.current = false
    setWithdrawing(false)

    if (failure) {
      setWithdrawError(withdrawFailureMessage(failure))
      // Already there after a keyboard press; WebKit leaves a tapped button unfocused.
      setFocusRequest({ candidates: [() => withdrawConfirmRef.current] })
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

  const Root = previewEventId ? "div" : "main"
  // The organiser's colour (#300): a band behind the title, neutral header otherwise.
  const accent = eventAccent(event.accentColorKey)

  return (
    <Root className="min-h-screen bg-gray-50">
      {preview && (
        <div className="bg-amber-50 border-b border-amber-300 px-4 py-3 text-sm text-amber-950">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <p>
              <strong>Aperçu</strong> : la page telle que la verront les bénévoles
              {event.publicStatus === "published" ? "" : ", alors que l'événement n'est pas encore publié"}. Rien n'est enregistré ni envoyé.
            </p>
            <Link href={preview.adminEventUrl} className="font-medium underline underline-offset-2">Retour à l&apos;événement</Link>
          </div>
        </div>
      )}
      <header className={`px-4 py-4 ${accent ? accent.band : "bg-white border-b border-gray-200"}`}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <Link
              href={preview ? preview.adminEventUrl : "/"}
              className={`text-sm rounded focus-visible:outline-2 focus-visible:outline-offset-2 ${accent ? `underline underline-offset-2 ${accent.focus}` : "text-blue-600 focus-visible:outline-blue-600"}`}
            >
              <span aria-hidden="true">← </span>Retour
            </Link>
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
          <p className={`text-xs font-medium mt-2 ${accent ? accent.soft : "text-gray-500"}`}>{event.organizationName}</p>
          <h1 ref={titleRef} tabIndex={-1} className={`text-xl font-bold focus:outline-none ${accent ? "" : "text-gray-900"}`}>{event.title}</h1>
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

      <div className="max-w-6xl mx-auto px-4 py-6 pb-28 lg:pb-10 space-y-4">
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

        {event.pages.length > 0 && (
          <nav aria-label="Pages de l'événement" className="flex flex-wrap gap-2">
            {event.pages.map((p) => (
              <Link
                key={p.slug}
                href={preview ? `${preview.adminEventUrl}/pages` : `/${eventSlug}/${p.slug}`}
                className="text-sm text-blue-600 border border-blue-200 px-3 py-1.5 rounded-full hover:bg-blue-50 transition-colors"
              >
                {p.title}
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

            {/* minmax(0,1fr): the timelines column may shrink below the chart width and scroll */}
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8 lg:items-start">
              {/* Left: timelines */}
              <div className="space-y-6">
                {Object.entries(shiftsByDay).map(([day, dayShifts]) => {
                  const dayShows = (event.showSchedule ?? []).filter((s) => s.date === day)
                  return (
                    <div key={day}>
                      <h2 className="text-sm font-semibold text-gray-600 mb-3">
                        {formatDate(day)}
                      </h2>
                      <p className="sm:hidden text-[11px] text-gray-500 text-center mb-1.5">
                        <span aria-hidden="true">← </span>Fais défiler pour voir toutes les plages<span aria-hidden="true"> →</span>
                      </p>
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
                        dayLabel={formatDate(day)}
                      />
                      {limitNotice && limitNoticeDay === day && (
                        <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">{limitNotice}</p>
                      )}
                    </div>
                  )
                })}

                {!hasAvailableShift && (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-lg font-medium">Tous les créneaux sont complets.</p>
                    <p className="text-sm mt-1">Merci pour ton intérêt !</p>
                  </div>
                )}

                {/* Mobile: selected shifts summary card */}
                {allSelectedShifts.length > 0 && (
                  <div data-shift-list className="lg:hidden rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
                    {allSelectedShifts.map((s) => <ShiftRow key={s.id} shift={s} registered={myShiftIds.has(s.id)} status={myStatus.get(s.id)} selected={selectedShifts.has(s.id)} onCancel={(trigger) => requestCancel(s, trigger)} onRemove={() => toggleShift(s.id)} />)}
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
                        <span aria-hidden="true">📅 </span>{formatDate(event.startDate)}
                        {event.startDate !== event.endDate && ` – ${formatDate(event.endDate)}`}
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
                        {allSelectedShifts.map((s) => <ShiftRow key={s.id} shift={s} compact registered={myShiftIds.has(s.id)} status={myStatus.get(s.id)} selected={selectedShifts.has(s.id)} onCancel={(trigger) => requestCancel(s, trigger)} onRemove={() => toggleShift(s.id)} />)}
                      </div>
                      {newShiftIds.size > 0 && (
                        <div className="p-3 border-t border-gray-100">
                          <button
                            onClick={() => setStep("form")}
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

            {/* Mobile: fixed bottom CTA */}
            {newShiftIds.size > 0 && (
              <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
                <div className="max-w-2xl mx-auto px-4 pb-5 pt-10 bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent pointer-events-none">
                  <button
                    onClick={() => setStep("form")}
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
                  answeredQuestions={(event.questions ?? []).filter((q) => { const v = answers[q.id]; return Array.isArray(v) ? v.length > 0 : !!v && String(v).trim() !== "" }).map((q) => q.label)}
                  heldShifts={heldShifts}
                  timeZone={event.timeZone}
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
                <button onClick={() => setStep("select")} className="text-blue-600 text-sm"><span aria-hidden="true">← </span>Retour</button>
                <h2 className="text-base font-semibold text-gray-800">Tes informations</h2>
              </div>

              {/* Mobile: the recap inside the form card (#373); the desktop sidebar shows the same. */}
              <div className="lg:hidden bg-gray-50 rounded-xl p-3 mb-5">
                <SignupRecap
                  shifts={event.shifts.filter((s) => selectedShifts.has(s.id))}
                  requirePhone={event.requirePhone}
                  phoneGiven={form.phone.trim().length > 0}
                  commentGiven={form.comment.trim().length > 0}
                  answeredQuestions={(event.questions ?? []).filter((q) => { const v = answers[q.id]; return Array.isArray(v) ? v.length > 0 : !!v && String(v).trim() !== "" }).map((q) => q.label)}
                  heldShifts={heldShifts}
                  timeZone={event.timeZone}
                  variant="card"
                />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-xs text-gray-600">Les champs marqués d&apos;un astérisque (*) sont obligatoires.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-firstname" className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
                    <input
                      id="reg-firstname"
                      type="text"
                      required
                      autoComplete="given-name"
                      value={form.firstName}
                      onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-lastname" className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                    <input
                      id="reg-lastname"
                      type="text"
                      required
                      autoComplete="family-name"
                      value={form.lastName}
                      onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="reg-email" className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="reg-phone" className="block text-sm font-medium text-gray-700 mb-1">
                    {event?.requirePhone
                      ? "Téléphone *"
                      : <>Téléphone <span className="text-gray-500 font-normal">(facultatif, mais super utile)</span></>}
                  </label>
                  <input
                    id="reg-phone"
                    type="tel"
                    required={event?.requirePhone ?? false}
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {ageGatedSelectedShifts.length > 0 && (
                  <div>
                    <label htmlFor="reg-birthdate" className="block text-sm font-medium text-gray-700 mb-1">Date de naissance *</label>
                    <input
                      id="reg-birthdate"
                      type="date"
                      required
                      autoComplete="bday"
                      aria-describedby="reg-birthdate-hint"
                      value={form.birthDate}
                      onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                    <p id="reg-birthdate-hint" className="text-xs text-gray-500 mt-1">
                      Requis : {ageGatedSelectedShifts.map((s) => `${s.label} (${s.minAge} ans min.)`).join(", ")}
                    </p>
                  </div>
                )}
                <SignupQuestions
                  questions={event.questions ?? []}
                  answers={answers}
                  onChange={(qid, value) => {
                    setAnswers((a) => ({ ...a, [qid]: value }))
                    // A corrected field no longer says it is invalid.
                    setQuestionErrors((m) => { if (!m.has(qid)) return m; const n = new Map(m); n.delete(qid); return n })
                  }}
                  errors={questionErrors}
                />
                <div>
                  <label htmlFor="reg-comment" className="block text-sm font-medium text-gray-700 mb-1">Commentaire <span className="text-gray-500 font-normal">(facultatif)</span></label>
                  <textarea
                    id="reg-comment"
                    rows={2}
                    value={form.comment}
                    onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={charterAccepted}
                    onChange={(e) => setCharterAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-600">
                    J&apos;ai lu et j&apos;accepte la{" "}
                    <button
                      ref={charterTriggerRef}
                      type="button"
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
                    type="checkbox"
                    checked={form.consent}
                    onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-600">
                    J&apos;accepte que mes données soient utilisées pour la gestion des bénévoles de cet événement.
                  </span>
                </label>

                {error && (
                  <div id="signup-error" role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
                {failure && (
                  // Focused when it appears: the submit button lost the focus while the request ran.
                  <div ref={failureRef} tabIndex={-1} role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800 space-y-1 focus:outline-none">
                    <p className="font-semibold">{failure.title}</p>
                    <p>{failure.message}</p>
                    <p className="text-red-700">{failure.hint}</p>
                    {failure.kind === "conflict" && (
                      <button type="button" onClick={() => { setFailure(null); setStep("select") }} className="mt-1 text-sm font-medium text-red-800 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
                        Revenir au planning
                      </button>
                    )}
                  </div>
                )}

                <button
                  ref={submitButtonRef}
                  type="submit"
                  aria-disabled={submitting || undefined}
                  className={`w-full bg-blue-600 text-white rounded-2xl py-4 text-base font-semibold hover:bg-blue-700 motion-safe:active:scale-[0.98] transition-all ${submitting ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {submitting ? "Envoi en cours…" : preview ? "Voir la confirmation (aperçu)" : "Confirmer mon inscription"}
                </button>
              </form>
            </div>

          </div>
        )}
      </div>

      {showCharter && (
        <ModalShell
          title="Convention des Bénévoles"
          onClose={closeCharter}
          closeOnBackdrop={false}
          panelClassName="max-w-lg"
        >
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {event.volunteerCharter ?? DEFAULT_VOLUNTEER_CHARTER}
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
          onConfirm={withdraw}
          onKeep={keepRegistration}
          confirmRef={withdrawConfirmRef}
        />
      )}

      {/* Always mounted, outside the steps: the result of a withdrawal. The role limit has its own. */}
      <p id="action-notice" role="status" className="sr-only">{actionNotice}</p>

      <PublicFooter />
    </Root>
  )
}
