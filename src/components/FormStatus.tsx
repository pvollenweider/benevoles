// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The two outcome regions of a form (#380), always mounted so an announcement never depends on
 * the element being inserted: a polite status for success, an alert for errors. `errorId` lets a
 * field point at the error with aria-describedby.
 */
export default function FormStatus({ status, error, errorId }: { status?: string; error?: string | null; errorId?: string }) {
  return (
    <>
      <p role="status" className={`text-sm font-medium text-green-800 ${status ? "" : "sr-only"}`}>{status ?? ""}</p>
      <p id={errorId} role="alert" className={`text-sm font-medium text-red-700 ${error ? "bg-red-50 border border-red-200 rounded-xl px-3 py-2" : "sr-only"}`}>{error ?? ""}</p>
    </>
  )
}
