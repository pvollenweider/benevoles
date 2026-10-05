// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { EMERGENCY_NOTE } from "@/lib/shift-info"

/** Next to the day-of contact (#560): set apart by its shape and weight, not by colour. */
export default function EmergencyNote({ className = "" }: { className?: string }) {
  return <p className={`text-sm font-medium text-gray-900 border-l-4 border-gray-400 pl-2 ${className}`}>{EMERGENCY_NOTE}</p>
}
