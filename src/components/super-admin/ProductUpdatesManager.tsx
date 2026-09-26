"use client"

import { useState, useId } from "react"
import { renderMarkdown } from "@/lib/markdown"

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
  recipientCount, initialSends,
}: {
  recipientCount: number
  initialSends: ProductUpdateSendRow[]
}) {
  const [sends, setSends] = useState(initialSends)
  const [subject, setSubject] = useState("")
  const [content, setContent] = useState("")
  const [sendingTest, setSendingTest] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")

  const subjectId = useId()
  const contentId = useId()

  const canSend = subject.trim().length > 0 && content.trim().length > 0

  async function sendTest() {
    if (!canSend) return
    setSendingTest(true)
    setError(null)
    const res = await fetch("/api/super-admin/product-updates/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, content }),
    })
    setSendingTest(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Échec de l'envoi du test.")
      return
    }
    setAnnouncement("Email de test envoyé à votre propre adresse.")
  }

  async function sendBroadcast() {
    if (!canSend) return
    if (!confirm(`Envoyer cette communication à ${recipientCount} administrateur${recipientCount > 1 ? "s" : ""} ? Cette action est irréversible.`)) return
    setSending(true)
    setError(null)
    const res = await fetch("/api/super-admin/product-updates/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, content }),
    })
    setSending(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Échec de l'envoi.")
      return
    }
    const send = await res.json()
    setSends((prev) => [send, ...prev])
    setAnnouncement(`Communication envoyée à ${send.successCount}/${send.recipientCount} destinataire${send.recipientCount > 1 ? "s" : ""}.`)
    setSubject("")
    setContent("")
  }

  return (
    <div className="space-y-6">
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>

      <div>
        <h1 className="text-xl font-bold text-gray-900">Communications admin</h1>
        <p className="text-sm text-gray-500">
          {recipientCount} administrateur{recipientCount > 1 ? "s" : ""} abonné{recipientCount > 1 ? "s" : ""} à ces communications.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Nouveau message</h2>
          <div>
            <label htmlFor={subjectId} className="block text-xs font-medium text-gray-600 mb-1">Objet *</label>
            <input
              id={subjectId}
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={150}
              placeholder="Nouveautés de benevol.app — septembre, ou toute autre communication"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
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
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={sendTest}
              disabled={!canSend || sendingTest || sending}
              className="text-sm text-gray-600 border border-gray-200 px-4 py-2 rounded-full hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {sendingTest ? "Envoi…" : "Envoyer un test"}
            </button>
            <button
              type="button"
              onClick={sendBroadcast}
              disabled={!canSend || sending || sendingTest}
              className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
