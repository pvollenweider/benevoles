// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Valuing volunteer work (#867): hours given multiplied by an hourly rate the association chooses
 * in Paramètres, shown next to the hours in the event summary and the « Heures par bénévole »
 * export. An estimate for a grant application or the annual accounts (« contribution volontaire en
 * nature »), never an official valuation, and never a suggested figure: no minimum wage is
 * hard-coded here, the association picks its own rate.
 *
 * The rate and its currency are set or cleared together; without both, there is no valuation at
 * all and every screen and export stays as it was. The amounts follow the hours' own meaning
 * (volunteer-hours.ts): planned = every counted minute, attested = the recorded-presence subset,
 * so the attested amount is part of the planned one, never added to it.
 *
 * Pure: no Prisma import (the settings form, a client component, uses the parsing and formatting).
 */

export const HOUR_RATE_CURRENCIES = ["CHF", "EUR"] as const
export type HourRateCurrency = (typeof HOUR_RATE_CURRENCIES)[number]

export type VolunteerHourRate = {
  /** Rate per hour, in cents (hundredths of the currency). */
  cents: number
  currency: HourRateCurrency
  /** When the rate was last set, shown next to it. */
  setAt: Date | null
}

/** Upper bound of the rate, in currency units: a guard against a typo (3000 for 30.00), not a judgement. */
export const MAX_HOUR_RATE = 1000

export const isHourRateCurrency = (v: unknown): v is HourRateCurrency =>
  typeof v === "string" && (HOUR_RATE_CURRENCIES as readonly string[]).includes(v)

/** The organisation's rate, or null when it has none (or an incomplete or invalid pair). */
export function hourRateOf(org: {
  volunteerHourRateCents?: number | null
  volunteerHourRateCurrency?: string | null
  volunteerHourRateSetAt?: Date | null
} | null | undefined): VolunteerHourRate | null {
  if (!org) return null
  const cents = org.volunteerHourRateCents
  const currency = org.volunteerHourRateCurrency
  if (cents == null || !Number.isInteger(cents) || cents <= 0 || !isHourRateCurrency(currency)) return null
  return { cents, currency, setAt: org.volunteerHourRateSetAt ?? null }
}

export type HourRateInput =
  | { kind: "clear" }
  | { kind: "set"; cents: number; currency: HourRateCurrency }
  /** `field`: the control at fault, so the form marks that one only. */
  | { kind: "error"; error: string; field: "rate" | "currency" }

export const RATE_FORMAT_ERROR = "Indiquez un montant positif, par exemple 28,50."
export const CURRENCY_MISSING_ERROR = "Choisissez la devise du taux horaire."

/**
 * The rate typed in Paramètres: empty clears the valuation; otherwise a positive amount with at
 * most two decimals (« 25 », « 25.50 », « 25,50 », spaces allowed as thousands separators) and a
 * currency picked from the list.
 */
export function parseHourRateInput(rate: unknown, currency: unknown): HourRateInput {
  const raw = typeof rate === "number" ? String(rate) : typeof rate === "string" ? rate : rate == null ? "" : null
  if (raw === null) return { kind: "error", error: RATE_FORMAT_ERROR, field: "rate" }
  const text = raw.replace(/[\s  ']/g, "").replace(",", ".")
  if (text === "") return { kind: "clear" }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return { kind: "error", error: RATE_FORMAT_ERROR, field: "rate" }
  }
  const [units, decimals = ""] = text.split(".")
  const cents = Number(units) * 100 + Number(decimals.padEnd(2, "0"))
  if (cents <= 0) return { kind: "error", error: "Le taux horaire doit être supérieur à zéro. Laissez le champ vide pour ne pas valoriser les heures.", field: "rate" }
  if (cents > MAX_HOUR_RATE * 100) return { kind: "error", error: `Le taux horaire ne peut pas dépasser ${MAX_HOUR_RATE} par heure.`, field: "rate" }
  if (!isHourRateCurrency(currency)) return { kind: "error", error: CURRENCY_MISSING_ERROR, field: "currency" }
  return { kind: "set", cents, currency }
}

/** Value of `minutes` at `rateCents` per hour, rounded to the cent (half up). */
export function valueCents(minutes: number, rateCents: number): number {
  return Math.round((minutes * rateCents) / 60)
}

/** The planned and attested amounts of the event summary, each from its own minutes (#867). */
export function hoursValuation(
  minutes: { plannedMinutes: number; attestedMinutes: number },
  rate: VolunteerHourRate,
): { plannedCents: number; attestedCents: number } {
  return { plannedCents: valueCents(minutes.plannedMinutes, rate.cents), attestedCents: valueCents(minutes.attestedMinutes, rate.cents) }
}

/** « 1 234,50 CHF », « 1 234,50 € »: the app's French number format, with the currency. */
export function formatMoney(cents: number, currency: HourRateCurrency): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)
}

/** The rate as typed back into the settings field: « 25 » or « 25,50 ». */
export function hourRateFieldValue(cents: number | null | undefined): string {
  if (cents == null) return ""
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", ",")
}

/** « 25,00 CHF de l'heure ». */
export const hourRateLabel = (rate: Pick<VolunteerHourRate, "cents" | "currency">): string => `${formatMoney(rate.cents, rate.currency)} de l'heure`

/** Amount in currency units for a CSV cell (a number, like the hours columns). */
export const csvAmount = (cents: number): number => cents / 100
