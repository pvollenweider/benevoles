"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useRef, useState } from "react"
import { flushSync } from "react-dom"

/**
 * The submit logic every admin form repeats (#380): one request at a time (a ref, so the guard
 * is synchronous), try/catch/finally, the API error shape `{ error }` turned into a French
 * sentence, a network sentence when nothing answered, and a `fail(message, field)` that shows the
 * message, remembers which field (by key) it concerns and moves the focus to the element given once the message is in
 * the DOM, so the field is announced with its description.
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
  const [status, setStatus] = useState("")

  /**
   * Shows an error; with a field, marks and focuses it. Cleared first so the same sentence is
   * announced again; committed synchronously so the focused field already carries the message.
   */
  const fail = useCallback((message: string, field?: string, el?: HTMLElement | null) => {
    flushSync(() => { setError(null); setInvalidField(null) })
    flushSync(() => { setError(message); setInvalidField(field ?? null) })
    el?.focus()
  }, [])

  const reset = useCallback(() => {
    setError(null)
    setInvalidField(null)
    setStatus("")
  }, [])

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
    setBusy(true)
    setError(null)
    setInvalidField(null)
    setStatus("")
    try {
      const res = await request()
      if (!res.ok) {
        const error = await errorOf(res, opts.fallback)
        if (!opts.silent) setError(error)
        return { ok: false, error, status: res.status }
      }
      const data = opts.parse ? await opts.parse(res) : ((await res.json().catch(() => ({}))) as T)
      return { ok: true, data, status: res.status }
    } catch {
      if (!opts.silent) setError(NETWORK_ERROR)
      return { ok: false, error: NETWORK_ERROR, status: null }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  return { submit, busy, error, status, setStatus, fail, reset, isInvalid, invalidField }
}
