"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef, useState } from "react"
import { announce } from "@/lib/announce"
import type { RenderedCitation } from "@/lib/public-content"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"

export const CITATION_COPIED = "Texte copié"
export const CITATION_COPY_FAILED = "Copie impossible : le texte est sélectionné, copiez-le avec Ctrl+C (Cmd+C sur Mac)."

/**
 * A quotable text of the editorial pages (#1323), marked `<!-- citation -->` in the source: the
 * paragraph, its language for the English one (WCAG 3.1.2), and a « Copier » button that writes
 * the plain text to the clipboard. The result is shown and voiced through one status region,
 * always mounted; the button keeps the focus (nothing moves it), has a 44 px target and a name
 * that says which text it copies, from the heading above. Without JavaScript the text stays
 * selectable and the button does nothing, like the other client islands of the public pages.
 * When the clipboard refuses (insecure context, permission denied), the paragraph is selected so
 * that a keyboard user only has to press the copy shortcut.
 */
export default function CitationBlock({ text, lang, heading }: RenderedCitation) {
  const [message, setMessage] = useState("")
  const [failed, setFailed] = useState(false)
  const paragraph = useRef<HTMLParagraphElement>(null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setFailed(false)
      announce(setMessage, CITATION_COPIED)
    } catch {
      if (paragraph.current) window.getSelection()?.selectAllChildren(paragraph.current)
      setFailed(true)
      announce(setMessage, CITATION_COPY_FAILED)
    }
  }

  return (
    <div className="not-prose my-6 max-w-[65ch] rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      <p ref={paragraph} lang={lang} className="text-base leading-[1.75] text-gray-800 dark:text-gray-200" style={{ textWrap: "pretty" }}>
        {text}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={heading ? `Copier : ${heading}` : "Copier ce texte"}
          className={`inline-flex min-h-11 items-center rounded-xl border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-gray-700 ${focusRing}`}
        >
          Copier
        </button>
        <p role="status" className={message ? `text-sm ${failed ? "text-red-800 dark:text-red-300" : "text-green-800 dark:text-green-300"}` : "sr-only"}>
          {message}
        </p>
      </div>
    </div>
  )
}
