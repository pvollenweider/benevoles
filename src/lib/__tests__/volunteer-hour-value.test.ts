import { describe, it, expect } from "vitest"
import {
  formatMoney,
  hourRateFieldValue,
  hourRateLabel,
  hourRateOf,
  hoursValuation,
  parseHourRateInput,
  valueCents,
  type VolunteerHourRate,
} from "../volunteer-hour-value"
import { splitMinutes, volunteerHourEntries, type HourRegistration } from "../volunteer-hours"

// Intl writes a narrow no-break space as the thousands separator and before the currency.
const plain = (s: string) => s.replace(/[  ]/g, " ")

const rate = (cents: number, currency: "CHF" | "EUR" = "CHF"): VolunteerHourRate => ({ cents, currency, setAt: null })

describe("hourRateOf (#867)", () => {
  it("no rate: null, whatever is missing", () => {
    expect(hourRateOf(null)).toBeNull()
    expect(hourRateOf({})).toBeNull()
    expect(hourRateOf({ volunteerHourRateCents: null, volunteerHourRateCurrency: null })).toBeNull()
    expect(hourRateOf({ volunteerHourRateCents: 2500, volunteerHourRateCurrency: null })).toBeNull()
    expect(hourRateOf({ volunteerHourRateCents: null, volunteerHourRateCurrency: "CHF" })).toBeNull()
  })

  it("an invalid stored pair is no rate either", () => {
    expect(hourRateOf({ volunteerHourRateCents: 0, volunteerHourRateCurrency: "CHF" })).toBeNull()
    expect(hourRateOf({ volunteerHourRateCents: 2500, volunteerHourRateCurrency: "USD" })).toBeNull()
    expect(hourRateOf({ volunteerHourRateCents: 25.5, volunteerHourRateCurrency: "EUR" })).toBeNull()
  })

  it("a rate with its currency and date", () => {
    const setAt = new Date("2026-10-20T08:00:00Z")
    expect(hourRateOf({ volunteerHourRateCents: 2550, volunteerHourRateCurrency: "EUR", volunteerHourRateSetAt: setAt })).toEqual({ cents: 2550, currency: "EUR", setAt })
  })
})

describe("parseHourRateInput (#867)", () => {
  it("empty clears the valuation, with or without a currency", () => {
    expect(parseHourRateInput("", "CHF")).toEqual({ kind: "clear" })
    expect(parseHourRateInput("   ", undefined)).toEqual({ kind: "clear" })
    expect(parseHourRateInput(null, null)).toEqual({ kind: "clear" })
  })

  it("accepts units, a comma or a dot, and spaces as thousands separators", () => {
    expect(parseHourRateInput("25", "CHF")).toEqual({ kind: "set", cents: 2500, currency: "CHF" })
    expect(parseHourRateInput("25,5", "EUR")).toEqual({ kind: "set", cents: 2550, currency: "EUR" })
    expect(parseHourRateInput("25.05", "EUR")).toEqual({ kind: "set", cents: 2505, currency: "EUR" })
    expect(parseHourRateInput(" 1 000 ", "CHF")).toEqual({ kind: "set", cents: 100000, currency: "CHF" })
    expect(parseHourRateInput(30, "CHF")).toEqual({ kind: "set", cents: 3000, currency: "CHF" })
  })

  it("refuses zero, a negative amount, more than two decimals, letters and too large an amount", () => {
    for (const v of ["0", "0,00", "-5", "25,555", "25 CHF", "abc", "1e3", "25.", "1000,01"]) {
      expect(parseHourRateInput(v, "CHF").kind, v).toBe("error")
    }
    expect(parseHourRateInput({}, "CHF").kind).toBe("error")
  })

  it("a rate needs a currency from the list", () => {
    expect(parseHourRateInput("25", "")).toEqual({ kind: "error", error: "Choisissez la devise du taux horaire.", field: "currency" })
    expect(parseHourRateInput("abc", "CHF")).toMatchObject({ kind: "error", field: "rate" })
    expect(parseHourRateInput("25", "USD").kind).toBe("error")
  })
})

describe("valuation (#867)", () => {
  it("minutes × hourly rate, rounded to the cent", () => {
    expect(valueCents(0, 2500)).toBe(0)
    expect(valueCents(60, 2500)).toBe(2500)
    expect(valueCents(90, 2500)).toBe(3750)
    // 20 min at 25.55 = 8.5166… → 8.52; 10 min at 0.03 = 0.005 → 0.01 (half up)
    expect(valueCents(20, 2555)).toBe(852)
    expect(valueCents(10, 3)).toBe(1)
  })

  it("planned and attested hours keep their own amounts: attested is part of planned, never added", () => {
    expect(hoursValuation({ plannedMinutes: 600, attestedMinutes: 450 }, rate(2800))).toEqual({ plannedCents: 28000, attestedCents: 21000 })
    expect(hoursValuation({ plannedMinutes: 240, attestedMinutes: 0 }, rate(2800))).toEqual({ plannedCents: 11200, attestedCents: 0 })
  })

  it("from real shifts: a 4 h shift with a presence and a 2 h 30 shift without one", () => {
    const reg = (id: string, start: string, end: string, checkedInAt: Date | null): HourRegistration => ({
      id, volunteerId: id, status: "active", checkedInAt,
      shift: { id, roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: start, endTime: end, status: "open" },
      event: { id: "e1", title: "Fête" },
    })
    const entries = volunteerHourEntries([reg("a", "10:00", "14:00", new Date()), reg("b", "18:00", "20:30", null)], "Europe/Zurich")
    expect(hoursValuation(splitMinutes(entries), rate(2000, "EUR"))).toEqual({ plannedCents: 13000, attestedCents: 8000 })
  })
})

describe("formatting (#867)", () => {
  it("French number format with the currency", () => {
    expect(plain(formatMoney(123450, "CHF"))).toBe("1 234,50 CHF")
    expect(plain(formatMoney(2500, "EUR"))).toBe("25,00 €")
    expect(plain(hourRateLabel(rate(2550)))).toBe("25,50 CHF de l'heure")
  })

  it("the rate typed back into the settings field", () => {
    expect(hourRateFieldValue(null)).toBe("")
    expect(hourRateFieldValue(2500)).toBe("25")
    expect(hourRateFieldValue(2550)).toBe("25,50")
    expect(hourRateFieldValue(2505)).toBe("25,05")
  })
})
