"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState } from "react"
import Link from "next/link"
import RequiredMark from "@/components/RequiredMark"
import FormStatus from "@/components/FormStatus"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { announce } from "@/lib/announce"
import { requestJson, useSubmit } from "@/lib/use-submit"
import {
  AUTO_APPROVAL_EXPLANATION,
  AUTO_APPROVAL_INVALID_NOTICE,
  AUTO_APPROVAL_MAX_DAYS,
  AUTO_APPROVAL_REVIEW_HREF,
  autoApprovalCounterSentences,
  autoApprovalDayLabel,
  autoApprovalStateSentence,
  type AutoApprovalView,
} from "@/lib/auto-approval"

const URL = "/api/super-admin/auto-approval"

/**
 * « Validation automatique des nouveaux espaces » (#1371): the temporary option that validates a
 * self-service space on its own while the operator is away. A form and a confirmation dialog turn
 * it on or move its end day; plain buttons turn it off; the cut-off notice is dismissed in place.
 * The section's single status region takes a short outcome after each action.
 */
export default function AutoApprovalSettings({ initial }: { initial: AutoApprovalView }) {
  const id = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const modifyRef = useRef<HTMLButtonElement>(null)
  const { error, fail, isInvalid, quiet, alertShown, reset } = useSubmit()
  const [view, setView] = useState(initial)
  const [date, setDate] = useState(initial.state === "on" ? initial.until ?? "" : "")
  const [showForm, setShowForm] = useState(initial.state !== "on")
  const [confirming, setConfirming] = useState<"activate" | "change" | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState("")

  const stateSentence = autoApprovalStateSentence(view)
  const counters = autoApprovalCounterSentences(view)

  function untilProblem(): string | null {
    if (!date) return "Indiquez une date de fin."
    if (date < view.today || date > view.maxUntil) {
      return `Choisissez une date entre aujourd'hui et le ${view.maxUntilLabel}.`
    }
    return null
  }

  function openConfirmation(e: React.FormEvent) {
    e.preventDefault()
    const problem = untilProblem()
    if (problem) {
      fail(problem, "until", dateRef.current)
      return
    }
    setDialogError(null)
    setOutcome("")
    setConfirming(view.state === "on" ? "change" : "activate")
  }

  async function save(until: string) {
    const activating = view.state !== "on"
    setBusy(true)
    setDialogError(null)
    setOutcome("")
    const result = await requestJson<AutoApprovalView>(() => fetch(URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ until }),
    }), "Le changement n'a pas pu être enregistré.")
    setBusy(false)
    if (!result.ok) {
      if (result.status === 400) {
        setConfirming(null)
        fail(result.error, "until", dateRef.current)
        return
      }
      setDialogError(result.error)
      return
    }
    setConfirming(null)
    setView(result.data)
    setShowForm(false)
    setDate(result.data.until ?? "")
    headingRef.current?.focus()
    const endLabel = result.data.untilLabel ?? autoApprovalDayLabel(until)
    announce(setOutcome, activating
      ? `Validation automatique activée jusqu'au ${endLabel} inclus.`
      : `Date de fin modifiée : jusqu'au ${endLabel} inclus.`)
  }

  async function deactivate() {
    if (busy) return
    setBusy(true)
    reset()
    setOutcome("")
    const result = await requestJson<AutoApprovalView>(() => fetch(URL, { method: "DELETE" }), "La désactivation n'a pas pu être enregistrée.")
    setBusy(false)
    if (!result.ok) {
      fail(result.error)
      return
    }
    setView(result.data)
    setShowForm(false)
    setDate("")
    headingRef.current?.focus()
    announce(setOutcome, "Validation automatique désactivée.")
  }

  async function dismissNotice() {
    if (busy) return
    setBusy(true)
    reset()
    setOutcome("")
    const result = await requestJson<AutoApprovalView>(() => fetch(`${URL}/dismiss`, { method: "POST" }), "L'avis n'a pas pu être masqué.")
    setBusy(false)
    if (!result.ok) {
      fail(result.error)
      return
    }
    setView(result.data)
    headingRef.current?.focus()
    announce(setOutcome, "Avis masqué.")
  }

  const chosenLabel = date ? autoApprovalDayLabel(date) : ""
  const recap = {
    title: confirming === "change"
      ? `Fixer la fin au ${chosenLabel} inclus ?`
      : `Activer la validation automatique jusqu'au ${chosenLabel} inclus ?`,
    lines: [
      "Un espace créé par l'inscription est validé tout seul 5 à 10 minutes après l'activation du compte de son responsable, sans aucune vérification.",
      `Au plus ${view.budgetCeiling} validations par jour : atteint, le plafond coupe l'option et vous alerte.`,
      "Les espaces déjà en attente restent à valider à la main.",
    ],
    warning: "Personne ne regarde les nouveaux espaces pendant ce temps.",
    confirmLabel: confirming === "change" ? "Enregistrer" : "Activer",
    danger: false,
  }

  const inputClass = "w-full rounded-xl border border-gray-500 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
  const primary = "text-sm px-4 py-2 rounded-xl font-medium bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
  const secondary = "text-sm px-4 py-2 rounded-xl font-medium border border-gray-300 text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

  return (
    <section id="validation-automatique" aria-labelledby={`${id}-title`} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
      <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1} className="text-base font-semibold text-gray-900 focus:outline-none">
        Validation automatique des nouveaux espaces
      </h2>
      <p className="text-sm text-gray-800">{stateSentence}</p>
      {counters.length > 0 && (
        <p className="text-sm text-gray-700">
          {counters.map((sentence) => <span key={sentence} className="block">{sentence}</span>)}
        </p>
      )}
      <p className="text-sm text-gray-700">{AUTO_APPROVAL_EXPLANATION}</p>

      {view.invalid && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>{AUTO_APPROVAL_INVALID_NOTICE}</p>
        </div>
      )}

      {view.cutOffNotice && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>{view.cutOffNotice}</p>
          <button
            type="button"
            onClick={() => void dismissNotice()}
            aria-disabled={busy || undefined}
            className="mt-2 inline-flex min-h-6 items-center px-1 text-sm font-medium underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Masquer cet avis
          </button>
        </div>
      )}

      {view.state === "on" && !showForm ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            ref={modifyRef}
            onClick={() => {
              if (busy) return
              reset()
              setOutcome("")
              setDialogError(null)
              setDate(view.until ?? "")
              setShowForm(true)
              // The button unmounts with the form: focus must not fall back to <body>.
              requestAnimationFrame(() => dateRef.current?.focus())
            }}
            aria-disabled={busy || undefined}
            className={secondary}
          >
            Modifier la date de fin
          </button>
          <button
            type="button"
            onClick={() => void deactivate()}
            aria-disabled={busy || undefined}
            className={`text-sm px-4 py-2 rounded-xl font-medium border border-red-300 text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${busy ? "cursor-wait" : ""}`}
          >
            Désactiver maintenant
          </button>
        </div>
      ) : (
        <form noValidate onSubmit={openConfirmation} className="space-y-3">
          <div>
            <label htmlFor={`${id}-until`} className="block text-sm font-medium text-gray-900 mb-1">
              Jusqu&apos;au <RequiredMark />
            </label>
            <p id={`${id}-hint`} className="text-xs text-gray-700 mb-1">
              Dernier jour inclus. Au plus tard le {view.maxUntilLabel} ({AUTO_APPROVAL_MAX_DAYS} jours au plus).
            </p>
            <input
              id={`${id}-until`}
              ref={dateRef}
              type="date"
              lang="fr-FR"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              min={view.today}
              max={view.maxUntil}
              aria-invalid={isInvalid("until")}
              aria-describedby={[`${id}-hint`, isInvalid("until") ? `${id}-error` : null].filter(Boolean).join(" ")}
              className={`${inputClass} max-w-[16rem]`}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="submit" aria-disabled={busy || undefined} className={`${primary} ${busy ? "cursor-wait" : ""}`}>
              {view.state === "on" ? "Enregistrer la date de fin" : "Activer"}
            </button>
            {view.state === "on" && (
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  reset()
                  setOutcome("")
                  setDate(view.until ?? "")
                  requestAnimationFrame(() => modifyRef.current?.focus())
                }}
                className={secondary}
              >
                Annuler
              </button>
            )}
          </div>
        </form>
      )}

      <FormStatus status={outcome} error={error} errorId={`${id}-error`} quiet={quiet} alertShown={alertShown} />

      <p>
        <Link href={AUTO_APPROVAL_REVIEW_HREF} className="inline-flex min-h-6 items-center px-1 text-sm text-blue-700 underline underline-offset-2 hover:text-blue-800 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          Voir les espaces validés automatiquement, à relire
        </Link>
      </p>

      {confirming && (
        <ConfirmActionModal
          recap={recap}
          busy={busy}
          error={dialogError}
          onConfirm={() => void save(date)}
          onCancel={() => setConfirming(null)}
          fallbackFocusOnClose={() => headingRef.current}
        />
      )}
    </section>
  )
}
