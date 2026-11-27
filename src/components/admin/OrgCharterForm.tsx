"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState, type Ref } from "react"
import {
  buildVolunteerCharter,
  charterTextAfterToggle,
  isCustomizedCharter,
  isVolunteerConventionAsked,
  planInsuranceParagraphUpdate,
} from "@/lib/volunteer-charter"
import { focusFirstAvailableNextFrame } from "@/lib/focus-return"
import DocMoreLink from "@/components/DocMoreLink"
import { SECTION_DOC_LINKS, docHref } from "@/lib/help-links"
import { MARKDOWN_TEXT_MAX } from "@/lib/text-limits"

/**
 * The knob of a settings row (DESIGN.md §5): the label sits on the left and stays the accessible
 * name, so both switches of the card share this track and draw it the same way. Forced colours paint
 * both backgrounds in Canvas: system colours keep the knob and the « on » track apart there
 * (WCAG 1.4.11). Off, a gray-500 border and a gray-600 knob on a white track (4.6:1 and 7.6:1 on
 * the gray-50 row), like Switch.tsx (#1123).
 */
function SwitchKnob({ checked, onToggle, labelledBy, describedBy, buttonRef }: {
  checked: boolean
  onToggle: () => void
  labelledBy: string
  describedBy?: string
  buttonRef?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={onToggle}
      className={`group relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 forced-colors:border-[CanvasText] forced-colors:aria-checked:bg-[Highlight] ${
        checked ? "border-transparent bg-blue-600" : "border-gray-500 bg-white"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full shadow transition duration-200 forced-colors:bg-[CanvasText] forced-colors:group-aria-checked:bg-[HighlightText] ${
          checked ? "translate-x-5 bg-white" : "translate-x-0 bg-gray-600"
        }`}
      />
    </button>
  )
}

export default function OrgCharterForm({
  initialCharter,
  initialHasOrgInsurance,
  initialVolunteerConventionEnabled,
}: {
  initialCharter: string | null
  initialHasOrgInsurance: boolean
  /** Missing means on, like the column's default (#1468). */
  initialVolunteerConventionEnabled?: boolean
}) {
  const conventionLabelId = useId()
  const conventionDescriptionId = useId()
  const insuranceLabelId = useId()
  const insuranceDescriptionId = useId()
  const conventionWarningId = useId()
  const customNoteId = useId()
  const previewId = useId()
  const previewIntroId = useId()
  // The text field is named by the section heading (found unlabelled by the axe scan added with #300).
  const titleId = useId()
  const [conventionEnabled, setConventionEnabled] = useState(() => isVolunteerConventionAsked(initialVolunteerConventionEnabled))
  const [hasOrgInsurance, setHasOrgInsurance] = useState(initialHasOrgInsurance)
  const [text, setText] = useState(initialCharter ?? buildVolunteerCharter({ hasOrgInsurance }))
  const [toggled, setToggled] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ message: string; saved: boolean }>({ message: "", saved: false })
  const [error, setError] = useState<string | null>(null)
  const switchRef = useRef<HTMLButtonElement>(null)
  const updateButtonRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  // A customised text is never replaced by the switch: the form offers to update just its
  // insurance paragraph instead, once the choice changed or when it holds the other version's.
  const plan = planInsuranceParagraphUpdate(text, hasOrgInsurance)
  const customized = isCustomizedCharter(text)
  const showCustomNote = customized && (plan.kind === "replace" || (toggled && plan.kind === "append"))
  const previewShown = previewOpen && showCustomNote

  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (announceTimer.current) clearTimeout(announceTimer.current) }, [])

  function clearStatus() {
    if (announceTimer.current) clearTimeout(announceTimer.current)
    announceTimer.current = null
    setStatus({ message: "", saved: false })
  }

  // The same message twice in a row would not be announced again: clear it, then set it on the next tick.
  function announce(message: string, saved = false) {
    clearStatus()
    announceTimer.current = setTimeout(() => setStatus({ message, saved }), 50)
  }

  function openPreview() {
    setPreviewOpen(true)
    // Focus moves only on this click, never while the text is being typed.
    requestAnimationFrame(() => previewRef.current?.focus())
  }

  function handleConventionToggle() {
    const next = !conventionEnabled
    setConventionEnabled(next)
    // An open preview goes with the controls it belongs to, and is not kept for later.
    setPreviewOpen(false)
    setError(null)
    announce(next ? "Convention réactivée. Enregistrez pour l'appliquer." : "Convention désactivée. Enregistrez pour l'appliquer.")
  }

  function handleToggle(value: boolean) {
    const next = charterTextAfterToggle(text, value)
    setHasOrgInsurance(value)
    setText(next.text)
    setToggled(true)
    setPreviewOpen(false)
    setError(null)
    announce(next.kept ? "Votre texte personnalisé n'a pas été modifié." : "Texte de la convention adapté à ce choix.")
  }

  function closePreview() {
    setPreviewOpen(false)
    focusFirstAvailableNextFrame([() => updateButtonRef.current, () => switchRef.current])
  }

  function applyPlan() {
    if (plan.kind === "unchanged") return
    setText(plan.text)
    setPreviewOpen(false)
    setError(null)
    // The update button goes away with the note: the switch is the nearest stable control.
    focusFirstAvailableNextFrame([() => switchRef.current, () => textareaRef.current])
    announce("Paragraphe sur l'assurance mis à jour. Enregistrez pour l'appliquer.")
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    clearStatus()
    setError(null)
    const res = await fetch("/api/admin/settings/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volunteerCharter: text, hasOrgInsurance, volunteerConventionEnabled: conventionEnabled }),
    })
    setSaving(false)
    if (res.ok) announce("Enregistré", true)
    else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? "Une erreur est survenue.")
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      <div>
        <h2 id={titleId} className="text-sm font-semibold text-gray-800">Convention des bénévoles</h2>
        <p className="text-sm"><DocMoreLink href={docHref(SECTION_DOC_LINKS.admin.charter)} about="la convention des bénévoles" /></p>
      </div>

      {/* First in the section, before everything it controls: its state says whether the rest
          exists. Same row as the insurance switch, so the two knobs line up and read as one pattern. */}
      <div className="bg-gray-50 rounded-xl px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p id={conventionLabelId} className="text-sm font-medium text-gray-800">Demander aux bénévoles d&apos;accepter une convention</p>
            <p id={conventionDescriptionId} className="text-xs text-gray-500 mt-0.5">
              {conventionEnabled
                ? "Les bénévoles lisent et acceptent ce texte en s'inscrivant."
                : "Aucune convention n'est demandée à l'inscription."}
            </p>
            {!conventionEnabled && (
              <p id={conventionWarningId} className="text-sm text-gray-800 mt-1">
                <span className="font-semibold">Attention :</span> les bénévoles s&apos;inscriront sans accepter de convention. La clause d&apos;assurance du texte par défaut ne leur sera plus présentée, et vous n&apos;aurez pas de trace d&apos;une acceptation.
              </p>
            )}
          </div>
          <SwitchKnob
            checked={conventionEnabled}
            onToggle={handleConventionToggle}
            labelledBy={conventionLabelId}
            describedBy={conventionEnabled ? conventionDescriptionId : `${conventionDescriptionId} ${conventionWarningId}`}
          />
        </div>
      </div>

      {conventionEnabled && (
        <>
          <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p id={insuranceLabelId} className="text-sm font-medium text-gray-800">Assurance RC fournie par l&apos;organisation</p>
                <p id={insuranceDescriptionId} className="text-xs text-gray-500 mt-0.5">
                  {hasOrgInsurance
                    ? "Votre assurance RC couvre les dommages causés à des tiers."
                    : "Chaque bénévole répond lui-même des dommages causés à des tiers."}
                </p>
              </div>
              <SwitchKnob
                checked={hasOrgInsurance}
                onToggle={() => handleToggle(!hasOrgInsurance)}
                labelledBy={insuranceLabelId}
                describedBy={showCustomNote ? `${insuranceDescriptionId} ${customNoteId}` : insuranceDescriptionId}
                buttonRef={switchRef}
              />
            </div>

            {showCustomNote && (
              <div className="space-y-2">
                <p id={customNoteId} className="text-xs text-gray-700">
                  Votre texte de convention est personnalisé : il n&apos;a pas été modifié par ce choix. Vérifiez que son paragraphe sur l&apos;assurance y correspond.
                </p>
                <button
                  ref={updateButtonRef}
                  type="button"
                  aria-expanded={previewShown}
                  aria-controls={previewShown ? previewId : undefined}
                  onClick={openPreview}
                  className="bg-white border border-gray-500 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Mettre à jour le paragraphe sur l&apos;assurance
                </button>

                {previewShown && (
                  <div
                    id={previewId}
                    ref={previewRef}
                    tabIndex={-1}
                    role="group"
                    aria-labelledby={previewIntroId}
                    className="space-y-2 rounded-lg bg-white border border-gray-200 p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <p id={previewIntroId} className="text-xs font-medium text-gray-800">
                      {plan.kind === "replace" ? "Ce paragraphe sera remplacé :" : "Ce paragraphe sera ajouté à la fin du texte :"}
                    </p>
                    {plan.kind === "replace" && (
                      <>
                        <blockquote className="border-l-4 border-gray-300 pl-3 text-xs text-gray-700 whitespace-pre-wrap">{plan.removed}</blockquote>
                        <p className="text-xs font-medium text-gray-800">par :</p>
                      </>
                    )}
                    <blockquote className="border-l-4 border-gray-300 pl-3 text-xs text-gray-700 whitespace-pre-wrap">{plan.added}</blockquote>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={applyPlan}
                        className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        {plan.kind === "replace" ? "Remplacer le paragraphe" : "Ajouter le paragraphe"}
                      </button>
                      <button
                        type="button"
                        onClick={closePreview}
                        className="bg-white border border-gray-500 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <textarea
            ref={textareaRef}
            aria-labelledby={titleId}
            maxLength={MARKDOWN_TEXT_MAX}
            value={text}
            onChange={(e) => { setText(e.target.value); setPreviewOpen(false); clearStatus() }}
            rows={14}
            className="w-full border border-gray-500 rounded-xl px-3 py-2.5 text-sm text-gray-700 font-mono leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-y"
          />
        </>
      )}

      <div className="flex items-center justify-between gap-3">
        {conventionEnabled && (
          <button
            type="button"
            onClick={() => { setText(buildVolunteerCharter({ hasOrgInsurance })); setPreviewOpen(false); announce("Convention par défaut rétablie. Enregistrez pour l'appliquer.") }}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Réinitialiser la convention par défaut
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          {/* Present from mount so their messages are announced (polite for status, assertive for errors). */}
          <div className="flex items-center gap-3">
            <span role="status" className={`text-xs ${status.saved ? "text-green-700" : "text-gray-700"}`}>
              {status.message}{status.saved && <span aria-hidden="true"> ✓</span>}
            </span>
            <span role="alert" className="text-xs text-red-600">{error}</span>
          </div>
          <button
            type="button"
            onClick={handleSave}
            aria-disabled={saving}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 aria-disabled:opacity-50 transition-colors"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  )
}
