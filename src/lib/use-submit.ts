"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"

/**
 * The submit logic every admin form repeats (#380): one request at a time (a ref, so the guard
 * is synchronous), try/catch/finally, the API error shape `{ error }` turned into a French
 * sentence, a network sentence when nothing answered, and a `fail(message, field)` that shows the
 * message, remembers which field (by key) it concerns and moves the focus to the element given once the message is in
 * the DOM, so the field is announced with its description.
 *
 * `quiet` (#739, step 4) tells FormStatus not to use its alert: when `fail` moves the focus to the
 * field, the field's description says the error, and the alert would say it a second time. The
 * alert keeps errors about the field that already had the focus, and general errors.
 */

export const NETWORK_ERROR = "Impossible d'enregistrer. Vérifiez votre connexion et réessayez."
export const GENERIC_ERROR = "Une erreur est survenue."

export type SubmitOutcome<T> = { ok: true; data: T; status: number } | { ok: false; error: string; status: number | null }

/** Reads `{ error }` from a failed response, with a fallback. */
export async function errorOf(res: Response, fallback = GENERIC_ERROR): Promise<string> {
  const data = await res.json().catch(() => ({}))
  return typeof data?.error === "string" && data.error.trim() ? data.error : fallback
}

/**
 * One request outside the hook, same outcome shape: for components that fire several
 * independent requests (timeline drags, per-role actions) and keep their own busy flags.
 */
export async function requestJson<T = unknown>(request: () => Promise<Response>, fallback = GENERIC_ERROR): Promise<SubmitOutcome<T>> {
  try {
    const res = await request()
    if (!res.ok) return { ok: false, error: await errorOf(res, fallback), status: res.status }
    return { ok: true, data: (await res.json().catch(() => ({}))) as T, status: res.status }
  } catch {
    return { ok: false, error: NETWORK_ERROR, status: null }
  }
}

export function useSubmit() {
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalidField, setInvalidField] = useState<string | null>(null)
  const [quiet, setQuiet] = useState(false)
  const [status, setStatus] = useState("")
  // Whether the mounted alert already holds text, so a repeat is emptied before being filled again.
  const alertHasTextRef = useRef(false)
  // A refill waits for a later task; a newer failure or a reset must not be overwritten by it.
  const refillRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelRefill = useCallback(() => {
    if (refillRef.current !== null) {
      clearTimeout(refillRef.current)
      refillRef.current = null
    }
  }, [])

  useEffect(() => cancelRefill, [cancelRefill])

  /**
   * Shows an error, with a field and an element to focus when it has one. When the focus moves to
   * that element, the message is its description and stays out of the alert (a); when the field
   * already had the focus (b), when there is no field (c) or no element to focus (d), the alert
   * says it. The alert is emptied first only when it already holds text, then refilled in a later
   * task: a same-task refill is what made the same sentence heard twice.
   */
  const fail = useCallback((message: string, field?: string, el?: HTMLElement | null) => {
    cancelRefill()
    const moves = !!el && document.activeElement !== el
    if (moves) {
      flushSync(() => {
        setError(message)
        setInvalidField(field ?? null)
        setQuiet(true)
      })
      alertHasTextRef.current = false
      el.focus()
      // Focus refused (hidden field, read-only page): the alert says it after all.
      if (document.activeElement !== el) {
        flushSync(() => setQuiet(false))
        alertHasTextRef.current = true
      }
      return
    }
    const showInAlert = () => {
      flushSync(() => {
        setError(message)
        setInvalidField(field ?? null)
        setQuiet(false)
      })
      alertHasTextRef.current = true
    }
    if (alertHasTextRef.current) {
      flushSync(() => { setError(null); setInvalidField(null); setQuiet(false) })
      alertHasTextRef.current = false
      refillRef.current = setTimeout(() => {
        refillRef.current = null
        showInAlert()
      }, 0)
      return
    }
    showInAlert()
  }, [cancelRefill])

  const reset = useCallback(() => {
    cancelRefill()
    alertHasTextRef.current = false
    setError(null)
    setInvalidField(null)
    setQuiet(false)
    setStatus("")
  }, [cancelRefill])

  /** For `aria-invalid`: only the field the error is about, by its key (refs can't be read during render). */
  const isInvalid = useCallback((field: string) => (invalidField === field ? true : undefined), [invalidField])

  /**
   * Runs the request once, whatever the clicks. `parse` turns a successful response into data
   * (defaults to JSON); a failed response or a thrown fetch becomes `{ ok: false, error }` and
   * the error is shown unless `silent`.
   */
  const submit = useCallback(async <T = unknown>(
    request: () => Promise<Response>,
    opts: { parse?: (res: Response) => Promise<T>; silent?: boolean; fallback?: string } = {},
  ): Promise<SubmitOutcome<T>> => {
    if (busyRef.current) return { ok: false, error: "", status: null }
    busyRef.current = true
    cancelRefill()
    alertHasTextRef.current = false
    setBusy(true)
    setError(null)
    setInvalidField(null)
    setQuiet(false)
    setStatus("")
    try {
      const res = await request()
      if (!res.ok) {
        const error = await errorOf(res, opts.fallback)
        if (!opts.silent) { setError(error); alertHasTextRef.current = true }
        return { ok: false, error, status: res.status }
      }
      const data = opts.parse ? await opts.parse(res) : ((await res.json().catch(() => ({}))) as T)
      return { ok: true, data, status: res.status }
    } catch {
      if (!opts.silent) { setError(NETWORK_ERROR); alertHasTextRef.current = true }
      return { ok: false, error: NETWORK_ERROR, status: null }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [cancelRefill])

  return { submit, busy, error, status, setStatus, fail, reset, isInvalid, invalidField, quiet }
}
