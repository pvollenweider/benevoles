"use client"

import { useEffect, useLayoutEffect, useState } from "react"
import PersonalLinkPanel from "@/components/PersonalLinkPanel"
import LinkRequestForm from "@/components/LinkRequestForm"
import { offerDeadline, WAITLIST_STEPS, waitlistLabel } from "@/lib/waitlist-copy"
import { fmtRange } from "@/lib/gantt-utils"
import { useParams } from "next/navigation"
import Link from "next/link"
import PublicFooter from "@/components/PublicFooter"
import { renderMarkdown, interpolate } from "@/lib/markdown"
import PushSubscribeButton from "@/components/PushSubscribeButton"
import ShiftInfoList from "@/components/ShiftInfoList"
import AvailabilityForm from "@/components/AvailabilityForm"
import { withdrawCopy, withdrawDoneMessage, withdrawFailureMessage } from "@/lib/volunteer-withdraw"
import { announce } from "@/lib/announce"
import { focusFirstAvailable, type FocusCandidate } from "@/lib/focus-return"

type ShiftRef = {
  label: string
  date: string
  startTime: string
  endTime: string
  locationDetails?: string | null
  contactName?: string | null
  contactPhone?: string | null
  instructions?: string | null
  latitude?: number | null
  longitude?: number | null
}

type RegistrationItem = {
  id: string
  editToken: string
  status: string
  waitingPosition?: number | null
  waitingExpiresAt?: string | null
  shift: ShiftRef
}

type PageData = {
  event: { id: string; title: string; slug: string }
  volunteer: { firstName: string; lastName: string; email: string; availabilityPeriods?: string[]; availabilityNote?: string | null }
  registrations: RegistrationItem[]
  orgHomeUrl: string
  eventUrl: string
  timeZone?: string
  linkEmailedAt?: string | null
  contactEmail?: string | null
  confirmationMessage: string | null
}

const LIST_TITLE_ID = "my-registrations-title"
const EMPTY_TITLE_ID = "my-registrations-empty-title"
const byId = (id: string) => () => document.getElementById(id)
const triggerId = (editToken: string) => `withdraw-${editToken}`
const cardId = (regId: string) => `registration-${regId}`

/**
 * Personal page of a volunteer (/my/[token]): their registrations on one event, each withdrawable
 * after an inline confirmation (#534). The confirmation takes focus when it opens and gives it back
 * to its trigger when it closes; a withdrawal keeps the confirmation open until the server answers,
 * then moves focus to a neighbouring card and announces the result once, or keeps the card and says
 * under it that nothing was withdrawn.
 */
export default function MyRegistrationPage() {
  const params = useParams()
  const token = params.token as string

  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [pendingCancel, setPendingCancel] = useState<{ editToken: string } | null>(null)
  // A failed withdrawal's message, per registration id: shown under its card, the page stays.
  const [withdrawErrors, setWithdrawErrors] = useState<Record<string, string>>({})
  // Page status: the result of a withdrawal, voiced once.
  const [statusText, setStatusText] = useState("")

  // Focus to move, applied once React has committed the render it goes with (the confirmation
  // mounted, the card removed). Only while focus is still in the card the action came from, or was
  // dropped to <body> by an unmounted control: an answer that arrives after the user went elsewhere
  // on the page does not pull focus back. `after` runs once focus is settled.
  const [focusRequest, setFocusRequest] = useState<{ candidates: FocusCandidate[]; regionId: string; after?: () => void } | null>(null)
  useLayoutEffect(() => {
    if (!focusRequest) return
    const active = document.activeElement
    const inRegion = active === null || active === document.body || !!document.getElementById(focusRequest.regionId)?.contains(active)
    if (inRegion) focusFirstAvailable(focusRequest.candidates)
    focusRequest.after?.()
  }, [focusRequest])

  useEffect(() => {
    fetch(`/api/public/registrations/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error)
        } else {
          setData(d)
          if (d.event?.slug) {
            localStorage.setItem(`benevoles_token_${d.event.slug}`, token)
          }
        }
        setLoading(false)
      })
      .catch(() => {
        setError("Une erreur est survenue. Réessaie.")
        setLoading(false)
      })
  }, [token])

  function setWithdrawError(regId: string, text: string | null) {
    setWithdrawErrors((prev) => {
      const next = { ...prev }
      if (text) next[regId] = text
      else delete next[regId]
      return next
    })
  }

  /** Opens the card's confirmation (or brings focus back into it) with focus on « Non, garder ». */
  function openConfirm(reg: RegistrationItem) {
    if (cancelling) return
    setWithdrawError(reg.id, null)
    setPendingCancel({ editToken: reg.editToken })
    setFocusRequest({
      candidates: [byId(`cancel-keep-${reg.id}`), byId(triggerId(reg.editToken))],
      regionId: cardId(reg.id),
    })
  }

  /** « Non, garder » or Escape: closes the confirmation, focus back on its trigger. */
  function keep(reg: RegistrationItem) {
    if (cancelling) return
    setPendingCancel(null)
    setFocusRequest({ candidates: [byId(triggerId(reg.editToken)), byId(LIST_TITLE_ID)], regionId: cardId(reg.id) })
  }

  async function withdraw(reg: RegistrationItem) {
    if (cancelling || !data) return
    // The neighbours, recorded before the list changes: focus goes to one of them on success.
    const list = data.registrations
    const i = list.findIndex((r) => r.editToken === reg.editToken)
    const next = list[i + 1]?.editToken
    const prev = list[i - 1]?.editToken
    setCancelling(reg.editToken)

    // The page-level error is for the initial load only: a failed withdrawal keeps the page.
    let failure: { status?: number; network?: boolean } | null = null
    try {
      const res = await fetch(`/api/public/registrations/${reg.editToken}`, { method: "DELETE" })
      if (!res.ok) failure = { status: res.status }
    } catch {
      failure = { network: true }
    }
    setCancelling(null)
    setPendingCancel(null)

    if (failure) {
      const message = withdrawFailureMessage(failure)
      // The alert is filled once focus is back on the trigger, so it is not cut off by the move.
      setFocusRequest({
        candidates: [byId(triggerId(reg.editToken)), byId(LIST_TITLE_ID)],
        regionId: cardId(reg.id),
        after: () => announce((text) => setWithdrawError(reg.id, text), message),
      })
      return
    }

    setData((d) => d ? { ...d, registrations: d.registrations.filter((r) => r.editToken !== reg.editToken) } : d)
    setFocusRequest({
      candidates: [
        next && byId(triggerId(next)),
        prev && byId(triggerId(prev)),
        byId(LIST_TITLE_ID),
        byId(EMPTY_TITLE_ID),
      ].filter((c): c is () => HTMLElement | null => !!c),
      regionId: cardId(reg.id),
    })
    announce(setStatusText, withdrawDoneMessage(reg.status, reg.shift))
  }

  if (loading) return <div role="status" className="flex items-center justify-center min-h-screen text-gray-500">Chargement…</div>

  if (error || !data) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Ce lien ne fonctionne pas</h1>
          <p className="text-sm text-gray-700 mb-4">{error ?? "Ce lien est invalide ou a déjà été annulé."}</p>
          <LinkRequestForm />
          <Link href={data?.eventUrl ?? data?.orgHomeUrl ?? "/"} className="inline-block mt-6 text-blue-700 text-sm underline underline-offset-2">Retour à l&apos;accueil</Link>
        </div>
      </main>
    )
  }

  // The status region is the fragment's first child in both views below, so React keeps the same
  // node when the last withdrawal switches to the empty view, and the result is still voiced.
  const status = <p id="withdraw-status" role="status" className="sr-only">{statusText}</p>

  if (data.registrations.length === 0) {
    return (
      <>
        {status}
        <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <span aria-hidden="true" className="text-4xl block mb-4">✓</span>
            <h1 id={EMPTY_TITLE_ID} tabIndex={-1} className="text-lg font-bold text-gray-900 mb-2 focus:outline-none">Toutes tes inscriptions ont été annulées</h1>
            <Link href={data?.eventUrl ?? data?.orgHomeUrl ?? "/"} className="text-blue-600 text-sm mt-4 block">Retour à l'accueil</Link>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
    {status}
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-md mx-auto space-y-4">
        <div>
          <h1 id={LIST_TITLE_ID} tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">Mes inscriptions</h1>
          <p className="text-sm text-gray-600 mt-1">{data.event.title}</p>
          <p className="text-sm text-gray-500">
            {data.volunteer.firstName} {data.volunteer.lastName} · {data.volunteer.email}
          </p>
        </div>

        {/* Calendar file of the confirmed shifts (#480): a one-off download, not a subscription. */}
        {data.registrations.filter((r) => r.status === "active").length > 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <a
              href={`/api/public/registrations/${token}/calendar`}
              download
              aria-describedby="calendar-hint"
              className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Ajouter tout mon planning à mon calendrier (fichier .ics)
            </a>
            <p id="calendar-hint" className="text-xs text-gray-600 mt-1">
              Le fichier s&apos;ouvre avec l&apos;agenda de ton téléphone ou de ton ordinateur (Google, Apple, Outlook). Seuls les créneaux confirmés sont ajoutés. Le fichier ne se met pas à jour : si un horaire change, tu recevras un email, et il faudra télécharger à nouveau le fichier.
            </p>
          </div>
        )}

        {/* The caveat of the one-shift calendar links (the card above only shows with several shifts). */}
        <p id="calendar-hint-shift" className="sr-only">Fichier pour l&apos;agenda de ton téléphone ou ordinateur. Il ne se met pas à jour : si un horaire change, tu recevras un email.</p>

        <div className="space-y-3">
          {data.registrations.map((reg) => {
            // Shift dates are calendar days at midnight UTC: read them in UTC, whatever the visitor's zone.
            const date = new Date(reg.shift.date).toLocaleDateString("fr-FR", {
              timeZone: "UTC", weekday: "long", day: "numeric", month: "long",
            })
            const isPending = pendingCancel?.editToken === reg.editToken
            const copy = withdrawCopy(reg.status, reg.shift.label)
            const busy = cancelling === reg.editToken
            const withdrawError = withdrawErrors[reg.id]
            return (
              <div key={reg.id} id={cardId(reg.id)} className="bg-white rounded-xl border border-gray-200 p-4">
                {/* Stacked below sm: at 320 px a button beside the text would crush it. */}
                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="sm:flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">
                      {reg.shift.label}
                      {waitlistLabel(reg) && <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{waitlistLabel(reg)}</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{date} · {fmtRange(reg.shift.startTime, reg.shift.endTime)}</p>
                    {reg.status === "offered" && (
                      <p className="text-xs text-amber-900 mt-1">
                        {offerDeadline(reg.waitingExpiresAt, data.timeZone ?? "Europe/Zurich")}{" "}
                        <Link href={`/waitlist/${reg.editToken}/confirm`} aria-label={`Prendre la place : ${reg.shift.label}`} className="font-medium underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900">Prendre la place</Link>
                      </p>
                    )}
                    {reg.status === "requested" && (
                      <p className="text-xs text-amber-900 mt-1">Créneau sur validation : l&apos;organisation va accepter ou refuser ta demande, et te prévient par email. La place t&apos;est réservée d&apos;ici là.</p>
                    )}
                    <ShiftInfoList info={reg.shift} className="mt-2 text-xs text-gray-700" />
                    {reg.status === "active" && (
                      <a
                        href={`/api/public/registrations/${token}/calendar?registration=${reg.id}`}
                        download
                        aria-describedby="calendar-hint-shift"
                        className="mt-1 py-1 inline-block text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      >
                        Ajouter à mon calendrier <span aria-hidden="true">(.ics)</span><span className="sr-only"> : {reg.shift.label}, {date} (fichier .ics)</span>
                      </a>
                    )}
                  </div>
                  {/* Stays mounted while its confirmation is open, and focusable during the request
                      (aria-disabled): focus comes back here when the confirmation closes. */}
                  <button
                    id={triggerId(reg.editToken)}
                    type="button"
                    onClick={() => openConfirm(reg)}
                    aria-label={copy.ariaLabel}
                    aria-expanded={isPending}
                    aria-controls={isPending ? `cancel-${reg.id}` : undefined}
                    aria-disabled={busy || undefined}
                    className="text-xs text-red-700 border border-red-300 rounded-lg px-3 py-1.5 text-left sm:shrink-0 transition-colors hover:text-red-800 hover:bg-red-50 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                  >
                    {copy.button}
                  </button>
                </div>

                {/* Always mounted, so that its text is voiced when it arrives. Not referenced by the
                    trigger's aria-describedby: it would be read a second time with the trigger. */}
                <p id={`withdraw-error-${reg.id}`} role="alert" className={withdrawError ? "mt-2 text-xs text-red-800" : "sr-only"}>
                  {withdrawError ?? ""}
                </p>

                {isPending && (
                  <div
                    id={`cancel-${reg.id}`}
                    role="alertdialog"
                    aria-labelledby={`cancel-title-${reg.id}`}
                    aria-describedby={`cancel-desc-${reg.id}`}
                    onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); keep(reg) } }}
                    className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 space-y-2"
                  >
                    <p id={`cancel-title-${reg.id}`} className="text-sm font-medium text-red-800">{copy.confirmTitle}</p>
                    <p id={`cancel-desc-${reg.id}`} className="text-xs text-red-800">
                      {copy.confirmBefore}<strong>{reg.shift.label}</strong>{copy.confirmAfter}
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => withdraw(reg)}
                        aria-disabled={busy || undefined}
                        aria-busy={busy || undefined}
                        className="flex-1 bg-red-700 text-white rounded-lg py-1.5 text-xs font-medium hover:bg-red-800 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                      >
                        {copy.confirmButton}
                      </button>
                      <button
                        id={`cancel-keep-${reg.id}`}
                        type="button"
                        onClick={() => keep(reg)}
                        aria-disabled={busy || undefined}
                        className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-1.5 text-xs font-medium hover:bg-gray-50 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      >
                        Non, garder
                      </button>
                    </div>
                    {/* Visible only: opacity alone must not carry the busy state (DESIGN.md), and the
                        result is announced once by the page status, so this is not a live region. */}
                    {busy && <p className="text-xs text-red-800">Envoi en cours…</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <PersonalLinkPanel
          token={token}
          linkEmailedAt={data.linkEmailedAt ?? null}
          timeZone={data.timeZone ?? "Europe/Zurich"}
          contactEmail={data.contactEmail ?? null}
          eventTitle={data.event.title}
        />

        {data.registrations.some((r) => r.status !== "active") && (
          <section aria-labelledby="waitlist-how" className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-900">
            <h2 id="waitlist-how" className="font-medium mb-2">Liste d&apos;attente : comment ça marche</h2>
            <ol className="list-decimal pl-5 space-y-1">
              {WAITLIST_STEPS.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </section>
        )}

        {data.confirmationMessage && data.confirmationMessage.trim() && (() => {
          const html = renderMarkdown(interpolate(data.confirmationMessage, { prenom: data.volunteer.firstName, "créneau": data.registrations[0]?.shift.label ?? "", date: "", heure: "" }))
          return (
            <div>
              <h2 className="text-xs font-semibold text-gray-600 mb-2">Informations pratiques</h2>
              <div
                className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-900"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          )
        })()}

        <AvailabilityForm token={token} initialPeriods={data.volunteer.availabilityPeriods ?? []} initialNote={data.volunteer.availabilityNote ?? null} />

        <div className="flex items-center justify-between pt-2">
          <Link href={data?.eventUrl ?? data?.orgHomeUrl ?? "/"} className="text-sm text-gray-500 hover:text-gray-700">
            Retour à l&apos;accueil
          </Link>
          <PushSubscribeButton editToken={token} />
        </div>
      </div>
      <PublicFooter />
    </main>
    </>
  )
}
