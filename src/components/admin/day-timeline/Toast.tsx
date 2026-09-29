// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

export default function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 bg-green-600 text-white text-xs font-medium px-3.5 py-2 rounded-xl shadow-lg pointer-events-none">
      ✓ {message}
    </div>
  )
}
