"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef, useState } from "react"
import { announce } from "@/lib/announce"
import {
  CALENDAR_COPIED,
  CALENDAR_COPY_FAILED,
  CALENDAR_CARD_TITLE,
} from "@/lib/calendar-card-copy"

const linkClass =
  "inline-block py-1 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const buttonClass =
  "text-sm font-medium border border-blue-600 text-blue-700 px-3 py-1.5 rounded-xl hover:bg-blue-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

export const CALENDAR_TITLE_ID = "calendar-title"

/**
 * « Mon calendrier » on the personal page (#961): the calendar subscription of the link, which the
 * volunteer's calendar app fetches again on its own (webcal:// link for the apps of this device,
 * the https address to copy for Google Agenda and other online calendars, behind a native
 * disclosure so the card stays short on a phone), and, with several
 * shifts, the one-off file of the whole planning (#480). The address only reads the confirmed
 * shifts: it is not the personal link. The copy result is shown and voiced through one status
 * region, always mounted; when the clipboard refuses, the address is selected and the message says
 * how to copy it by hand (a selection alone brings no copy menu on phones).
 */
export default function CalendarSubscribeCard({ webcalUrl, httpsUrl, downloadHref }: { webcalUrl: string; httpsUrl: string; downloadHref: string | null }) {
  const [message, setMessage] = useState("")
  const [failed, setFailed] = useState(false)
  const urlRef = useRef<HTMLSpanElement>(null)

  function show(text: string, isFailure = false) {
    setFailed(isFailure)
    announce(setMessage, text)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(httpsUrl)
      show(CALENDAR_COPIED)
    } catch {
      if (urlRef.current) window.getSelection()?.selectAllChildren(urlRef.current)
      show(CALENDAR_COPY_FAILED, true)
    }
  }

  return (
    <section aria-labelledby={CALENDAR_TITLE_ID} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h2 id={CALENDAR_TITLE_ID} className="text-sm font-semibold text-gray-900">{CALENDAR_CARD_TITLE}</h2>
      <p className="text-sm text-gray-700">
        Abonne ton agenda à tes créneaux confirmés : il se met à jour tout seul si un horaire change, si un créneau est annulé ou ajouté (selon l&apos;agenda, après quelques heures, parfois un jour).
      </p>

      <div>
        <a href={webcalUrl} aria-describedby="calendar-webcal-hint" className={linkClass}>
          S&apos;abonner avec l&apos;agenda de cet appareil
        </a>
        <p id="calendar-webcal-hint" className="text-xs text-gray-600">
          Pour iPhone, iPad, Mac, Outlook ou Thunderbird. Sur un téléphone Android, passe plutôt par Google Agenda, ci-dessous.
        </p>
      </div>

      <details>
        <summary className="cursor-pointer py-1 text-sm font-medium text-gray-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          Google Agenda ou autre agenda en ligne
        </summary>
        <div className="mt-2 space-y-2">
          <p className="text-sm text-gray-700">
            Sur un ordinateur, ouvre Google Agenda dans ton navigateur, choisis « Autres agendas », puis « À partir de l&apos;URL », et colle cette adresse. L&apos;agenda apparaît ensuite aussi sur ton téléphone.
          </p>
          <p className="text-sm text-gray-700">
            Adresse de l&apos;abonnement :{" "}
            <span ref={urlRef} translate="no" className="font-medium text-gray-900 break-all select-all">{httpsUrl}</span>
          </p>
          <p className="text-xs text-gray-600">
            Cette adresse montre seulement tes créneaux confirmés, sans permettre de les modifier. Garde-la pour toi.
          </p>
          <button type="button" onClick={() => void copy()} className={buttonClass}>
            Copier l&apos;adresse de l&apos;abonnement
          </button>
          <p role="status" className={message ? `text-sm ${failed ? "text-red-800" : "text-green-800"}` : "sr-only"}>
            {message}
          </p>
        </div>
      </details>

      {downloadHref && (
        <div>
          <a href={downloadHref} download aria-describedby="calendar-download-hint" className={linkClass}>
            Télécharger tout mon planning (fichier .ics)
          </a>
          <p id="calendar-download-hint" className="text-xs text-gray-600">
            Un fichier à importer une fois : il ne se met pas à jour.
          </p>
        </div>
      )}
    </section>
  )
}
