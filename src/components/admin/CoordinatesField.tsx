"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import { formatCoordinates, MAP_LINK_SR_SUFFIX, osmLink, parseCoordinates, type Coordinates } from "@/lib/map-link"

type Props = {
  id: string
  value: { latitude: number | null; longitude: number | null }
  onChange: (c: Coordinates | null) => void
  hint?: string
  small?: boolean
}

/**
 * Coordinates of a place (#191): the organiser pastes a maps link or a « lat, lon » pair, the
 * field keeps the parsed pair and shows the map link it will produce. No geocoding call: the
 * address search comes later, behind a provider interface.
 */
export default function CoordinatesField({ id, value, onChange, hint, small }: Props) {
  const stored = value.latitude != null && value.longitude != null ? { latitude: value.latitude, longitude: value.longitude } : null
  const key = formatCoordinates(stored)
  const [text, setText] = useState(key)
  const [invalid, setInvalid] = useState(false)
  // Outside changes (edit of another shift, reset of the form) replace the text; the field's own
  // emissions don't, so typing isn't reformatted under the cursor.
  const [seen, setSeen] = useState(key)
  const [emitted, setEmitted] = useState(key)
  if (seen !== key) {
    setSeen(key)
    if (key !== emitted) { setText(key); setInvalid(false) }
  }

  // Parsed on every change so the parent always has the latest pair; judged only on blur, so a
  // pair typed by hand is not called wrong after its first character.
  function commit(raw: string) {
    setText(raw)
    if (!raw.trim()) { setInvalid(false); setEmitted(""); onChange(null); return }
    const parsed = parseCoordinates(raw)
    if (parsed) { setInvalid(false); setEmitted(formatCoordinates(parsed)); onChange(parsed) }
  }

  const labelCls = small ? "block text-xs font-medium text-gray-600 mb-1" : "block text-sm font-medium text-gray-700 mb-1"
  const inputCls = small ? "input" : "w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
  return (
    <div>
      <label htmlFor={id} className={labelCls}>Coordonnées GPS ou lien de carte</label>
      <input
        id={id}
        type="text"
        value={text}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => setInvalid(!!text.trim() && !parseCoordinates(text))}
        placeholder="ex. 46.1806, 6.1228 ou un lien OpenStreetMap / Google Maps"
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-hint ${id}-error`}
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
        className={inputCls}
      />
      <p id={`${id}-hint`} className="text-xs text-gray-600 mt-1">
        {hint ?? "Collez un lien de carte ou une paire latitude, longitude."}
        {stored && !invalid && (
          <>
            {" "}
            <a href={osmLink(stored)} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline underline-offset-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              Vérifier sur la carte<span className="sr-only">{MAP_LINK_SR_SUFFIX}</span>
            </a>
          </>
        )}
      </p>
      <p id={`${id}-error`} role="alert" className={invalid ? "text-xs text-red-800 mt-1" : "sr-only"}>
        {invalid ? "Coordonnées non reconnues : indiquez « latitude, longitude » (ex. 46.1806, 6.1228) ou collez un lien de carte. La valeur précédente est conservée." : ""}
      </p>
    </div>
  )
}
