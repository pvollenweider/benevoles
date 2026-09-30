// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Short outcome of a quick edit. Errors stay until the next message; the parent announces the text. */
export default function Toast({ message, kind = "success" }: { message: string; kind?: "success" | "error" }) {
  return (
    <div
      className={`fixed bottom-5 right-5 z-50 text-sm font-medium px-3.5 py-2 rounded-xl shadow-lg pointer-events-none ${
        kind === "error" ? "bg-red-700 text-white" : "bg-green-700 text-white"
      }`}
    >
      {kind === "success" && <span aria-hidden="true">✓ </span>}{message}
    </div>
  )
}
