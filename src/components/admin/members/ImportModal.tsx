"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import FormStatus from "@/components/FormStatus"
import { useSubmit } from "@/lib/use-submit"
import { planSummary, type ImportPlan } from "@/lib/member-import-plan"
import ModalShell from "../ModalShell"

type Analysis = {
  plan: ImportPlan
  fileHash: string
  planHash: string
  detectedColumns: Record<string, string | null>
  totalParsed: number
}

type Result = {
  created: number
  updated: number
  skipped: number
  errors: { line: number; reason: string }[]
  totalParsed: number
}

const ACTION_LABEL = { create: "Créer", update: "Mettre à jour", skip: "Ignorer (déjà présent)" } as const
const COLUMN_LABEL: Record<string, string> = { firstName: "Prénom", lastName: "Nom", email: "Email", phone: "Téléphone", tags: "Tags" }

/**
 * Member import in two steps (#464): the file is analysed without writing anything, the admin reads
 * what will happen, then confirms. The confirm sends the same file back with the preview's hashes.
 */
export default function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [onDuplicate, setOnDuplicate] = useState<"skip" | "update">("skip")
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const id = useId()
  const [notice, setNotice] = useState<string | null>(null)
  const summaryRef = useRef<HTMLParagraphElement>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const backToForm = useRef(false)
  const { submit: run, busy, error, status, setStatus, fail, reset } = useSubmit()

  // Each step starts on its summary sentence, so it is read first; « Retour » goes back to the file.
  useEffect(() => {
    if (analysis) summaryRef.current?.focus()
    else if (backToForm.current) { backToForm.current = false; fileRef.current?.focus() }
  }, [analysis])
  useEffect(() => { if (result) resultRef.current?.focus() }, [result])

  function formData(extra: Record<string, string> = {}) {
    const fd = new FormData()
    fd.append("file", file!)
    fd.append("onDuplicate", onDuplicate)
    for (const [k, v] of Object.entries(extra)) fd.append(k, v)
    return fd
  }

  async function analyse(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { fail("Choisissez un fichier CSV ou Excel.", "file", document.getElementById(`${id}-file`)); return }
    const outcome = await run<Analysis>(() => {
      setStatus("Analyse en cours…")
      return fetch("/api/admin/members/import/preview", { method: "POST", body: formData() })
    }, { fallback: "Impossible d'analyser le fichier." })
    setStatus("")
    if (outcome.ok) { setNotice(null); setAnalysis(outcome.data) }
  }

  async function confirm() {
    if (!analysis) return
    let refreshed: Analysis | null = null
    setNotice(null)
    const outcome = await run<Result>(async () => {
      setStatus("Import en cours…")
      const res = await fetch("/api/admin/members/import", { method: "POST", body: formData({ fileHash: analysis.fileHash, planHash: analysis.planHash }) })
      // Members changed since the analysis: the server sends the up-to-date preview to check again.
      if (res.status === 409) refreshed = ((await res.clone().json().catch(() => ({}))) as { preview?: Analysis }).preview ?? null
      return res
    }, { fallback: "Erreur lors de l'import." })
    setStatus("")
    if (outcome.ok) setResult(outcome.data)
    // One announcement: the reason is read with the refreshed summary, not in a separate alert.
    else if (refreshed) { reset(); setNotice(outcome.error); setAnalysis(refreshed) }
  }

  function back() {
    if (busy) return
    reset()
    setNotice(null)
    backToForm.current = true
    setAnalysis(null)
  }

  // The member list is refreshed however the dialog is closed once something was imported.
  const close = () => { if (busy) return; if (result) onImported(); onClose() }
  const busyCls = busy ? "opacity-60 cursor-not-allowed" : ""
  const toWrite = analysis ? analysis.plan.counts.create + analysis.plan.counts.update : 0

  return (
    <ModalShell title="Importer des membres" onClose={close} closeOnBackdrop={!analysis} panelClassName={analysis && !result ? "max-w-3xl" : "max-w-lg"}>
      {result ? (
        <div className="space-y-4">
          <p ref={resultRef} tabIndex={-1} className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600">
            Import terminé : <strong>{result.created}</strong> créés, <strong>{result.updated}</strong> mis à jour, <strong>{result.skipped}</strong> ignorés ({result.totalParsed} lignes lues).
          </p>
          {result.errors.length > 0 && <ErrorsTable errors={result.errors} caption={`${result.errors.length} ligne${result.errors.length > 1 ? "s" : ""} non importée${result.errors.length > 1 ? "s" : ""}`} />}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={close}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Fermer
            </button>
          </div>
        </div>
      ) : analysis ? (
        <div className="space-y-4">
          <p ref={summaryRef} tabIndex={-1} className="text-sm text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded">
            {notice && <span className="block font-medium text-red-700 mb-1">{notice}</span>}
            <strong>Analyse du fichier, rien n&apos;est encore enregistré.</strong> {planSummary(analysis.plan.counts)}
          </p>
          <dl className="text-sm text-gray-700 space-y-1">
            {analysis.plan.newTags.length > 0 && (
              <div><dt className="inline font-medium">Tags ajoutés : </dt><dd className="inline">{analysis.plan.newTags.join(", ")}</dd></div>
            )}
            {analysis.plan.reusedTags.length > 0 && (
              <div><dt className="inline font-medium">Tags existants réutilisés : </dt><dd className="inline">{analysis.plan.reusedTags.join(", ")}</dd></div>
            )}
            <div>
              <dt className="inline font-medium">Colonnes reconnues : </dt>
              <dd className="inline">
                {Object.entries(analysis.detectedColumns).map(([k, v]) => `${COLUMN_LABEL[k] ?? k} : ${v ? `colonne « ${v} »` : "absente"}`).join(", ")}
              </dd>
            </div>
          </dl>
          {analysis.plan.errors.length > 0 && <ErrorsTable errors={analysis.plan.errors} caption={`Lignes en erreur, non importées (${analysis.plan.errors.length})`} />}
          {analysis.plan.lines.length > 0 && (
            <div role="region" aria-labelledby={`${id}-lines-caption`} tabIndex={0} className="max-h-64 overflow-auto rounded-xl border border-gray-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-600">
              <table className="w-full text-sm">
                <caption id={`${id}-lines-caption`} className="text-left font-medium text-gray-900 px-3 py-2">Membres du fichier ({analysis.plan.lines.length})</caption>
                <thead className="bg-gray-50 text-gray-700 sticky top-0">
                  <tr>
                    <th scope="col" className="text-left font-medium px-3 py-1.5">Ligne</th>
                    <th scope="col" className="text-left font-medium px-3 py-1.5">Nom</th>
                    <th scope="col" className="text-left font-medium px-3 py-1.5">Email</th>
                    <th scope="col" className="text-left font-medium px-3 py-1.5">Tags</th>
                    <th scope="col" className="text-left font-medium px-3 py-1.5">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.plan.lines.map((l) => (
                    <tr key={l.line} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 tabular-nums text-gray-700">{l.line}</td>
                      <th scope="row" className="px-3 py-1.5 text-left font-normal text-gray-900">{`${l.firstName} ${l.lastName}`.trim() || l.email || `Ligne ${l.line}`}</th>
                      <td className="px-3 py-1.5 text-gray-700 break-all">{l.email ?? <None />}</td>
                      <td className="px-3 py-1.5 text-gray-700">{l.tags.length > 0 ? l.tags.join(", ") : <None />}</td>
                      <td className="px-3 py-1.5 text-gray-900">{ACTION_LABEL[l.action]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <FormStatus status={status} error={error} errorId={`${id}-error`} />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={back} aria-disabled={busy || undefined} className={`text-sm px-4 py-2 text-gray-700 hover:text-gray-900 ${busyCls}`}>
              Retour
            </button>
            {toWrite > 0 ? (
              <button
                type="button"
                onClick={confirm}
                aria-disabled={busy || undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className={`bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${busy ? "opacity-80 cursor-wait" : ""}`}
              >
                {busy ? "Import en cours…" : `Importer ${toWrite} membre${toWrite > 1 ? "s" : ""}`}
              </button>
            ) : (
              <p className="text-sm text-gray-700 self-center">Rien à importer dans ce fichier.</p>
            )}
          </div>
        </div>
      ) : null}
      {/* Stays mounted under the preview, so « Retour » finds the chosen file and options again. */}
      {!result && (
        <form onSubmit={analyse} hidden={!!analysis} className="space-y-4">
          <div>
            <label htmlFor={`${id}-file`} className="block text-sm text-gray-700 mb-1">Fichier CSV ou Excel</label>
            <input
              ref={fileRef}
              id={`${id}-file`}
              type="file"
              accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              aria-describedby={`${id}-file-help${error ? ` ${id}-error` : ""}`}
              aria-invalid={error && !file ? true : undefined}
              className="text-sm w-full"
            />
            <p id={`${id}-file-help`} className="text-xs text-gray-600 mt-1">
              Colonnes attendues : prénom, nom, email, téléphone, tags. Les variantes courantes sont reconnues. 2 Mo et 5000 lignes au plus. Vous verrez ce qui sera créé ou mis à jour avant de confirmer.
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
          {!analysis && <FormStatus status={status} error={error} errorId={`${id}-error`} />}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} aria-disabled={busy || undefined} className={`text-sm px-4 py-2 text-gray-600 hover:text-gray-900 ${busyCls}`}>
              Annuler
            </button>
            <button
              type="submit"
              aria-disabled={busy || undefined}
              className={`bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${busy ? "opacity-80 cursor-wait" : ""}`}
            >
              {busy ? "Analyse en cours…" : "Analyser le fichier"}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  )
}

function ErrorsTable({ errors, caption }: { errors: { line: number; reason: string }[]; caption: string }) {
  const id = useId()
  return (
    <div role="region" aria-labelledby={`${id}-caption`} tabIndex={0} className="max-h-48 overflow-auto rounded-xl border border-orange-200 bg-orange-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-orange-600">
      <table className="w-full text-sm text-orange-950">
        <caption id={`${id}-caption`} className="text-left font-medium px-3 py-2">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="text-left font-medium px-3 py-1">Ligne</th>
            <th scope="col" className="text-left font-medium px-3 py-1">Raison</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((e, i) => (
            <tr key={`${e.line}-${i}`} className="border-t border-orange-200">
              <th scope="row" className="px-3 py-1 text-left font-normal tabular-nums">{e.line > 0 ? e.line : <None />}</th>
              <td className="px-3 py-1">{e.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** An empty cell, read as « aucun » rather than silence. */
function None() {
  return <><span aria-hidden="true">—</span><span className="sr-only">aucun</span></>
}
