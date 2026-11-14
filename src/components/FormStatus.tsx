// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The two outcome regions of a form (#380), always mounted so an announcement never depends on
 * the element being inserted: a polite status for success, an alert for errors. `errorId` lets a
 * field point at the error with aria-describedby.
 *
 * `quiet` (#739, step 4): the error is a field error that `fail` announces by moving the focus to
 * the field, so it stays a plain visible paragraph and the alert, kept mounted, stays empty. Two
 * elements are always mounted, never a role turned on a mounted node; the id follows the text, so
 * the message is never in the DOM twice. The alert is not atomic (`aria-atomic="false"`): moving
 * the id or the visible style is not text, and must not make the sentence heard again.
 */
export default function FormStatus({ status, error, errorId, quiet = false }: { status?: string; error?: string | null; errorId?: string; quiet?: boolean }) {
  const box = "text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2"
  return (
    <>
      <p role="status" className={`text-sm font-medium text-green-800 ${status ? "" : "sr-only"}`}>{status ?? ""}</p>
      <p id={quiet ? errorId : undefined} className={quiet && error ? box : "hidden"}>{quiet ? error : ""}</p>
      <p id={quiet ? undefined : errorId} role="alert" aria-atomic="false" className={!quiet && error ? box : "sr-only"}>{quiet ? "" : error ?? ""}</p>
    </>
  )
}
