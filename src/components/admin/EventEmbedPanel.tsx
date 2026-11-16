"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState } from "react"
import { announce } from "@/lib/announce"
import { EMBED_DEFAULT_HEIGHT, embedFrameId, embedFrameTitle, embedSnippet, embedUrl } from "@/lib/embed"

const outlineButton =
  "inline-flex items-center min-h-9 text-sm font-medium border border-blue-600 text-blue-700 px-3 py-1.5 rounded-xl hover:bg-blue-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const quietButton =
  "inline-flex items-center min-h-9 text-sm font-medium border border-gray-300 text-gray-800 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

export const EMBED_COPIED = "Code copié."
export const EMBED_COPY_FAILED = "Copie impossible : le code est sélectionné, copiez-le."

/**
 * « Intégrer à votre site » (#948), in the event's « Liens à partager » page of a published
 * event: the HTML to paste into the association's own site (an iframe of the embeddable sign-up),
 * for the whole event or one group link (#947), with or without the auto-resize, a copy button,
 * a live preview and short instructions for site builders. Closed by default: a disclosure button.
 */
export default function EventEmbedPanel({ publicUrl, eventTitle, eventSlug, groupLinks }: {
  /** The event's public URL (with `?org=` locally). */
  publicUrl: string
  eventTitle: string
  eventSlug: string
  /** The event's group links, by code and name, to embed one of them instead of the whole event. */
  groupLinks: { code: string; name: string }[]
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [groupCode, setGroupCode] = useState("")
  const [autoResize, setAutoResize] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [message, setMessage] = useState("")
  const [failed, setFailed] = useState(false)
  const codeRef = useRef<HTMLTextAreaElement>(null)

  // A group link deleted meanwhile: back to the whole event.
  const code = groupLinks.some((l) => l.code === groupCode) ? groupCode : ""
  const url = embedUrl(publicUrl, code || null)
  const snippet = embedSnippet({ url, eventTitle, frameId: embedFrameId(eventSlug, code || null), autoResize })
  const chosenName = groupLinks.find((l) => l.code === code)?.name

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet)
      setFailed(false)
      announce(setMessage, EMBED_COPIED)
    } catch {
      codeRef.current?.focus()
      codeRef.current?.select()
      setFailed(true)
      announce(setMessage, EMBED_COPY_FAILED)
    }
  }

  const contentId = `${id}-content`
  const previewId = `${id}-preview`

  return (
    <div className="space-y-3 border-t border-gray-200 pt-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Intégrer à votre site</h3>
        <p className="text-sm text-gray-700">
          Affichez l&apos;inscription sur le site de votre association : les bénévoles choisissent leurs créneaux et s&apos;inscrivent sans quitter votre site.
        </p>
      </div>
      <button type="button" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen((o) => !o)} className={outlineButton}>
        Code d&apos;intégration
      </button>

      {/* Always there for aria-controls; its content only once opened (no hidden copy of the URL). */}
      <div id={contentId} hidden={!open} className="space-y-3">
        {open && <>
        {groupLinks.length > 0 && (
          <div>
            <label htmlFor={`${id}-group`} className="block text-sm font-medium text-gray-700 mb-1">Postes affichés</label>
            <select
              id={`${id}-group`}
              value={code}
              onChange={(e) => setGroupCode(e.target.value)}
              className="input w-full sm:w-auto"
            >
              <option value="">Tout l&apos;événement</option>
              {groupLinks.map((l) => (
                <option key={l.code} value={l.code}>Lien « {l.name} »</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-800 min-h-9 cursor-pointer">
            <input
              type="checkbox"
              checked={autoResize}
              onChange={(e) => setAutoResize(e.target.checked)}
              aria-describedby={`${id}-resize-hint`}
              className="h-4 w-4 rounded border-gray-500"
            />
            Ajuster la hauteur automatiquement
          </label>
          <p id={`${id}-resize-hint`} className="text-xs text-gray-600">
            Ajoute quelques lignes de script au code, pour que le cadre prenne la hauteur de la page. Si votre éditeur de site refuse les scripts, laissez la case décochée : le cadre garde une hauteur fixe de {EMBED_DEFAULT_HEIGHT} pixels et la page défile à l&apos;intérieur.
          </p>
        </div>

        <div>
          <label htmlFor={`${id}-code`} className="block text-sm font-medium text-gray-700 mb-1">Code à coller dans votre site</label>
          <textarea
            ref={codeRef}
            id={`${id}-code`}
            readOnly
            rows={autoResize ? 9 : 4}
            value={snippet}
            spellCheck={false}
            className="input w-full font-mono text-xs leading-relaxed resize-y"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void copy()} className={outlineButton}>
            Copier le code
          </button>
          <button
            type="button"
            aria-expanded={showPreview}
            aria-controls={previewId}
            onClick={() => setShowPreview((p) => !p)}
            className={quietButton}
          >
            Aperçu en direct
          </button>
        </div>
        <p role="status" className={message ? `text-sm ${failed ? "text-red-800" : "text-green-800"}` : "sr-only"}>{message}</p>

        <div id={previewId} hidden={!showPreview} className="space-y-1">
          <p className="text-xs text-gray-600">Aperçu : c&apos;est la vraie page d&apos;inscription, une inscription faite ici est enregistrée.</p>
          {showPreview && (
            <iframe
              src={url}
              title={`Aperçu : ${embedFrameTitle(eventTitle)}${chosenName ? `, lien « ${chosenName} »` : ""}`}
              loading="lazy"
              className="w-full h-[600px] rounded-xl border border-gray-200 bg-white"
            />
          )}
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-900">Comment l&apos;ajouter à votre site</h4>
          <ol className="mt-1 list-decimal pl-5 text-sm text-gray-700 space-y-1">
            <li>Copiez le code.</li>
            <li>Dans l&apos;éditeur de votre site, ouvrez la page voulue et ajoutez un bloc de type « HTML », « Code personnalisé » ou « Intégrer ».</li>
            <li>Collez le code dans ce bloc, puis enregistrez et publiez la page.</li>
          </ol>
          <p className="text-xs text-gray-600 mt-1">Le cadre affiche le nom et le logo de votre organisation. Les liens qui quittent l&apos;inscription (lien personnel, pages de l&apos;événement, mentions légales) s&apos;ouvrent dans un nouvel onglet.</p>
        </div>
        </>}
      </div>
    </div>
  )
}
