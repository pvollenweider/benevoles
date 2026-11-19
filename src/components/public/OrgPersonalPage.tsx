"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { Fragment, useLayoutEffect, useState } from "react"
import Link from "next/link"
import PublicFooter from "@/components/PublicFooter"
import CalendarSubscribeCard from "@/components/public/CalendarSubscribeCard"
import { calendarCard, ORG_CALENDAR_CARD_DESCRIPTION, ORG_CALENDAR_RENEWED_NOTICE } from "@/lib/calendar-card-copy"
import { orgPageFooterSite } from "@/lib/urls"
import { fmtRange } from "@/lib/gantt-utils"
import { dayLabelWithYear, spokenTimeRange } from "@/lib/spoken-time"
import { withdrawCopy, withdrawDoneMessage, withdrawFailureMessage } from "@/lib/volunteer-withdraw"
import { CANCEL_CONTACTS_INTRO, cancelClosedText, cancelUntilText, type SelfCancelReason } from "@/lib/cancel-deadline"
import { offerDeadline } from "@/lib/waitlist-copy"
import { announce } from "@/lib/announce"
import { focusFirstAvailable, type FocusCandidate } from "@/lib/focus-return"
import type { OrgPageData, OrgPageRegistration } from "@/lib/org-personal-page"
import { orgPersonalEventPath } from "@/lib/org-link-paths"

type Props = { token: string; data: OrgPageData }

const cardId = (registrationId: string) => `org-registration-${registrationId}`
const triggerId = (registrationId: string) => `org-cancel-${registrationId}`
const closedId = (registrationId: string) => `org-cancel-closed-${registrationId}`
const deadlineId = (registrationId: string) => `org-cancel-until-${registrationId}`
const viewId = (registrationId: string) => `org-view-${registrationId}`
const byId = (id: string) => () => document.getElementById(id)

const lowerFirst = (s: string) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`

/** The visible role and the one the accessible names use: never two different fields (#1429). */
function roleOf(reg: OrgPageRegistration): string {
  return reg.shift.roleName || reg.shift.label
}

/** The date as a screen reader reads it, from the calendar day stored at midnight UTC. */
function dateLabel(date: string): string {
  return dayLabelWithYear(date.slice(0, 10))
}

/** The date in a sentence: « du vendredi 2 mai », with the year when it is not the current one. */
function datePhrase(date: string): string {
  return `du ${lowerFirst(dateLabel(date))}`
}

function timeLabel(reg: OrgPageRegistration): string {
  return fmtRange(reg.shift.startTime, reg.shift.endTime)
}

function spokenTime(reg: OrgPageRegistration): string {
  return spokenTimeRange(reg.shift.startTime, reg.shift.endTime)
}

/**
 * Organisation-wide personal page (#1429, lot A): the next confirmed shift first, then every
 * upcoming registration of this volunteer in this organisation, in date order. Each shift can be
 * withdrawn through the same rules as its event page; the organisation token never exposes
 * another token to the browser.
 *
 * Accessible names use the spoken time (« de 10h à 12h »), never the en dash of `fmtRange`; the
 * confirmation says the shift, its date, its time and the event in one sentence; and the page's
 * status region is screen-reader-only while a short visible answer takes the removed card's place.
 */
export default function OrgPersonalPage({ token, data }: Props) {
  const [registrations, setRegistrations] = useState(data.registrations)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [refusals, setRefusals] = useState<Record<string, { text: string; reason: SelfCancelReason }>>({})
  const [statusText, setStatusText] = useState("")
  /** The short visible answer, at the index the removed card occupied. */
  const [removedNotice, setRemovedNotice] = useState<{ text: string; index: number } | null>(null)
  const [renewing, setRenewing] = useState(false)
  const [renewed, setRenewed] = useState(false)
  /** Whether the calendar card was displayed when the link was renewed: its feed is now revoked. */
  const [renewedWithCalendar, setRenewedWithCalendar] = useState(false)
  const [renewMessage, setRenewMessage] = useState<string | null>(null)
  const [renewFailed, setRenewFailed] = useState(false)
  const [focusRequest, setFocusRequest] = useState<{ candidates: FocusCandidate[]; regionId: string } | null>(null)

  useLayoutEffect(() => {
    if (!focusRequest) return
    const active = document.activeElement
    const inRegion = !active || active === document.body || active.matches("main, [role=main]") || !!document.getElementById(focusRequest.regionId)?.contains(active)
    if (inRegion) focusFirstAvailable(focusRequest.candidates)
  }, [focusRequest])

  // Recomputed from the remaining rows: cancelling the highlighted shift moves the card to the
  // next confirmed one, never back to an empty highlight while confirmed shifts remain.
  const next = registrations.find((r) => r.status === "active") ?? null
  const all = registrations
  const empty = all.length === 0
  // « Mon calendrier » (#1429, lot C): one subscription for every confirmed shift of the
  // organisation, shown only while the link's feed is still the current one.
  const calendar = !renewed && data.calendarFeed
    ? calendarCard(registrations, data.calendarFeed, data.calendarFeed.download, { alwaysDownload: true })
    : null

  function openConfirm(reg: OrgPageRegistration) {
    if (cancellingId || renewed) return
    setPendingId(reg.id)
    setFocusRequest({ candidates: [byId(`org-keep-${reg.id}`), byId(triggerId(reg.id))], regionId: cardId(reg.id) })
  }

  function keep(reg: OrgPageRegistration) {
    if (cancellingId) return
    setPendingId(null)
    setFocusRequest({ candidates: [byId(triggerId(reg.id)), byId(viewId(reg.id)), byId("org-list-title"), byId("org-empty-title")], regionId: cardId(reg.id) })
  }

  async function withdraw(reg: OrgPageRegistration) {
    if (cancellingId || renewed) return
    const index = all.findIndex((r) => r.id === reg.id)
    const after = all[index + 1]?.id
    const before = all[index - 1]?.id
    setCancellingId(reg.id)
    let failure: { status?: number; network?: boolean; error?: string; reason?: SelfCancelReason } | null = null
    try {
      const res = await fetch(`/api/public/mes-inscriptions/${encodeURIComponent(token)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: reg.id }),
      })
      if (!res.ok) {
        const body = res.status === 409 ? await res.json().catch(() => null) : null
        failure = { status: res.status, error: typeof body?.error === "string" ? body.error : undefined, reason: body?.reason }
      }
    } catch {
      failure = { network: true }
    }
    setCancellingId(null)
    setPendingId(null)

    if (failure?.status === 409) {
      const reason: SelfCancelReason = failure.reason ?? "deadline"
      const text = withdrawFailureMessage(failure)
      setRefusals((prev) => ({ ...prev, [reg.id]: { text, reason } }))
      setFocusRequest({ candidates: [byId(closedId(reg.id)), byId("org-list-title"), byId("org-empty-title")], regionId: cardId(reg.id) })
      return
    }
    if (failure) {
      announce(setStatusText, withdrawFailureMessage(failure))
      setFocusRequest({ candidates: [byId(triggerId(reg.id)), byId(viewId(reg.id)), byId("org-list-title"), byId("org-empty-title")], regionId: cardId(reg.id) })
      return
    }

    const text = withdrawDoneMessage(reg.status, { ...reg.shift, label: roleOf(reg) }, reg.event.title)
    setRemovedNotice({ text, index })
    setRegistrations((rows) => rows.filter((r) => r.id !== reg.id))
    // The neighbours first (their cancel button, then their event link), recorded before the list
    // changes; the headings are the last resort.
    setFocusRequest({
      candidates: [
        after ? byId(triggerId(after)) : null,
        after ? byId(viewId(after)) : null,
        before ? byId(triggerId(before)) : null,
        before ? byId(viewId(before)) : null,
        byId("org-list-title"),
        byId("org-empty-title"),
      ].filter((c): c is () => HTMLElement | null => !!c),
      regionId: cardId(reg.id),
    })
    announce(setStatusText, text)
  }

  async function renew() {
    if (renewing || renewed) return
    // Read before the state update: the card and its feed disappear once the link is renewed.
    const hadCalendar = calendar !== null
    setRenewing(true)
    setRenewMessage(null)
    setRenewFailed(false)
    try {
      const res = await fetch(`/api/public/mes-inscriptions/${encodeURIComponent(token)}/renouveler`, { method: "POST" })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setRenewed(true)
        setRenewedWithCalendar(hadCalendar)
        setPendingId(null)
        const message = typeof body.message === "string" ? body.message : "Ton lien a été renouvelé. Un email avec le nouveau lien vient de partir."
        setRenewMessage(hadCalendar ? `${message} ${ORG_CALENDAR_RENEWED_NOTICE}` : message)
      } else {
        setRenewFailed(true)
        setRenewMessage(typeof body.error === "string" ? body.error : "Le renouvellement n'a pas abouti. Réessaie plus tard.")
      }
    } catch {
      setRenewFailed(true)
      setRenewMessage("Connexion impossible. Vérifie ton réseau et réessaie.")
    } finally {
      setRenewing(false)
    }
  }

  const removedNoticeView = removedNotice && (
    <li className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
      {removedNotice.text}
    </li>
  )

  return (
    <>
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="max-w-xl mx-auto space-y-5">
          <header>
            <p className="text-sm text-gray-600">{data.organization.name}</p>
            <h1 id="org-page-title" tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">Toutes mes inscriptions</h1>
            <p className="text-sm text-gray-700 mt-1">{data.volunteer.firstName} {data.volunteer.lastName}</p>
          </header>

          {/* The result is voiced once; the visible answer sits where the removed card was. */}
          <p id="org-status" role="status" className="sr-only">{statusText}</p>

          {renewed && (
            <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              L&apos;ancien lien ne fonctionne plus. Cette page reste affichée, mais les actions sont désactivées : ouvre l&apos;email qui vient de partir pour retrouver tes inscriptions.
              {renewedWithCalendar && <>{" "}{ORG_CALENDAR_RENEWED_NOTICE}</>}
            </p>
          )}

          <section aria-labelledby="org-next-title" className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 id="org-next-title" className="text-sm font-semibold text-gray-900">Ton prochain créneau</h2>
            {next ? (
              <ShiftSummary
                reg={next}
                token={token}
                renewed={renewed}
                timeZone={data.timeZone}
                contactEmail={data.contactEmail}
                next
                idSuffix="-next"
                showClosed={false}
              />
            ) : (
              <p className="text-sm text-gray-700 mt-2">Aucun créneau confirmé à venir pour le moment.</p>
            )}
          </section>

          {calendar && (
            <CalendarSubscribeCard {...calendar} description={ORG_CALENDAR_CARD_DESCRIPTION(data.organization.name)} />
          )}

          {empty ? (
            <section aria-labelledby="org-empty-title" className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 id="org-empty-title" tabIndex={-1} className="text-lg font-bold text-gray-900 focus:outline-none">Aucun créneau à venir</h2>
              {removedNotice && <p className="mt-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">{removedNotice.text}</p>}
              <p className="text-sm text-gray-700 mt-2">
                Tu n&apos;as pas d&apos;inscription à venir auprès de {data.organization.name}. Ce lien reste valable pour tes prochaines inscriptions : garde-le.
              </p>
              <Link href={data.orgHomeUrl} className="mt-3 inline-flex items-center min-h-11 text-sm font-medium text-blue-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                Voir les événements de l&apos;organisation
              </Link>
            </section>
          ) : (
            <section aria-labelledby="org-list-title" className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 id="org-list-title" tabIndex={-1} className="text-lg font-bold text-gray-900 focus:outline-none">Tous tes créneaux à venir</h2>
              <ul role="list" className="mt-3 space-y-3">
                {all.map((reg, index) => (
                  <Fragment key={reg.id}>
                    {removedNotice?.index === index && removedNoticeView}
                    <li id={cardId(reg.id)} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <ShiftSummary
                        reg={reg}
                        token={token}
                        renewed={renewed}
                        timeZone={data.timeZone}
                        contactEmail={data.contactEmail}
                        pending={pendingId === reg.id}
                        cancelling={cancellingId === reg.id}
                        refusal={refusals[reg.id]}
                        onAsk={() => openConfirm(reg)}
                        onKeep={() => keep(reg)}
                        onWithdraw={() => withdraw(reg)}
                      />
                    </li>
                  </Fragment>
                ))}
                {removedNotice && removedNotice.index >= all.length && removedNoticeView}
              </ul>
            </section>
          )}

          <section aria-labelledby="org-renew-title" className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <h2 id="org-renew-title" className="text-sm font-semibold text-gray-900">Ton lien personnel</h2>
            <p className="text-sm text-gray-700">{data.scopeSentence}</p>
            <button
              type="button"
              onClick={renew}
              aria-disabled={renewing || renewed || undefined}
              aria-busy={renewing || undefined}
              className="inline-flex items-center min-h-11 text-sm font-medium text-blue-700 border border-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-50 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {renewing ? "Renouvellement…" : "Renouveler mon lien"}
            </button>
            <p role="status" aria-live="polite" className={`text-sm ${renewFailed ? "text-red-800" : "text-gray-700"}`}>{renewMessage}</p>
          </section>

          <p className="text-sm">
            <Link href={data.orgHomeUrl} className="inline-flex items-center min-h-11 text-blue-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              Retour à l&apos;accueil de {data.organization.name}
            </Link>
          </p>
        </div>
      </main>
      <div className="px-4"><PublicFooter site={orgPageFooterSite()} /></div>
    </>
  )
}

function ShiftSummary({
  reg,
  token,
  renewed,
  timeZone,
  contactEmail,
  next = false,
  idSuffix = "",
  showClosed = true,
  pending = false,
  cancelling = false,
  refusal,
  onAsk,
  onKeep,
  onWithdraw,
}: {
  reg: OrgPageRegistration
  token: string
  renewed: boolean
  timeZone: string
  contactEmail?: string | null
  next?: boolean
  /** « -next » for the highlighted card, so its ids never collide with the list's copy. */
  idSuffix?: string
  /** Whether this card shows the refusal/closed group. The next-shift preview leaves it to the list. */
  showClosed?: boolean
  pending?: boolean
  cancelling?: boolean
  refusal?: { text: string; reason: SelfCancelReason }
  onAsk?: () => void
  onKeep?: () => void
  onWithdraw?: () => void
}) {
  const role = roleOf(reg)
  const copy = withdrawCopy(reg.status, role)
  const date = dateLabel(reg.shift.date)
  const spokenDate = lowerFirst(date)
  const time = spokenTime(reg)
  const timeVisible = timeLabel(reg)
  const accessible = `${copy.ariaLabel}, ${spokenDate}, ${time}, pour ${reg.event.title}`
  const closed = reg.selfCancel.allowed === false || !!refusal
  const closedReason: SelfCancelReason | null = refusal?.reason ?? (reg.selfCancel.allowed === false ? reg.selfCancel.reason : null)
  const deadline = !closed && reg.selfCancel.allowed && reg.selfCancel.deadline ? cancelUntilText(new Date(reg.selfCancel.deadline), timeZone) : null
  const offer = reg.status === "offered" ? offerDeadline(reg.waitingExpiresAt, timeZone) : null

  const triggerElementId = `${triggerId(reg.id)}${idSuffix}`
  const closedElementId = `${closedId(reg.id)}${idSuffix}`
  const deadlineElementId = `${deadlineId(reg.id)}${idSuffix}`
  const viewElementId = `${viewId(reg.id)}${idSuffix}`
  const keepElementId = `org-keep-${reg.id}${idSuffix}`
  const confirmElementId = `org-confirm-${reg.id}${idSuffix}`
  const untilElementId = `${deadlineElementId}-until`

  return (
    <>
      {next ? (
        <p className="text-lg font-semibold text-gray-900 mt-1">{date}</p>
      ) : (
        <h3 className="text-base font-semibold text-gray-900 mt-1">{date}</h3>
      )}
      <p className="text-sm font-medium text-gray-900">{timeVisible}</p>
      <p className="text-sm text-gray-900 mt-1 break-words">{reg.event.title}</p>
      <p className="text-sm text-gray-600 break-words">{role}</p>
      <p className="mt-1">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${reg.statusClass}`}>{reg.statusLabel}</span>
      </p>
      {offer && <p className="text-xs text-amber-900 mt-1">{offer}</p>}
      {deadline && <p id={untilElementId} className="text-xs text-gray-700 mt-1">{deadline}</p>}

      {!renewed && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {!closed && onAsk && (
            <button
              id={triggerElementId}
              type="button"
              onClick={onAsk}
              aria-label={accessible}
              aria-describedby={deadline ? untilElementId : undefined}
              aria-expanded={pending}
              aria-controls={pending ? confirmElementId : undefined}
              aria-disabled={cancelling || undefined}
              className="inline-flex items-center min-h-11 text-xs text-left text-red-700 border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-50 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            >
              {copy.button}
            </button>
          )}
          <a
            id={viewElementId}
            href={orgPersonalEventPath(token, reg.event.id)}
            className="inline-flex items-center min-h-11 text-sm font-medium text-blue-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Voir l&apos;événement<span className="sr-only"> : {reg.event.title}, {spokenDate}, {time}</span>
          </a>
        </div>
      )}

      {closed && showClosed && (
        <div id={closedElementId} role="group" aria-labelledby={`${closedElementId}-title`} tabIndex={-1} className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 focus:outline-none">
          <p id={`${closedElementId}-title`} className="font-medium">{refusal?.text ?? cancelClosedText(reg.selfCancel.allowed === false ? reg.selfCancel.reason : "deadline")}</p>
          {contactEmail && closedReason && closedReason !== "ended" && (
            <>
              <p className="mt-1">{CANCEL_CONTACTS_INTRO}</p>
              <p className="mt-0.5">
                Email :{" "}
                <a href={`mailto:${contactEmail}`} className="font-medium text-blue-700 underline underline-offset-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{contactEmail}</a>
              </p>
            </>
          )}
        </div>
      )}

      {pending && (
        <div
          id={confirmElementId}
          role="alertdialog"
          aria-labelledby={`org-confirm-title-${reg.id}${idSuffix}`}
          aria-describedby={`org-confirm-desc-${reg.id}${idSuffix}`}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onKeep?.() } }}
          className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 space-y-2"
        >
          <p id={`org-confirm-title-${reg.id}${idSuffix}`} className="text-sm font-medium text-red-800">{copy.confirmTitle}</p>
          <p id={`org-confirm-desc-${reg.id}${idSuffix}`} className="text-xs text-red-800">
            {copy.confirmBefore}<strong>{role}</strong> {datePhrase(reg.shift.date)}, {time}, pour {reg.event.title}{copy.confirmAfter}
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onWithdraw}
              aria-disabled={cancelling || undefined}
              aria-busy={cancelling || undefined}
              className="flex-1 inline-flex items-center justify-center min-h-11 bg-red-700 text-white rounded-lg py-1.5 text-xs font-medium hover:bg-red-800 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            >
              {copy.confirmButton}
            </button>
            <button
              id={keepElementId}
              type="button"
              onClick={onKeep}
              aria-disabled={cancelling || undefined}
              className="flex-1 inline-flex items-center justify-center min-h-11 border border-gray-300 text-gray-700 rounded-lg py-1.5 text-xs font-medium hover:bg-gray-50 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Non, garder
            </button>
          </div>
          {cancelling && <p className="text-xs text-red-800">Envoi en cours…</p>}
        </div>
      )}
    </>
  )
}
