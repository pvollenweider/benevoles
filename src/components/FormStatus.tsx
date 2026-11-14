// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The two outcome regions of a form (#380), always mounted so an announcement never depends on
 * the element being inserted: a polite status for success, an alert for errors. `errorId` lets a
 * field point at the error with aria-describedby.
 *
 * `quiet` (#739, step 4): the error is a field error that `fail` announces by moving the focus to
 * the field, so it stays visible but outside the alert, which stays empty. The wrapper and both
 * spans are always mounted, with stable attributes, and the message is in the DOM once: the id
 * never moves and the alert span only sees a text change when it is the one that says the error.
 * `alertShown` (#739, review) blanks only the alert span while a repeated failure waits to be
 * refilled: `error` stays set, so the box does not blink and the field keeps its description.
 */
export default function FormStatus({ status, error, errorId, quiet = false, alertShown = true }: { status?: string; error?: string | null; errorId?: string; quiet?: boolean; alertShown?: boolean }) {
  const box = "text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2"
  return (
    <>
      <p role="status" className={`text-sm font-medium text-green-800 ${status ? "" : "sr-only"}`}>{status ?? ""}</p>
      <div id={errorId} className={error ? box : "sr-only"}>
        <span>{quiet || !alertShown ? error : ""}</span>
        <span role="alert">{quiet || !alertShown ? "" : error ?? ""}</span>
      </div>
    </>
  )
}
