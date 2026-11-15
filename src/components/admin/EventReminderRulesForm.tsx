"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import FormStatus from "@/components/FormStatus"
import { useSubmit } from "@/lib/use-submit"
import {
  customReminderPreviewSentence,
  MAX_REMINDER_RULES,
  REMINDER_RULE_BOUNDS,
  validateReminderRules,
  type CustomReminderPreviewView,
  type EventReminderRulesState,
} from "@/lib/reminder-rules"

type DraftRule = {
  /** Stable React key; never sent to the server. */
  key: string
  /** The stored rule id, null for a new one. */
  id: string | null
  unit: "hours" | "days"
  value: string
  enabled: boolean
}

type Saved = {
  mode: "default" | "custom"
  rules: EventReminderRulesState["rules"]
}

type Props = {
  eventId: string
  timeZone: string
  initialState: EventReminderRulesState
}

const newRule = (counter: number): DraftRule => ({
  key: `new-${counter}`,
  id: null,
  unit: "days",
  value: "1",
  enabled: true,
})

const toDrafts = (rules: EventReminderRulesState["rules"]): DraftRule[] =>
  rules.map((rule) => ({ key: rule.id, id: rule.id, unit: rule.unit, value: String(rule.value), enabled: rule.enabled }))

const signature = (rules: readonly DraftRule[]): string =>
  rules.map((rule) => `${rule.id ?? ""}\u0000${rule.unit}\u0000${Number(rule.value)}\u0000${rule.enabled ? "1" : "0"}`).join("|")

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/**
 * « Délais des rappels automatiques » (#1139): the legacy three delays or the event's own rules,
 * then the next send read from the saved state. Client validation happens at submit only, and a
 * server error carrying `rule` is attached to that rule's delay input, exactly like the other
 * admin forms (`useSubmit.fail`, quiet path, `FormStatus`).
 */
export default function EventReminderRulesForm({ eventId, timeZone, initialState }: Props) {
  const id = useId()
  const router = useRouter()
  const { submit, busy, error, status, setStatus, fail, isInvalid, quiet, alertShown } = useSubmit()
  const [mode, setMode] = useState<"default" | "custom">(initialState.mode)
  const [rules, setRules] = useState<DraftRule[]>(() =>
    initialState.rules.length > 0 ? toDrafts(initialState.rules) : [newRule(0)],
  )
  const [saved, setSaved] = useState<Saved>({ mode: initialState.mode, rules: initialState.rules })
  const [savedPreview, setSavedPreview] = useState<CustomReminderPreviewView>(initialState.preview)
  const [removed, setRemoved] = useState("")
  const counter = useRef(initialState.rules.length + 1)
  const inputRefs = useRef(new Map<string, HTMLInputElement | null>())
  const addRef = useRef<HTMLButtonElement>(null)
  const serverRule = useRef<number | null>(null)
  const pendingFocus = useRef<string | null>(null)
  const pendingAddFocus = useRef(false)

  const titleId = `${id}-title`
  const customHintId = `${id}-custom-hint`
  const boundsId = `${id}-bounds`
  const anchorId = `${id}-anchor`
  const errorId = `${id}-error`
  const previewId = `${id}-preview`
  const dirtyId = `${id}-dirty`

  const dirty = mode !== saved.mode
    || (mode === "custom" && signature(rules) !== signature(toDrafts(saved.rules)))
  const showPreview = saved.mode === "custom"
  const atMax = rules.length >= MAX_REMINDER_RULES

  // Focus follows the DOM change: a new delay input after « Ajouter », the add button after a
  // removal. A ref, not state, so the effect only moves focus and never triggers another render.
  useEffect(() => {
    const key = pendingFocus.current
    if (key) {
      pendingFocus.current = null
      inputRefs.current.get(key)?.focus()
      return
    }
    if (pendingAddFocus.current) {
      pendingAddFocus.current = false
      addRef.current?.focus()
    }
  }, [rules])

  function chooseCustom() {
    setMode("custom")
    if (rules.length === 0) setRules([newRule(counter.current++)])
  }

  function addRule() {
    if (atMax) return
    const draft = newRule(counter.current++)
    pendingFocus.current = draft.key
    setRules((current) => [...current, draft])
  }

  function removeRule(index: number) {
    const next = rules.filter((_, i) => i !== index)
    pendingAddFocus.current = true
    setRules(next)
    setRemoved(`Rappel ${index + 1} retiré. Il reste ${plural(next.length, "rappel", "rappels")}.`)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    serverRule.current = null

    let payload: { mode: "default" } | { mode: "custom"; rules: { id?: string; unit: string; value: number; enabled: boolean }[] } = { mode: "default" }
    if (mode === "custom") {
      const inputs: { id?: string; unit: string; value: number; enabled: boolean }[] = []
      for (const [index, rule] of rules.entries()) {
        const raw = rule.value.trim()
        const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
        if (!Number.isInteger(value)) {
          fail(`Rappel ${index + 1} : le délai doit être un nombre entier.`, rule.key, inputRefs.current.get(rule.key) ?? null)
          return
        }
        inputs.push({ ...(rule.id ? { id: rule.id } : {}), unit: rule.unit, value, enabled: rule.enabled })
      }
      const validation = validateReminderRules(inputs.map((rule) => ({
        id: rule.id ?? "",
        unit: rule.unit,
        value: rule.value,
        enabled: rule.enabled,
      })))
      if (!validation.ok) {
        const index = Math.max(0, (validation.rule ?? 1) - 1)
        const rule = rules[index]
        fail(validation.error, rule.key, inputRefs.current.get(rule.key) ?? null)
        return
      }
      payload = { mode: "custom", rules: inputs }
    }

    const outcome = await submit(async () => {
      const res = await fetch(`/api/admin/events/${eventId}/reminder-rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.clone().json().catch(() => ({}))
        serverRule.current = typeof body?.rule === "number" ? body.rule : null
      }
      return res
    }, { silent: true })

    if (!outcome.ok) {
      const index = serverRule.current === null ? -1 : serverRule.current - 1
      const rule = index >= 0 ? rules[index] : undefined
      if (rule) fail(outcome.error, rule.key, inputRefs.current.get(rule.key) ?? null)
      else fail(outcome.error)
      return
    }

    const next = outcome.data as EventReminderRulesState
    setMode(next.mode)
    setRules(next.rules.length > 0 ? toDrafts(next.rules) : [newRule(counter.current++)])
    setSaved({ mode: next.mode, rules: next.rules })
    setSavedPreview(next.preview)
    setRemoved("")
    const nextSend = next.preview.state === "scheduled" || next.preview.state === "queued"
      ? customReminderPreviewSentence(next.preview, timeZone)
      : null
    setStatus(nextSend ? `Rappels enregistrés. ${nextSend}` : "Rappels enregistrés.")
    router.refresh()
  }

  const inputClass = "w-20 border border-gray-500 rounded-xl px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
  const selectClass = "border border-gray-500 rounded-xl px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
  const buttonClass = "text-sm font-medium text-blue-700 border border-blue-600 rounded-xl px-4 py-2 min-h-6 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

  return (
    <section id="event-reminder-rules" className="space-y-4">
      <form onSubmit={save} noValidate aria-labelledby={titleId} className="space-y-4">
        <h3 id={titleId} className="text-sm font-semibold text-gray-900">Délais des rappels automatiques</h3>

        <fieldset className="space-y-2">
          <legend className="text-sm text-gray-800 mb-1">Quand envoyer les rappels de cet événement ?</legend>
          <div className="flex items-start gap-3">
            <input
              id={`${id}-default`}
              type="radio"
              name={`${id}-mode`}
              checked={mode === "default"}
              onChange={() => setMode("default")}
              className="mt-0.5 h-4 w-4 shrink-0 border-gray-500 text-blue-600"
            />
            <label htmlFor={`${id}-default`} className="text-sm text-gray-800">
              Délais habituels : 2 jours avant, la veille et le jour même
            </label>
          </div>
          <div className="flex items-start gap-3">
            <input
              id={`${id}-custom`}
              type="radio"
              name={`${id}-mode`}
              checked={mode === "custom"}
              onChange={chooseCustom}
              aria-describedby={customHintId}
              className="mt-0.5 h-4 w-4 shrink-0 border-gray-500 text-blue-600"
            />
            <label htmlFor={`${id}-custom`} className="text-sm text-gray-800">
              Délais propres à cet événement
            </label>
          </div>
          <p id={customHintId} className="text-xs text-gray-600">
            Ces délais remplacent les trois rappels habituels pour cet événement, y compris les paramètres de l&apos;organisation.
          </p>
        </fieldset>

        {mode === "custom" && (
          <div className="space-y-3">
            {rules.map((rule, index) => {
              const ruleKey = `rule-${rule.key}`
              const invalid = isInvalid(rule.key)
              return (
                <fieldset key={rule.key} className="space-y-2">
                  <legend className="text-sm font-semibold text-gray-900">Rappel {index + 1}</legend>
                  <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                    <div>
                      <label htmlFor={`${id}-${ruleKey}-value`} className="block text-sm text-gray-800 mb-1">Délai</label>
                      <input
                        id={`${id}-${ruleKey}-value`}
                        ref={(el) => {
                          if (el) inputRefs.current.set(rule.key, el)
                          else inputRefs.current.delete(rule.key)
                        }}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={rule.value}
                        onChange={(e) => setRules((current) => current.map((candidate) => candidate.key === rule.key ? { ...candidate, value: e.target.value } : candidate))}
                        aria-invalid={invalid ? true : undefined}
                        aria-describedby={invalid ? `${boundsId} ${anchorId} ${errorId}` : `${boundsId} ${anchorId}`}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor={`${id}-${ruleKey}-unit`} className="block text-sm text-gray-800 mb-1">Unité</label>
                      <select
                        id={`${id}-${ruleKey}-unit`}
                        value={rule.unit}
                        onChange={(e) => setRules((current) => current.map((candidate) => candidate.key === rule.key ? { ...candidate, unit: e.target.value as "hours" | "days" } : candidate))}
                        className={selectClass}
                      >
                        <option value="hours">heures</option>
                        <option value="days">jours</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 pb-2">
                      <input
                        id={`${id}-${ruleKey}-enabled`}
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => setRules((current) => current.map((candidate) => candidate.key === rule.key ? { ...candidate, enabled: e.target.checked } : candidate))}
                        className="h-4 w-4 shrink-0 rounded border-gray-500 text-blue-600"
                      />
                      <label htmlFor={`${id}-${ruleKey}-enabled`} className="text-sm font-medium text-gray-800">Actif</label>
                    </div>
                    {rules.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRule(index)}
                        className="text-sm font-medium text-blue-700 underline underline-offset-2 min-h-6 rounded hover:text-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      >
                        Retirer le rappel {index + 1}
                      </button>
                    )}
                  </div>
                </fieldset>
              )
            })}

            <p id={boundsId} className="text-xs text-gray-600">
              Un jour compte 24 heures. Entre {REMINDER_RULE_BOUNDS.hours.min} et {REMINDER_RULE_BOUNDS.hours.max} heures, ou entre {REMINDER_RULE_BOUNDS.days.min} et {REMINDER_RULE_BOUNDS.days.max} jours.
            </p>
            <p id={anchorId} className="text-xs text-gray-600">Chaque délai est compté avant le premier créneau de la journée.</p>

            <div className="flex flex-wrap items-center gap-3">
              {atMax ? (
                <p className="text-sm text-gray-700">Trois rappels au maximum.</p>
              ) : (
                <button ref={addRef} type="button" onClick={addRule} className={buttonClass}>
                  Ajouter un rappel
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            aria-disabled={busy || undefined}
            aria-describedby={dirty ? dirtyId : undefined}
            className={`bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${busy ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {busy ? "Enregistrement…" : "Enregistrer les rappels"}
          </button>
        </div>

        {/* Always mounted: a removal is announced without inserting the live region. */}
        <p role="status" className="text-sm text-gray-700 min-h-5">{removed}</p>

        <FormStatus status={status} error={error} errorId={errorId} quiet={quiet} alertShown={alertShown} />
      </form>

      {showPreview && (
        <section aria-labelledby={previewId} className="space-y-1">
          <h4 id={previewId} className="text-sm font-semibold text-gray-900">Prochain envoi</h4>
          <p className="text-sm text-gray-700">{customReminderPreviewSentence(savedPreview, timeZone)}</p>
        </section>
      )}
      {dirty && (
        <p id={dirtyId} className="text-sm text-gray-700">Enregistrez pour mettre à jour le prochain envoi.</p>
      )}
    </section>
  )
}
