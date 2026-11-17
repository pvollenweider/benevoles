"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import { announce } from "@/lib/announce"
import { shiftShareRegistrationsText, type AdminShiftLink } from "@/lib/shift-share-links"
import ModalShell from "@/components/admin/ModalShell"
import { COPIED, COPY_FAILED, SHARE_FAILED, SHARED, useNativeShare } from "@/components/admin/EventShareLink"

const textButton =
  "inline-block py-3 sm:py-0.5 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const outlineButton =
  "inline-flex items-center min-h-9 text-sm font-medium border border-blue-600 text-blue-700 px-3 py-1.5 rounded-xl hover:bg-blue-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/** The panel's link, once created (the POST is idempotent: the same shift returns the same link). */
type PanelProps = { eventId: string; shiftId: string; onClose: () => void }

/**
 * « Partager ce créneau » (#1386): on a shift of « Où manque-t-il du monde ? » that still needs
 * people, a public link to that one shift, to paste into the association's chat group or page.
 * The link is created on first use (idempotent, so the URL and its QR code never change), copied
 * or shared like the event's link, and its « accepter après la fermeture » option is saved on
 * change. The counter reads the registrations the link brought.
 */
export default function ShiftShareButton({ eventId, shiftId, shiftName }: { eventId: string; shiftId: string; shiftName: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={textButton}>
        Partager ce créneau
        <span className="sr-only"> pour {shiftName}</span>
      </button>
      {open && <ShiftSharePanel eventId={eventId} shiftId={shiftId} onClose={() => setOpen(false)} />}
    </>
  )
}

function ShiftSharePanel({ eventId, shiftId, onClose }: PanelProps) {
  const [link, setLink] = useState<AdminShiftLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const canShare = useNativeShare()
  const urlRef = useRef<HTMLSpanElement>(null)
  const id = useId()

  useEffect(() => {
    let current = true
    fetch(`/api/admin/events/${eventId}/shift-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shiftId }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "Le lien n'a pas pu être créé.")
        return body as AdminShiftLink
      })
      .then((data) => { if (current) { setLink(data); setLoading(false) } })
      .catch((e: unknown) => {
        if (!current) return
        setError(e instanceof Error ? e.message : "Le lien n'a pas pu être créé. Vérifiez votre connexion et réessayez.")
        setLoading(false)
      })
    return () => { current = false }
  }, [eventId, shiftId])

  function show(text: string, isFailure = false) {
    setFailed(isFailure)
    announce(setMessage, text)
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      show(COPIED)
    } catch {
      if (urlRef.current) window.getSelection()?.selectAllChildren(urlRef.current)
      show(COPY_FAILED, true)
    }
  }

  async function share() {
    if (!link) return
    try {
      await navigator.share({ url: link.url })
      show(SHARED)
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") { setFailed(false); setMessage(""); return }
      show(SHARE_FAILED, true)
    }
  }

  async function toggleAfterClose(checked: boolean) {
    if (!link || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/shift-links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptsAfterClose: checked }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Enregistrement impossible. Réessayez.")
        return
      }
      setLink(body as AdminShiftLink)
      show(checked
        ? "Ce lien accepte une inscription même si les inscriptions de l'événement sont fermées."
        : "Ce lien suit de nouveau les dates d'inscription de l'événement.")
    } catch {
      setError("Enregistrement impossible. Vérifiez votre connexion et réessayez.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Partager ce créneau" onClose={onClose} panelClassName="max-w-lg" busy={saving}>
      <div className="space-y-4 text-sm text-gray-800">
        <p className="text-gray-700">
          À coller dans le groupe de discussion ou sur la page de votre association : la personne qui l&apos;ouvre voit ce créneau et s&apos;inscrit directement.
        </p>

        {loading && <p role="status" className="text-gray-700">Préparation du lien…</p>}

        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-800">{error}</div>
        )}

        {link && (
          <>
            <div className="space-y-1">
              <p className="font-medium text-gray-900">Lien :</p>
              <span ref={urlRef} className="block break-all font-medium text-gray-900 select-all">{link.url}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void copy()} className={outlineButton}>Copier le lien</button>
              {canShare && <button type="button" onClick={() => void share()} className={outlineButton}>Partager</button>}
              <a
                href={`/api/admin/events/${eventId}/shift-links/${link.id}/qr?format=png&download=1`}
                download
                className={outlineButton}
              >
                QR code PNG<span className="sr-only"> pour ce créneau, fichier à télécharger</span>
              </a>
            </div>

            <div>
              <label className="inline-flex items-start gap-2 text-sm text-gray-800 min-h-9 cursor-pointer">
                <input
                  type="checkbox"
                  checked={link.acceptsAfterClose}
                  onChange={(e) => void toggleAfterClose(e.target.checked)}
                  aria-disabled={saving || undefined}
                  aria-describedby={`${id}-hint`}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-500"
                />
                Accepter une inscription même si les inscriptions de l&apos;événement sont fermées
              </label>
              <p id={`${id}-hint`} className="text-xs text-gray-600 mt-1">
                Valable pour ce créneau seulement, tant qu&apos;il reste une place et qu&apos;il n&apos;a pas commencé.
              </p>
            </div>

            <p className="text-gray-700">{shiftShareRegistrationsText(link.registrations)}</p>
          </>
        )}

        <p role="status" className={message ? `text-sm ${failed ? "text-red-800" : "text-green-800"}` : "sr-only"}>{message}</p>
      </div>
    </ModalShell>
  )
}
