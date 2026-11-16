"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { forwardRef, useState } from "react"
import { flushSync } from "react-dom"
import { useHydrated } from "@/lib/use-hydrated"
import { recoveryCodesFile, RECOVERY_CODES_FILE_NAME } from "@/lib/second-factor-display"

export const textButtonClass = "min-h-6 text-sm text-gray-700 underline underline-offset-2 hover:text-gray-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-80"
export const secondaryButtonClass = "border border-blue-600 text-blue-700 bg-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-blue-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 disabled:opacity-80"

/**
 * A status region that is always mounted, cleared before each new message so the same sentence is
 * announced again (copy twice in a row).
 */
export function useAnnouncement() {
  const [message, setMessage] = useState("")
  const announce = (text: string) => {
    flushSync(() => setMessage(""))
    setMessage(text)
  }
  return { message, announce }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

type Props = { codes: string[]; email: string; headingLevel: 2 | 3; children?: React.ReactNode }

/**
 * The ten recovery codes, shown once (pentest F6): on the enrolment page and on the super admin's
 * profile after making new ones. The heading takes the focus when the panel appears (the parent
 * passes the ref and announces the outcome in its own always-mounted region).
 */
const RecoveryCodesPanel = forwardRef<HTMLHeadingElement, Props>(function RecoveryCodesPanel({ codes, email, headingLevel, children }, ref) {
  const hydrated = useHydrated()
  const { message, announce } = useAnnouncement()
  const Heading = headingLevel === 2 ? "h2" : "h3"

  async function copyAll() {
    announce((await copyText(codes.join("\n"))) ? "Codes copiés." : "Copie impossible. Sélectionnez les codes et copiez-les.")
  }

  function download() {
    const blob = new Blob([recoveryCodesFile(codes, { site: window.location.host, email, createdAt: new Date() })], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = RECOVERY_CODES_FILE_NAME
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="space-y-4">
      <Heading ref={ref} tabIndex={-1} className="text-base font-semibold text-gray-900 outline-none">Vos codes de secours</Heading>
      <p className="text-sm text-gray-700">
        Chaque code permet de se connecter une seule fois si vous perdez votre téléphone. Notez-les maintenant dans un endroit sûr : ils ne seront plus affichés.
      </p>
      <ol className="list-decimal pl-10 pr-3 py-3 space-y-1 font-mono slashed-zero text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl marker:text-gray-600">
        {codes.map((code) => <li key={code}>{code}</li>)}
      </ol>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={copyAll} disabled={!hydrated} className={secondaryButtonClass}>Copier les codes</button>
        <button type="button" onClick={download} disabled={!hydrated} className={secondaryButtonClass}>Télécharger les codes (fichier texte)</button>
      </div>
      <p role="status" className={message ? "text-sm font-medium text-gray-800" : "sr-only"}>{message}</p>
      {children}
    </section>
  )
})

export default RecoveryCodesPanel
