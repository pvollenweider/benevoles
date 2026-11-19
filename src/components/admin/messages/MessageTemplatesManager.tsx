"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState } from "react"
import FormStatus from "@/components/FormStatus"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import ModalShell from "@/components/admin/ModalShell"
import { useSubmit } from "@/lib/use-submit"
import { TEMPLATE_LIMIT, TEMPLATE_NAME_MAX, unknownVariables, VARIABLES } from "@/lib/message-template"
import { OTHER_CATEGORY, TEMPLATE_CATEGORIES } from "@/lib/message-template-category"
import { LIBRARY_AUDIENCE_LABELS, libraryByCategory, type LibraryTemplate } from "@/lib/message-template-library"
import { renderLibraryPreview, splitPlaceholders } from "@/lib/message-template-preview"
import { MESSAGE_BODY_MAX, MESSAGE_SUBJECT_MAX } from "@/lib/targeted-message"
import RequiredMark from "@/components/RequiredMark"

type Template = { id: string; name: string; category: string; subject: string; body: string }
type Field = "name" | "category" | "subject" | "body"
const EMPTY = { name: "", category: OTHER_CATEGORY, subject: "", body: "" }

/** The subject or a body with each `[à compléter : …]` marked, text included (never colour alone). */
function PlaceholderText({ text }: { text: string }) {
  return (
    <>
      {splitPlaceholders(text).map((part, index) => part.placeholder
        ? <mark key={index} className="bg-amber-200 text-gray-900 font-medium px-0.5 rounded-sm">{part.text}</mark>
        : <span key={index}>{part.text}</span>)}
    </>
  )
}

/**
 * List, create, edit and delete the organisation's message templates (#482), and add one from the
 * ready-made library (#1414). The library is opt-in: nothing is copied until « Ajouter à mes
 * modèles »; each entry shows the email as the volunteer receives it, with sample values.
 */
export default function MessageTemplatesManager({ initialTemplates, organizationName, previewBaseUrl }: { initialTemplates: Template[]; organizationName: string; previewBaseUrl?: string }) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [editing, setEditing] = useState<string | "new" | null>(null)
  const [editingName, setEditingName] = useState("")
  const [form, setForm] = useState(EMPTY)
  const [saved, setSaved] = useState(EMPTY)
  const [pendingDelete, setPendingDelete] = useState<Template | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const id = useId()
  const list = useSubmit()
  const editor = useSubmit()
  const library = useSubmit()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const newButtonRef = useRef<HTMLButtonElement>(null)
  const libraryButtonRef = useRef<HTMLButtonElement>(null)
  // What opened the form or the delete dialog: focus returns there.
  const triggerRef = useRef<HTMLElement | null>(null)

  const dirty = form.name !== saved.name || form.category !== saved.category || form.subject !== saved.subject || form.body !== saved.body
  const subjectUnknown = unknownVariables(form.subject)
  const bodyUnknown = unknownVariables(form.body)

  function open(t: Template | null, trigger: HTMLElement) {
    triggerRef.current = trigger
    editor.reset()
    list.reset()
    const values = t ? { name: t.name, category: t.category, subject: t.subject, body: t.body } : EMPTY
    setEditing(t ? t.id : "new")
    setEditingName(t?.name ?? "")
    setForm(values)
    setSaved(values)
    requestAnimationFrame(() => document.getElementById(`${id}-name`)?.focus())
  }

  function close() {
    setEditing(null)
    requestAnimationFrame(() => (triggerRef.current?.isConnected ? triggerRef.current : newButtonRef.current)?.focus())
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (editor.busy || !editing) return
    const missing: [Field, string] | null = !form.name.trim() ? ["name", "Le nom du modèle est obligatoire."]
      : !form.subject.trim() ? ["subject", "L'objet est obligatoire."]
      : !form.body.trim() ? ["body", "Le message est obligatoire."]
      : subjectUnknown.length > 0 ? ["subject", subjectUnknown[0]]
      : bodyUnknown.length > 0 ? ["body", bodyUnknown[0]]
      : null
    if (missing) { editor.fail(missing[1], missing[0], document.getElementById(`${id}-${missing[0]}`)); return }
    const isNew = editing === "new"
    const outcome = await editor.submit<Template>(() => fetch(isNew ? "/api/admin/settings/message-templates" : `/api/admin/settings/message-templates/${editing}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }), { fallback: "Impossible d'enregistrer le modèle." })
    if (!outcome.ok) return
    setTemplates((prev) => (isNew ? [...prev, outcome.data] : prev.map((t) => (t.id === outcome.data.id ? outcome.data : t))).sort((a, b) => a.name.localeCompare(b.name, "fr")))
    list.setStatus(isNew ? `Modèle « ${outcome.data.name} » créé.` : `Modèle « ${outcome.data.name} » enregistré.`)
    close()
  }

  async function remove(t: Template) {
    const outcome = await list.submit(() => fetch(`/api/admin/settings/message-templates/${t.id}`, { method: "DELETE" }), { fallback: "Impossible de supprimer le modèle.", silent: true })
    if (!outcome.ok) return
    setPendingDelete(null)
    if (editing === t.id) setEditing(null)
    setTemplates((prev) => prev.filter((x) => x.id !== t.id))
    list.setStatus(`Modèle « ${t.name} » supprimé.`)
    headingRef.current?.focus()
  }

  function openLibrary() {
    list.reset()
    library.reset()
    setPreviewId(null)
    setAdding(null)
    setLibraryOpen(true)
  }

  function closeLibrary() {
    setLibraryOpen(false)
    setPreviewId(null)
    setAdding(null)
    // ModalShell returns focus to « Ajouter des modèles » (or the fallback when it is gone).
    requestAnimationFrame(() => (libraryButtonRef.current?.isConnected ? libraryButtonRef.current : newButtonRef.current)?.focus())
  }

  async function addFromLibrary(entry: LibraryTemplate) {
    if (full || library.busy) return
    setAdding(entry.id)
    const outcome = await library.submit<Template>(() => fetch("/api/admin/settings/message-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: entry.name, category: entry.category, subject: entry.subject, body: entry.body }),
    }), { fallback: "Impossible d'ajouter le modèle." })
    setAdding(null)
    if (!outcome.ok) return
    setTemplates((prev) => [...prev, outcome.data].sort((a, b) => a.name.localeCompare(b.name, "fr")))
    // No status message: the focused « Déjà dans mes modèles : « … » » notice confirms the add, and a
    // second announcement would talk over it. The « Ajouter » button is replaced by the added notice: focus must not fall back to <body>.
    requestAnimationFrame(() => document.getElementById(`${id}-library-added-${entry.id}`)?.focus())
  }

  const full = templates.length >= TEMPLATE_LIMIT
  // Matching by name: library names are unique and copied exactly; a template written or renamed by
  // the organiser is their own. The state is positive only: worst case, they add a second copy.
  const alreadyAdded = (entry: LibraryTemplate) => templates.some((t) => t.name === entry.name)
  const invalid = (f: Field) => editor.isInvalid(f)
  const describedBy = (f: Field, extra: string) => [extra, editor.invalidField === f ? `${id}-editor-error` : null].filter(Boolean).join(" ")

  return (
    <div className="space-y-4">
      <FormStatus status={list.status} error={pendingDelete ? null : list.error} errorId={`${id}-error`} />
      <section aria-labelledby={`${id}-list`} className="bg-white rounded-2xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${id}-list`} ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-gray-800 focus:outline-none">
            Modèles ({templates.length}/{TEMPLATE_LIMIT})
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <button
              ref={libraryButtonRef}
              type="button"
              onClick={openLibrary}
              className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded px-1 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Ajouter des modèles
            </button>
            <button
              ref={newButtonRef}
              type="button"
              onClick={(e) => { if (!full) open(null, e.currentTarget) }}
              aria-disabled={full || undefined}
              aria-describedby={full ? `${id}-full` : undefined}
              className={`text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded px-1 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${full ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              Nouveau modèle
            </button>
          </div>
        </div>
        {full && <p id={`${id}-full`} className="px-4 py-2 text-xs text-gray-700">{TEMPLATE_LIMIT} modèles au plus : supprimez-en un pour en créer un autre.</p>}
        {templates.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-700">Aucun modèle pour l&apos;instant. « Ajouter des modèles » ouvre la bibliothèque de textes prêts à l&apos;emploi.</p>
        ) : (
          <ul role="list" className="divide-y divide-gray-100">
            {templates.map((t) => (
              <li key={t.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-600"><span className="sr-only">Catégorie : </span>{t.category || OTHER_CATEGORY}</p>
                  <p className="text-xs text-gray-700 truncate">Objet : {t.subject}</p>
                </div>
                <div className="flex gap-3 flex-shrink-0">
                  <button type="button" onClick={(e) => open(t, e.currentTarget)} className="text-xs font-medium text-blue-700 hover:text-blue-900 rounded px-1 py-1 min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                    Modifier{" "}<span className="sr-only">le modèle « {t.name} »</span>
                  </button>
                  <button type="button" onClick={(e) => { triggerRef.current = e.currentTarget; list.reset(); setPendingDelete(t) }} className="text-xs font-medium text-red-700 hover:text-red-900 rounded px-1 py-1 min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
                    Supprimer{" "}<span className="sr-only">le modèle « {t.name} »</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingDelete && (
        <ConfirmActionModal
          recap={{
            title: `Supprimer le modèle « ${pendingDelete.name} » ?`,
            lines: ["Le modèle disparaît de « Partir d'un modèle ». Les messages déjà envoyés ne changent pas.", "Cette suppression ne peut pas être annulée."],
            confirmLabel: "Supprimer",
            danger: true,
          }}
          busy={list.busy}
          error={list.error}
          onConfirm={() => void remove(pendingDelete)}
          onCancel={() => { setPendingDelete(null); list.reset(); requestAnimationFrame(() => triggerRef.current?.focus()) }}
        />
      )}

      {editing && (
        <form
          onSubmit={save}
          noValidate
          aria-labelledby={`${id}-form-title`}
          // Escape closes only when nothing would be lost.
          onKeyDown={(e) => { if (e.key === "Escape" && !dirty) { e.stopPropagation(); close() } }}
          className="bg-white rounded-2xl border border-blue-200 p-4 space-y-4"
        >
          <h2 id={`${id}-form-title`} className="text-sm font-semibold text-gray-800">{editing === "new" ? "Nouveau modèle" : `Modifier le modèle « ${editingName} »`}</h2>
          <p aria-hidden="true" className="text-xs text-gray-600">Les champs marqués d&apos;un astérisque (*) sont obligatoires.</p>
          <div>
            <label htmlFor={`${id}-name`} className="block text-sm font-medium text-gray-800 mb-1">Nom du modèle<RequiredMark /></label>
            <input id={`${id}-name`} type="text" required value={form.name} maxLength={TEMPLATE_NAME_MAX} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} aria-invalid={invalid("name")} aria-describedby={describedBy("name", `${id}-name-hint`)} className="input" />
            <p id={`${id}-name-hint`} className="text-xs text-gray-600 mt-1">Pour vous seulement, les bénévoles ne le voient pas.</p>
          </div>
          <div>
            <label htmlFor={`${id}-category`} className="block text-sm font-medium text-gray-800 mb-1">Catégorie</label>
            <select id={`${id}-category`} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} aria-describedby={`${id}-category-hint`} className="input">
              {TEMPLATE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <p id={`${id}-category-hint`} className="text-xs text-gray-600 mt-1">Pour regrouper vos modèles dans « Partir d&apos;un modèle ».</p>
          </div>
          <div>
            <label htmlFor={`${id}-subject`} className="block text-sm font-medium text-gray-800 mb-1">Objet<RequiredMark /></label>
            <input id={`${id}-subject`} type="text" required value={form.subject} maxLength={MESSAGE_SUBJECT_MAX} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} aria-invalid={invalid("subject") || (subjectUnknown.length > 0 ? true : undefined)} aria-describedby={describedBy("subject", `${id}-vars${subjectUnknown.length > 0 ? ` ${id}-subject-unknown` : ""}`)} className="input" />
            {subjectUnknown.length > 0 && <p id={`${id}-subject-unknown`} className="text-xs text-red-700 mt-1">{subjectUnknown.join(" ")}</p>}
          </div>
          <div>
            <label htmlFor={`${id}-body`} className="block text-sm font-medium text-gray-800 mb-1">Message<RequiredMark /></label>
            <textarea id={`${id}-body`} rows={7} required value={form.body} maxLength={MESSAGE_BODY_MAX} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} aria-invalid={invalid("body") || (bodyUnknown.length > 0 ? true : undefined)} aria-describedby={describedBy("body", `${id}-vars${bodyUnknown.length > 0 ? ` ${id}-body-unknown` : ""}`)} className="input" />
            {bodyUnknown.length > 0 && <p id={`${id}-body-unknown`} className="text-xs text-red-700 mt-1">{bodyUnknown.join(" ")}</p>}
          </div>
          <div id={`${id}-vars`} className="text-xs text-gray-700">
            <p className="font-medium">Variables : écrivez le nom entre accolades, par exemple <code>{"{prénom}"}</code>. Elles sont remplacées pour chaque destinataire.</p>
            <ul role="list" className="mt-1 space-y-0.5">
              {Object.entries(VARIABLES).map(([k, v]) => <li key={k}><code>{`{${k}}`}</code> : {v}</li>)}
            </ul>
            <p className="mt-1">Pour écrire une accolade telle quelle, tapez-la deux fois : <code>{"{{"}</code> donne une accolade ouvrante, <code>{"}}"}</code> une accolade fermante.</p>
            <p className="mt-1">Une mention <code>[à compléter : …]</code> doit être remplacée dans « Écrire aux bénévoles » : tant qu&apos;elle est là, l&apos;envoi est refusé.</p>
          </div>
          <FormStatus error={editor.error} errorId={`${id}-editor-error`} quiet={editor.quiet} alertShown={editor.alertShown} />
          <div className="flex gap-3">
            <button type="submit" aria-disabled={editor.busy || undefined} className={`bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${editor.busy ? "opacity-60 cursor-wait" : ""}`}>
              {editor.busy ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button type="button" onClick={close} className="text-sm text-gray-700 px-3 py-2 rounded hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Annuler</button>
          </div>
        </form>
      )}

      {libraryOpen && (
        <ModalShell title="Ajouter des modèles" onClose={closeLibrary} panelClassName="max-w-3xl" closeOnBackdrop={false} describedBy={`${id}-library-intro`} busy={library.busy}>
          <div className="space-y-4">
            <p id={`${id}-library-intro`} className="text-sm text-gray-700">
              Des messages prêts à l&apos;emploi, classés par thème. Choisissez-en un, prévisualisez-le, puis ajoutez-le à vos modèles : vous pourrez le modifier comme les autres. Rien n&apos;est ajouté tant que vous ne cliquez pas.
            </p>
            <p className="text-xs text-gray-700">
              Les mentions <mark className="bg-amber-200 text-gray-900 font-medium px-0.5 rounded-sm">[à compléter : …]</mark> sont à remplacer par vos informations avant l&apos;envoi. L&apos;aperçu utilise des valeurs d&apos;exemple : le prénom, l&apos;événement, le poste et le créneau.
            </p>
            <FormStatus status={library.status} error={library.error} errorId={`${id}-library-error`} />
            {full && <p id={`${id}-library-full`} className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">{TEMPLATE_LIMIT} modèles au plus : supprimez-en un pour en ajouter un autre.</p>}
            <div className="space-y-6">
              {libraryByCategory().map((group) => (
                <div key={group.category}>
                  <h3 className="text-sm font-semibold text-gray-900">{group.category}</h3>
                  <ul role="list" className="mt-2 space-y-2">
                    {group.templates.map((entry) => {
                      const added = alreadyAdded(entry)
                      const previewOpen = previewId === entry.id
                      const preview = previewOpen ? renderLibraryPreview(entry, organizationName, previewBaseUrl) : null
                      return (
                        <li key={entry.id} className="border border-gray-200 rounded-xl p-3 bg-gray-50">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h4 className="text-sm font-medium text-gray-900">{entry.name}</h4>
                              <p className="text-xs text-gray-600">{LIBRARY_AUDIENCE_LABELS[entry.audience]}</p>
                              <p className="text-xs text-gray-700 mt-1">Objet : <PlaceholderText text={entry.subject} /></p>
                            </div>
                            {added ? (
                              <p
                                id={`${id}-library-added-${entry.id}`}
                                tabIndex={-1}
                                className="text-xs font-medium text-gray-700 rounded px-1 py-1 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                              >
                                Déjà dans mes modèles<span className="sr-only"> : « {entry.name} »</span>
                              </p>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void addFromLibrary(entry)}
                                aria-disabled={full || library.busy || undefined}
                                aria-describedby={full ? `${id}-library-full` : undefined}
                                className={`text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded px-1 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${full || library.busy ? "opacity-60 cursor-not-allowed" : ""}`}
                              >
                                {adding === entry.id ? "Ajout…" : "Ajouter à mes modèles"}<span className="sr-only"> « {entry.name} »</span>
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            aria-expanded={previewOpen}
                            aria-controls={`${id}-library-preview-${entry.id}`}
                            onClick={() => setPreviewId(previewOpen ? null : entry.id)}
                            className="mt-2 min-h-6 inline-flex items-center text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded px-1 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                          >
                            Aperçu<span className="sr-only"> de « {entry.name} »</span>
                          </button>
                          <div id={`${id}-library-preview-${entry.id}`} hidden={!previewOpen} className="mt-2 space-y-2">
                            {preview && (
                              <>
                                <p className="text-sm"><span className="font-medium">Objet :</span> <PlaceholderText text={preview.subject} /></p>
                                <iframe title={`Aperçu de l'email « ${entry.name} »`} sandbox="" srcDoc={preview.html} className="w-full h-80 border border-gray-200 rounded-lg bg-white" />
                              </>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
