"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useId } from "react"
import { announce } from "@/lib/announce"
import { requestJson } from "@/lib/use-submit"
import { broadcastRecap, prefillNeedsConfirmation, prefillRecap } from "@/lib/action-recap"
import type { ProductUpdateDraft } from "@/lib/product-update-draft"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { renderMarkdown } from "@/lib/markdown"
import RequiredMark from "@/components/RequiredMark"

export type ProductUpdateSendRow = {
  id: string
  subject: string
  content: string
  recipientCount: number
  successCount: number
  createdAt: string
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function ProductUpdatesManager({
  recipientCount, initialSends, drafts = [],
}: {
  recipientCount: number
  initialSends: ProductUpdateSendRow[]
  /** One per released version, newest first (#762): what « Préremplir » puts in the fields. */
  drafts?: ProductUpdateDraft[]
}) {
  const [sends, setSends] = useState(initialSends)
  const [subject, setSubject] = useState("")
  const [content, setContent] = useState("")
  const [testEmail, setTestEmail] = useState("")
  const [sendingTest, setSendingTest] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [draftVersion, setDraftVersion] = useState(drafts[0]?.version ?? "")
  // The draft chosen when « Préremplir » was pressed, while its confirmation is open.
  const [prefillTarget, setPrefillTarget] = useState<ProductUpdateDraft | null>(null)

  const subjectId = useId()
  const contentId = useId()
  const testEmailId = useId()
  const draftId = useId()
  const draftHintId = useId()

  const canSend = subject.trim().length > 0 && content.trim().length > 0

  function missingFields(message: string) {
    announce(setError, message)
    document.getElementById(subject.trim() ? contentId : subjectId)?.focus()
  }

  // Fills both fields from a version, then says so; focus stays on « Préremplir » (the dialog
  // gives it back there), so the announcement isn't cut off by a field's label.
  function applyDraft(draft: ProductUpdateDraft) {
    setSubject(draft.subject)
    setContent(draft.content)
    setError(null)
    announce(setAnnouncement, `Objet et contenu préremplis depuis la version ${draft.version}. Relisez-les avant l'envoi.`)
  }

  function prefill() {
    const draft = drafts.find((d) => d.version === draftVersion)
    if (!draft) return
    if (prefillNeedsConfirmation(subject, content)) setPrefillTarget(draft)
    else applyDraft(draft)
  }

  function confirmPrefill() {
    if (!prefillTarget) return
    const draft = prefillTarget
    // Closed first: a screen reader ignores the status paragraph while the dialog is open.
    setPrefillTarget(null)
    applyDraft(draft)
  }

  async function sendTest() {
    if (sendingTest || sending) return
    if (!canSend) { missingFields("Indiquez un objet et un contenu avant d'envoyer un test."); return }
    setSendingTest(true)
    setError(null)
    const email = testEmail.trim()
    const result = await requestJson(() => fetch("/api/super-admin/product-updates/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(email ? { subject, content, email } : { subject, content }),
    }), "L'email de test n'a pas pu être envoyé.")
    setSendingTest(false)
    if (!result.ok) { setError(result.error); return }
    announce(setAnnouncement, email ? `Email de test envoyé à ${email}.` : "Email de test envoyé à votre propre adresse.")
  }

  function sendBroadcast() {
    if (sendingTest || sending) return
    if (!canSend) { missingFields("Indiquez un objet et un contenu avant d'envoyer."); return }
    setError(null)
    setSendError(null)
    setConfirming(true)
  }

  async function runBroadcast() {
    setSending(true)
    setSendError(null)
    const result = await requestJson<ProductUpdateSendRow>(() => fetch("/api/super-admin/product-updates/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, content }),
    }), "La communication n'a pas pu être envoyée.")
    setSending(false)
    // A failure stays in the dialog with « Réessayer »; the message is kept.
    if (!result.ok) { setSendError(result.error); return }
    const send = result.data
    setConfirming(false)
    setSends((prev) => [send, ...prev])
    announce(setAnnouncement, `Communication envoyée à ${send.successCount}/${send.recipientCount} destinataire${send.recipientCount > 1 ? "s" : ""}.`)
    setSubject("")
    setContent("")
  }

  return (
    <div className="space-y-6">
      <p role="status" className={announcement ? "text-sm text-gray-800 bg-green-50 border border-green-200 rounded-xl px-3 py-2" : "sr-only"}>{announcement}</p>
      {confirming && (
        <ConfirmActionModal recap={broadcastRecap(recipientCount)} busy={sending} error={sendError} onConfirm={() => void runBroadcast()} onCancel={() => setConfirming(false)} />
      )}
      {prefillTarget && (
        <ConfirmActionModal recap={prefillRecap(prefillTarget.version)} busy={false} onConfirm={confirmPrefill} onCancel={() => setPrefillTarget(null)} />
      )}

      <div>
        <h1 className="text-xl font-bold text-gray-900">Communications admin</h1>
        <p className="text-sm text-gray-500">
          {recipientCount} organisateur{recipientCount > 1 ? "s" : ""} abonné{recipientCount > 1 ? "s" : ""} à ces communications.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Nouveau message</h2>
          {drafts.length > 0 && (
            <div>
              <label htmlFor={draftId} className="block text-xs font-medium text-gray-600 mb-1">Partir des nouveautés de la version</label>
              <div className="flex flex-wrap items-stretch gap-2">
                <select
                  id={draftId}
                  value={draftVersion}
                  onChange={(e) => setDraftVersion(e.target.value)}
                  aria-describedby={draftHintId}
                  className="flex-1 min-w-0 border border-gray-500 rounded-lg px-3 py-2 text-sm bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  {drafts.map((d) => (
                    <option key={d.version} value={d.version}>{d.version}, {d.dateLabel}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={prefill}
                  className="text-sm text-gray-700 border border-gray-300 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Préremplir
                </button>
              </div>
              <p id={draftHintId} className="mt-1 text-xs text-gray-600">
                Reprend l&apos;essentiel de la version et un lien vers la page Nouveautés ; vous pouvez tout modifier avant l&apos;envoi.
              </p>
            </div>
          )}
          <div>
            <label htmlFor={subjectId} className="block text-xs font-medium text-gray-600 mb-1">Objet<RequiredMark /></label>
            <input
              id={subjectId}
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={150}
              placeholder="Nouveautés de septembre, ou toute autre communication"
              className="w-full border border-gray-500 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor={contentId} className="block text-xs font-medium text-gray-600 mb-1">
              Contenu (Markdown : titres avec #, **gras**, *italique*, ~~barré~~, listes avec « - » ou « 1. », citations avec «{" > "}», `code`, tableaux, liens [texte](url))
            </label>
            <textarea
              id={contentId}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              maxLength={10000}
              className="w-full border border-gray-500 rounded-lg px-3 py-1.5 text-sm font-mono"
            />
          </div>
          <p role="alert" className={error ? "text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2" : "sr-only"}>{error ?? ""}</p>
          <div>
            <label htmlFor={testEmailId} className="block text-xs font-medium text-gray-600 mb-1">
              Adresse du test (optionnel — sinon envoyé à vous-même)
            </label>
            <input
              id={testEmailId}
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="prenom@example.com"
              maxLength={255}
              className="w-full border border-gray-500 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={sendTest}
              aria-disabled={!canSend || sendingTest || sending || undefined}
              className="text-sm text-gray-700 border border-gray-300 px-4 py-2 rounded-full hover:bg-gray-50 aria-disabled:opacity-60 transition-colors"
            >
              {sendingTest ? "Envoi…" : "Envoyer un test"}
            </button>
            <button
              type="button"
              onClick={sendBroadcast}
              aria-disabled={!canSend || sending || sendingTest || undefined}
              className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 aria-disabled:cursor-not-allowed transition-colors"
            >
              {sending ? "Envoi…" : `Envoyer (${recipientCount})`}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Aperçu</h2>
          {content.trim() ? (
            <div
              className="prose prose-sm max-w-none text-gray-800"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
            />
          ) : (
            <p className="text-sm text-gray-500">L&apos;aperçu du contenu s&apos;affiche ici.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Historique des envois</h2>
        {sends.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun envoi pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-1.5" role="list">
            {sends.map((s) => (
              <li key={s.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 truncate">{s.subject}</p>
                  <p className="text-xs text-gray-500">{fmtDateTime(s.createdAt)}</p>
                </div>
                <span className="text-xs text-gray-500 flex-shrink-0 whitespace-nowrap">
                  {s.successCount}/{s.recipientCount} envoyé{s.recipientCount > 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
