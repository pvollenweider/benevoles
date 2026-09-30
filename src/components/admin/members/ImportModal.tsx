"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useState } from "react"
import FormStatus from "@/components/FormStatus"
import { useSubmit } from "@/lib/use-submit"
import ModalShell from "../ModalShell"

export default function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [onDuplicate, setOnDuplicate] = useState<"skip" | "update">("skip")
  const [result, setResult] = useState<{
    created: number
    updated: number
    skipped: number
    errors: { line: number; reason: string }[]
    detectedColumns: Record<string, string | null>
    totalParsed: number
  } | null>(null)
  const id = useId()
  const { submit: run, busy: submitting, error, fail } = useSubmit()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { fail("Choisissez un fichier CSV ou Excel.", "file", document.getElementById(`${id}-file`)); return }
    const fd = new FormData()
    fd.append("file", file)
    fd.append("onDuplicate", onDuplicate)
    const outcome = await run<typeof result>(() => fetch("/api/admin/members/import", { method: "POST", body: fd }), { fallback: "Erreur lors de l'import." })
    if (outcome.ok) setResult(outcome.data)
  }

  return (
    <ModalShell title="Importer des membres" onClose={() => { if (!submitting) onClose() }}>
      {!result ? (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor={`${id}-file`} className="block text-sm text-gray-700 mb-1">Fichier CSV ou Excel</label>
            <input
              id={`${id}-file`}
              type="file"
              accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              aria-describedby={`${id}-file-help${error ? ` ${id}-error` : ""}`}
              aria-invalid={error && !file ? true : undefined}
              className="text-sm w-full"
            />
            <p id={`${id}-file-help`} className="text-xs text-gray-600 mt-1">
              Colonnes attendues : prénom, nom, email, téléphone, tags. Les variantes courantes sont reconnues.
            </p>
          </div>
          <fieldset>
            <legend className="block text-sm text-gray-700 mb-1">Si un email existe déjà</legend>
            <div className="flex gap-3">
              <label className="text-sm text-gray-700 flex items-center gap-1.5">
                <input type="radio" name={`${id}-dup`} checked={onDuplicate === "skip"} onChange={() => setOnDuplicate("skip")} />
                Ignorer
              </label>
              <label className="text-sm text-gray-700 flex items-center gap-1.5">
                <input type="radio" name={`${id}-dup`} checked={onDuplicate === "update"} onChange={() => setOnDuplicate("update")} />
                Mettre à jour
              </label>
            </div>
          </fieldset>
          <FormStatus error={error} errorId={`${id}-error`} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { if (!submitting) onClose() }} aria-disabled={submitting || undefined} className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900">
              Annuler
            </button>
            <button
              type="submit"
              aria-disabled={submitting || undefined}
              className={`bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${submitting ? "opacity-80 cursor-wait" : ""}`}
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
