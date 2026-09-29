"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import ModalShell from "../ModalShell"

export default function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [onDuplicate, setOnDuplicate] = useState<"skip" | "update">("skip")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{
    created: number
    updated: number
    skipped: number
    errors: { line: number; reason: string }[]
    detectedColumns: Record<string, string | null>
    totalParsed: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setSubmitting(true)
    setError(null)
    const fd = new FormData()
    fd.append("file", file)
    fd.append("onDuplicate", onDuplicate)
    const res = await fetch("/api/admin/members/import", { method: "POST", body: fd })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Erreur lors de l'import")
      return
    }
    const data = await res.json()
    setResult(data)
  }

  return (
    <ModalShell title="Importer des membres" onClose={onClose}>
      {!result ? (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Fichier CSV ou Excel</label>
            <input
              type="file"
              accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
              className="text-sm w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              Colonnes attendues : prénom, nom, email, téléphone, tags. Les variantes courantes sont reconnues.
            </p>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Si un email existe déjà</label>
            <div className="flex gap-3">
              <label className="text-sm text-gray-700 flex items-center gap-1.5">
                <input type="radio" checked={onDuplicate === "skip"} onChange={() => setOnDuplicate("skip")} />
                Ignorer
              </label>
              <label className="text-sm text-gray-700 flex items-center gap-1.5">
                <input type="radio" checked={onDuplicate === "update"} onChange={() => setOnDuplicate("update")} />
                Mettre à jour
              </label>
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900">
              Annuler
            </button>
            <button
              type="submit"
              disabled={!file || submitting}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Import en cours…" : "Importer"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
            <strong>{result.created}</strong> créés, <strong>{result.updated}</strong> mis à jour, <strong>{result.skipped}</strong> ignorés ({result.totalParsed} lignes lues)
          </div>
          {result.errors.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-800">
              <p className="font-medium mb-2">{result.errors.length} ligne{result.errors.length > 1 ? "s" : ""} ignorée{result.errors.length > 1 ? "s" : ""} :</p>
              <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>{e.line > 0 ? `Ligne ${e.line} : ` : ""}{e.reason}</li>
                ))}
                {result.errors.length > 50 && <li>… et {result.errors.length - 50} autres</li>}
              </ul>
            </div>
          )}
          <div className="text-xs text-gray-500">
            Colonnes détectées :
            {Object.entries(result.detectedColumns).map(([k, v]) => (
              <span key={k} className="ml-2">{k} → {v ?? "—"}</span>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => { onImported(); onClose() }}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}
