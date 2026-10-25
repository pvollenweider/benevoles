"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState } from "react"
import {
  HOUR_RATE_CURRENCIES,
  hourRateFieldValue,
  hourRateLabel,
  isHourRateCurrency,
  parseHourRateInput,
  type HourRateCurrency,
} from "@/lib/volunteer-hour-value"

type Saved = { cents: number | null; currency: HourRateCurrency | ""; setAt: string | null }
type Field = "rate" | "currency"

// In the organisation's time zone, so the server and the browser render the same date.
const setAtLabel = (iso: string, timeZone: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone, day: "numeric", month: "long", year: "numeric" })

/**
 * Valorisation du bénévolat (#867), Paramètres (owners): the hourly rate the association chooses and
 * its currency, saved or cleared together. Empty = no valuation anywhere. An error marks the one
 * field at fault (`field` from the shared parser, here or in the route's answer) and takes the
 * focus there; the result is said by the status line, mounted from the first render.
 */
export default function OrgHourRateForm({ initial, timeZone }: { initial: Saved; timeZone: string }) {
  const [saved, setSaved] = useState<Saved>(initial)
  const [rate, setRate] = useState(hourRateFieldValue(initial.cents))
  const [currency, setCurrency] = useState<HourRateCurrency | "">(initial.currency)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState<{ field: Field; message: string } | null>(null)
  const rateRef = useRef<HTMLInputElement>(null)
  const currencyRef = useRef<HTMLSelectElement>(null)
  const rateId = useId()
  const rateHintId = useId()
  const rateErrorId = useId()
  const currencyId = useId()
  const currencyHintId = useId()
  const currencyErrorId = useId()

  function fail(field: Field, message: string) {
    setError({ field, message })
    ;(field === "rate" ? rateRef : currencyRef).current?.focus()
  }

  function say(text: string) {
    // Cleared first so a second click re-announces the same text.
    setStatus("")
    requestAnimationFrame(() => setStatus(text))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError(null)
    const parsed = parseHourRateInput(rate, currency)
    if (parsed.kind === "error") {
      setStatus("")
      fail(parsed.field, parsed.error)
      return
    }
    const unchanged =
      parsed.kind === "clear" ? saved.cents == null : saved.cents === parsed.cents && saved.currency === parsed.currency
    if (unchanged) {
      say("Aucune modification.")
      return
    }
    setLoading(true)
    setStatus("")
    try {
      const res = await fetch("/api/admin/settings/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volunteerHourRate: parsed.kind === "clear" ? "" : rate, volunteerHourRateCurrency: currency }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = typeof data?.error === "string" ? data.error : "Le taux n'a pas pu être enregistré. Réessayez."
        fail(data?.field === "currency" ? "currency" : "rate", message)
        return
      }
      const cents: number | null = typeof data.volunteerHourRateCents === "number" ? data.volunteerHourRateCents : null
      const storedCurrency: HourRateCurrency | "" = isHourRateCurrency(data.volunteerHourRateCurrency) ? data.volunteerHourRateCurrency : ""
      setSaved({ cents, currency: storedCurrency, setAt: typeof data.volunteerHourRateSetAt === "string" ? data.volunteerHourRateSetAt : null })
      setRate(hourRateFieldValue(cents))
      setCurrency(storedCurrency)
      setStatus(
        cents != null && storedCurrency
          ? `Taux horaire enregistré : ${hourRateLabel({ cents, currency: storedCurrency })}.`
          : "Taux horaire retiré : les heures ne sont plus valorisées.",
      )
    } catch {
      fail("rate", "Impossible d'enregistrer. Vérifiez votre connexion et réessayez.")
    } finally {
      setLoading(false)
    }
  }

  const fieldClass = (invalid: boolean) =>
    `border border-gray-500 rounded-xl px-3 py-2 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500${invalid ? " !border-red-600" : ""}`
  const rateInvalid = error?.field === "rate"
  const currencyInvalid = error?.field === "currency"

  return (
    <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">Valorisation du bénévolat</h2>
      <p className="text-sm text-gray-700 max-w-prose">
        Pour estimer la valeur du travail bénévole (contribution volontaire en nature), par exemple pour un
        dossier de subvention : le résumé d&apos;un événement et l&apos;export des heures par bénévole multiplient
        alors les heures par ce taux. Indiquez le taux retenu par votre association ; ce n&apos;est pas une valeur
        officielle.
      </p>
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <label htmlFor={rateId} className="block text-sm font-medium text-gray-700 mb-1">Taux horaire (facultatif)</label>
          <input
            ref={rateRef}
            id={rateId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={rate}
            onChange={(e) => { setRate(e.target.value); setStatus(""); setError(null) }}
            aria-describedby={rateInvalid ? `${rateHintId} ${rateErrorId}` : rateHintId}
            aria-invalid={rateInvalid || undefined}
            className={`w-32 ${fieldClass(rateInvalid)}`}
          />
          <p id={rateHintId} className="mt-1 text-xs text-gray-600 max-w-48">Par exemple 28,50. Laissez vide pour ne rien valoriser.</p>
        </div>
        <div>
          <label htmlFor={currencyId} className="block text-sm font-medium text-gray-700 mb-1">Devise</label>
          <select
            ref={currencyRef}
            id={currencyId}
            value={currency}
            onChange={(e) => { setCurrency(isHourRateCurrency(e.target.value) ? e.target.value : ""); setStatus(""); setError(null) }}
            aria-describedby={currencyInvalid ? `${currencyHintId} ${currencyErrorId}` : currencyHintId}
            aria-invalid={currencyInvalid || undefined}
            aria-required={rate.trim() !== "" || undefined}
            className={fieldClass(currencyInvalid)}
          >
            <option value="">Choisir</option>
            {HOUR_RATE_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <p id={currencyHintId} className="mt-1 text-xs text-gray-600 max-w-48">Obligatoire si vous indiquez un taux.</p>
        </div>
      </div>
      {rateInvalid && <p id={rateErrorId} role="alert" className="text-sm font-medium text-red-700">{error.message}</p>}
      {currencyInvalid && <p id={currencyErrorId} role="alert" className="text-sm font-medium text-red-700">{error.message}</p>}
      {saved.cents != null && saved.currency && saved.setAt && (
        <p className="text-sm text-gray-800">
          Taux enregistré le {setAtLabel(saved.setAt, timeZone)} : {hourRateLabel({ cents: saved.cents, currency: saved.currency })}.
        </p>
      )}
      <button
        type="submit"
        aria-disabled={loading || undefined}
        className="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        {loading ? "Enregistrement…" : "Enregistrer"}
      </button>
      <p role="status" className="text-sm font-medium text-green-800 min-h-5">{status}</p>
    </form>
  )
}
