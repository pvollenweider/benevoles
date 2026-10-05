"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import { flushSync } from "react-dom"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { removeLogoRecap } from "@/lib/action-recap"
import { fitLogo, LOGO_ACCEPT, LOGO_ERRORS, LOGO_HINT, logoFileProblem, type OrgLogo } from "@/lib/org-logo"

const BUTTON_FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"

/**
 * The organization's logo (#300), for owners: the current one with its preview, a file field
 * (PNG or JPEG, 2 MB) with a preview of the chosen file before it is sent, and removal behind a
 * confirmation. The logo shown is the one stored, as the server returned it.
 */
export default function OrgLogoForm({ initialLogo, organizationName }: { initialLogo: OrgLogo | null; organizationName: string }) {
  const [logo, setLogo] = useState<OrgLogo | null>(initialLogo)
  // The chosen file and its preview, a local object URL released when replaced or unmounted.
  const [chosen, setChosen] = useState<{ file: File; url: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const removeRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  const inputId = `${id}-file`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  const chosenUrl = useRef<string | null>(null)
  useEffect(() => () => { if (chosenUrl.current) URL.revokeObjectURL(chosenUrl.current) }, [])

  function setFile(next: File | null) {
    if (chosenUrl.current) URL.revokeObjectURL(chosenUrl.current)
    chosenUrl.current = next ? URL.createObjectURL(next) : null
    setChosen(next && chosenUrl.current ? { file: next, url: chosenUrl.current } : null)
  }

  function choose(next: File | null) {
    setStatus("")
    const problem = next ? logoFileProblem(next) : null
    setError(problem)
    setFile(next && !problem ? next : null)
    // An invalid file is not kept in the field either: submitting then says « choose an image »
    // rather than sending it, and the specific error stays until the next choice.
    if (problem && inputRef.current) inputRef.current.value = ""
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    const file = chosen?.file ?? null
    const problem = logoFileProblem(file)
    if (problem || !file) {
      // Keeps the error of an invalid file just chosen; otherwise asks to choose one.
      setError((prev) => prev ?? problem ?? LOGO_ERRORS.empty)
      inputRef.current?.focus()
      return
    }
    setLoading(true)
    setError(null)
    setStatus("Envoi du logo en cours.")
    try {
      const res = await fetch("/api/admin/settings/organization/logo", {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus("")
        setError(typeof data?.error === "string" ? data.error : "Le logo n'a pas pu être enregistré. Réessayez.")
        inputRef.current?.focus()
        return
      }
      setLogo(data.logo ?? null)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ""
      setStatus("Logo enregistré. Il apparaît maintenant sur vos pages publiques et vos documents.")
    } catch {
      setStatus("")
      setError("Impossible d'envoyer le logo. Vérifiez votre connexion et réessayez.")
      inputRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  async function remove() {
    setLoading(true)
    setRemoveError(null)
    try {
      const res = await fetch("/api/admin/settings/organization/logo", { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setRemoveError(typeof data?.error === "string" ? data.error : "Le logo n'a pas pu être retiré. Réessayez.")
        return
      }
      // The remove button goes away with the logo: the focus moves to the file field, after the
      // dialog is gone (its own focus return would find no trigger).
      flushSync(() => {
        setConfirming(false)
        setLogo(null)
        setStatus("Logo retiré. Le nom de l'organisation reste affiché.")
      })
      inputRef.current?.focus()
    } catch {
      setRemoveError("Impossible de retirer le logo. Vérifiez votre connexion et réessayez.")
    } finally {
      setLoading(false)
    }
  }

  const shown = logo ? fitLogo(logo.width, logo.height, 240, 96) : null

  return (
    <section aria-labelledby={`${id}-title`} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
      <h2 id={`${id}-title`} className="text-sm font-semibold text-gray-900">Logo de l&apos;organisation</h2>
      <p className="text-sm text-gray-700">
        Affiché en haut de la page publique de l&apos;organisation et de vos événements, sur les feuilles à imprimer, les badges,
        les attestations et dans les emails. Le nom de l&apos;organisation reste toujours écrit à côté.
      </p>

      {logo && shown ? (
        <figure className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- same-origin image already resized server-side */}
          <img
            src={logo.src}
            alt={organizationName}
            width={shown.width}
            height={shown.height}
            className="rounded-lg border border-gray-200 bg-white p-2 box-content"
          />
          <figcaption className="text-xs text-gray-600">Logo actuel</figcaption>
        </figure>
      ) : (
        <p className="text-sm text-gray-700">Aucun logo pour l&apos;instant.</p>
      )}

      <form onSubmit={upload} noValidate className="space-y-3">
        <div>
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-800 mb-1">
            {logo ? "Remplacer par une autre image" : "Choisir une image"}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={LOGO_ACCEPT}
            onChange={(e) => choose(e.target.files?.[0] ?? null)}
            aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            aria-invalid={error ? true : undefined}
            className="block w-full text-sm text-gray-800 file:mr-3 file:rounded-xl file:border file:border-gray-300 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-800 hover:file:bg-gray-50 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          />
          <p id={hintId} className="mt-1 text-xs text-gray-600">{LOGO_HINT}</p>
          {error && <p id={errorId} role="alert" className="mt-1 text-sm font-medium text-red-700">{error}</p>}
        </div>

        {chosen && (
          <figure className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview (object URL) of the chosen file */}
            <img src={chosen.url} alt="Aperçu de l'image choisie" className="max-h-24 max-w-60 rounded-lg border border-gray-200 bg-white p-2 box-content object-contain" />
            <figcaption className="text-xs text-gray-600">Aperçu avant envoi. L&apos;image enregistrée sera réduite à 512 pixels de côté au plus.</figcaption>
          </figure>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            aria-disabled={loading || undefined}
            className={`bg-gray-900 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors aria-disabled:opacity-50 ${BUTTON_FOCUS}`}
          >
            {loading && !confirming ? "Envoi…" : "Enregistrer le logo"}
          </button>
          {logo && (
            <button
              ref={removeRef}
              type="button"
              onClick={() => { setRemoveError(null); setStatus(""); setConfirming(true) }}
              className={`rounded-xl px-4 py-2 text-sm font-medium border border-gray-300 text-red-700 hover:bg-red-50 transition-colors ${BUTTON_FOCUS}`}
            >
              Retirer le logo
            </button>
          )}
        </div>
      </form>
      <p role="status" className={`text-sm font-medium min-h-5 ${loading && !confirming ? "text-gray-800" : "text-green-800"}`}>{status}</p>

      {confirming && (
        <ConfirmActionModal
          recap={removeLogoRecap()}
          busy={loading}
          error={removeError}
          onConfirm={() => void remove()}
          onCancel={() => { setConfirming(false); setRemoveError(null); requestAnimationFrame(() => removeRef.current?.focus()) }}
        />
      )}
    </section>
  )
}
