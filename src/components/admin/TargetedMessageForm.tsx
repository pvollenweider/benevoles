"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useRouter } from "next/navigation"
import ModalShell from "./ModalShell"
import { MESSAGE_BODY_MAX, MESSAGE_SUBJECT_MAX, type Audience } from "@/lib/targeted-message"
import { templateProblems, VARIABLES } from "@/lib/message-template"
import { announce } from "@/lib/announce"
import RequiredMark from "@/components/RequiredMark"
import { formatScheduledFor, localNow, scheduledInstant, scheduleProblem, SCHEDULE_DELAY_MINUTES, type ScheduleProblem } from "@/lib/scheduled-message"

type Props = {
  eventId: string
  roles: string[]
  shifts: { id: string; roleName: string; name: string }[]
  initialAudience: Audience
  /** The organisation's message templates (#482). */
  templates?: { id: string; name: string; subject: string; body: string }[]
  /** The organisation's time zone: a scheduled send (#1019) is chosen in it. */
  timeZone?: string
  /** « Programmer l'envoi » is offered (not on an archived event). */
  canSchedule?: boolean
}

type DryRun = { recipients: number; pushDevices?: number; waitlistOnly?: number; declinedExcluded?: number; audience: string; preview: { subject: string; html: string } | null; addressesToVerify?: number }

/**
 * Subject, message, audience; a live recipient count; a preview; then a confirmation naming the
 * number of people written to (#396). Sending goes through the outbox on the server.
 */
export default function TargetedMessageForm({ eventId, roles, shifts, initialAudience, templates = [], timeZone = "Europe/Zurich", canSchedule = true }: Props) {
  const router = useRouter()
  const id = useId()
  const [kind, setKind] = useState<Audience["kind"]>(initialAudience.kind)
  const [roleName, setRoleName] = useState(initialAudience.kind === "role" ? initialAudience.roleName : roles[0] ?? "")
  const [shiftId, setShiftId] = useState(initialAudience.kind === "shift" ? initialAudience.shiftId : shifts[0]?.id ?? "")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  // The count, tagged with the audience it was made for: a stale one means « counting ».
  const [dryFor, setDryFor] = useState<{ key: string; data: DryRun | null } | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ sent: number; audience: string; pushDevices?: number; pushRequested?: boolean; declinedExcluded?: number } | null>(null)
  // Also a push notification (#468); the email always goes.
  const [push, setPush] = useState(false)
  const [templateNotice, setTemplateNotice] = useState("")
  // Choosing a template and applying it are two steps (#482), and the replaced text can come back.
  const [templateId, setTemplateId] = useState("")
  const [beforeTemplate, setBeforeTemplate] = useState<{ subject: string; message: string } | null>(null)
  const [attempted, setAttempted] = useState(false)
  // « Quand l'envoyer ? » (#1019): now, or on a date and time of the organisation's zone.
  const [when, setWhen] = useState<"now" | "later">("now")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  // A date or time refused by the server (it can pass while the dialogs are open).
  const [serverWhen, setServerWhen] = useState<ScheduleProblem | null>(null)
  const [scheduled, setScheduled] = useState<{ when: string; audience: string; recipients: number } | null>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const resultRef = useRef<HTMLHeadingElement>(null)

  const audience: Audience =
    kind === "role" ? { kind, roleName } : kind === "shift" ? { kind, shiftId } : { kind }
  const audienceKey = JSON.stringify(audience)
  // Template variables (#482) checked as the text is typed, with the same rule as the server.
  const subjectProblems = templateProblems(subject, kind)
  const messageProblems = templateProblems(message, kind)
  const subjectMissing = subject.trim().length === 0
  const messageMissing = message.trim().length === 0
  const later = when === "later"
  // Checked with the same rule as the server, only once « Programmer l'envoi » is chosen (the
  // clock is read on the client then, never during the first render).
  const whenProblem: ScheduleProblem | null = later ? (serverWhen ?? scheduleProblem({ date, time }, timeZone, new Date())) : null
  const dateProblem = attempted && whenProblem?.field === "date" ? whenProblem.message : null
  const timeProblem = attempted && whenProblem?.field === "time" ? whenProblem.message : null
  const whenLabel = later && !whenProblem ? `${formatScheduledFor(scheduledInstant(date, time, timeZone), timeZone, new Date())} (${timeZone})` : ""

  // Recipient count for the chosen audience; the subject and message are placeholders here, the
  // count doesn't depend on them.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/events/${eventId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience: JSON.parse(audienceKey), subject: "-", message: "-", dryRun: true }),
    })
      .then((r) => r.json())
      .then((d: DryRun) => { if (!cancelled) setDryFor({ key: audienceKey, data: d }) })
      .catch(() => { if (!cancelled) setDryFor({ key: audienceKey, data: null }) })
    return () => { cancelled = true }
  }, [eventId, audienceKey])
  const counting = dryFor?.key !== audienceKey
  const dry = counting ? null : dryFor?.data ?? null

  const [restartCount, setRestartCount] = useState(0)
  useEffect(() => { if (sent || scheduled) resultRef.current?.focus() }, [sent, scheduled])
  // After « Écrire un autre message » the clicked button is gone: land on the subject field.
  useEffect(() => { if (restartCount > 0) document.getElementById(`${id}-subject`)?.focus() }, [restartCount, id])

  async function preview() {
    setAttempted(true)
    if (subjectProblems.length > 0 || messageProblems.length > 0) {
      document.getElementById(subjectProblems.length > 0 ? `${id}-subject` : `${id}-message`)?.focus()
      return
    }
    if (subjectMissing || messageMissing) {
      document.getElementById(subjectMissing ? `${id}-subject` : `${id}-message`)?.focus()
      return
    }
    if (whenProblem) {
      document.getElementById(whenProblem.field === "date" ? `${id}-date` : `${id}-time`)?.focus()
      return
    }
    if (counting || recipients === 0) return
    setError(null)
    const res = await fetch(`/api/admin/events/${eventId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience, subject, message, dryRun: true }),
    })
    const d = await res.json()
    if (!res.ok) { setError(typeof d?.error === "string" ? d.error : "Erreur lors de l'aperçu."); return }
    setDryFor({ key: audienceKey, data: d })
    setShowPreview(true)
  }

  async function schedule() {
    if (sending) return
    setSending(true)
    setError(null)
    const res = await fetch(`/api/admin/events/${eventId}/scheduled-messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience, subject, message, push, date, time }),
    }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    setSending(false)
    if (!res || !res.ok) {
      const text = typeof d?.error === "string" ? d.error : "La programmation n'a pas pu être enregistrée."
      // The time passed meanwhile, or the date is refused: back on the field, with the reason.
      if (d?.field === "date" || d?.field === "time") {
        flushSync(() => { setConfirming(false); setServerWhen({ field: d.field, message: text }) })
        document.getElementById(d.field === "date" ? `${id}-date` : `${id}-time`)?.focus()
        return
      }
      flushSync(() => { setConfirming(false); setError(text) })
      errorRef.current?.focus()
      return
    }
    setConfirming(false)
    setScheduled({ when: d.when, audience: d.audience, recipients: d.recipients })
    // « Messages programmés » below shows it, with « Annuler l'envoi »; client state is kept.
    router.refresh()
  }

  async function send() {
    if (sending) return
    if (later) return schedule()
    setSending(true)
    setError(null)
    const res = await fetch(`/api/admin/events/${eventId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience, subject, message, push }),
    })
    const d = await res.json()
    setSending(false)
    setConfirming(false)
    if (!res.ok) { setError(typeof d?.error === "string" ? d.error : "Erreur lors de l'envoi."); return }
    setSent({ ...d, pushRequested: push })
    // The « Messages envoyés » list below (#467) shows the new message; client state is kept.
    router.refresh()
  }

  const recipients = dry?.recipients ?? 0
  const pushDevices = dry?.pushDevices ?? 0
  const plural = (n: number) => `${n} personne${n > 1 ? "s" : ""}`
  const devices = (n: number) => `${n} appareil${n > 1 ? "s" : ""}`
  // What goes out, in one phrase for the preview and the confirmation.
  const pushPart = push ? (pushDevices > 0 ? ` ; une notification part aussi sur ${devices(pushDevices)}` : " ; aucune notification (aucun destinataire ne les a activées)") : ""
  // Invités sans créneau (#558) : les personnes pas disponibles ne sont pas dans le compte ci-dessus.
  const declinedExcluded = kind === "invited_without_shift" ? (dry?.declinedExcluded ?? 0) : 0
  const declinedPart = declinedExcluded > 0 ? ` (${declinedExcluded} ${declinedExcluded > 1 ? "personnes pas disponibles non incluses" : "personne pas disponible non incluse"})` : ""
  // Adresses à vérifier (#599) : avertit seulement, n'empêche jamais l'envoi — l'adresse peut avoir
  // été corrigée côté destinataire depuis le dernier refus.
  const addressesToVerify = dry?.addressesToVerify ?? 0
  const addressesToVerifyWarning = addressesToVerify > 0
    ? `${addressesToVerify} ${addressesToVerify > 1 ? "destinataires ont une adresse à vérifier (un précédent message leur a été définitivement refusé)" : "destinataire a une adresse à vérifier (un précédent message lui a été définitivement refusé)"}.`
    : null
  const restart = () => { setSent(null); setScheduled(null); setSubject(""); setMessage(""); setPush(false); setTemplateId(""); setTemplateNotice(""); setBeforeTemplate(null); setAttempted(false); setWhen("now"); setDate(""); setTime(""); setServerWhen(null); setRestartCount((n) => n + 1) }
  const inputClass = (missing: boolean, hasProblems = false) => `input ${(attempted && missing) || hasProblems ? "!border-red-600" : ""}`

  if (scheduled) {
    return (
      <section aria-labelledby={`${id}-done`} className="bg-white rounded-2xl border border-green-200 p-5 space-y-3">
        <h3 id={`${id}-done`} ref={resultRef} tabIndex={-1} className="font-semibold text-gray-900 focus:outline-none">
          Message programmé pour le {scheduled.when}
        </h3>
        <p className="text-sm text-gray-700">
          Destinataires : {scheduled.audience}, {plural(scheduled.recipients)} aujourd&apos;hui. Ils sont recalculés au moment de l&apos;envoi, qui part dans les {SCHEDULE_DELAY_MINUTES} minutes suivant l&apos;heure choisie.
          Vous pouvez l&apos;annuler jusque-là dans <a href="#scheduled-messages-heading" className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900">Messages programmés</a>, plus bas sur cette page.
        </p>
        <button
          type="button"
          onClick={restart}
          className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Écrire un autre message
        </button>
      </section>
    )
  }

  if (sent) {
    return (
      <section aria-labelledby={`${id}-done`} className="bg-white rounded-2xl border border-green-200 p-5 space-y-3">
        <h3 id={`${id}-done`} ref={resultRef} tabIndex={-1} className="font-semibold text-gray-900 focus:outline-none">
          Message envoyé à {plural(sent.sent)}
        </h3>
        <p className="text-sm text-gray-700">Destinataires : {sent.audience}. L&apos;envoi se fait dans la minute ; un email qui échoue est renvoyé automatiquement.</p>
        {(sent.declinedExcluded ?? 0) > 0 && (
          <p className="text-sm text-gray-700">{sent.declinedExcluded} {sent.declinedExcluded! > 1 ? "personnes pas disponibles n'ont" : "personne pas disponible n'a"} rien reçu.</p>
        )}
        {sent.pushRequested && ((sent.pushDevices ?? 0) > 0
          ? <p className="text-sm text-gray-700">Notification envoyée sur {devices(sent.pushDevices!)}. Le résultat s&apos;affiche dans les messages envoyés.</p>
          : <p className="text-sm text-gray-700">Aucune notification envoyée : aucun de ces destinataires n&apos;a activé les notifications.</p>)}
        <button
          type="button"
          onClick={restart}
          className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Écrire un autre message
        </button>
      </section>
    )
  }

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); preview() }} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-5">
      <p aria-hidden="true" className="text-xs text-gray-600">Les champs marqués d&apos;un astérisque (*) sont obligatoires.</p>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-800">Destinataires</legend>
        {([
          ["event", "Tous les bénévoles inscrits"],
          ["role", "Les bénévoles d'un poste"],
          ["shift", "Les bénévoles d'un créneau"],
          ["waitlist", "Les personnes en liste d'attente"],
          ["invited_without_shift", "Les invités sans créneau confirmé"],
        ] as const).map(([k, label]) => (
          <div key={k} className="flex items-center gap-2 min-h-8">
            <input id={`${id}-kind-${k}`} type="radio" name={`${id}-kind`} value={k} checked={kind === k} onChange={() => setKind(k)} disabled={(k === "role" && roles.length === 0) || (k === "shift" && shifts.length === 0)} className="h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500" />
            <label htmlFor={`${id}-kind-${k}`} className="text-sm text-gray-800">
              {label}
              {((k === "role" && roles.length === 0) || (k === "shift" && shifts.length === 0)) && <span className="text-gray-600"> (aucun créneau)</span>}
            </label>
          </div>
        ))}
        {kind === "role" && (
          <div className="pl-6">
            <label htmlFor={`${id}-role`} className="block text-xs font-medium text-gray-600 mb-1">Poste</label>
            <select id={`${id}-role`} value={roleName} onChange={(e) => setRoleName(e.target.value)} className="input">
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        )}
        {kind === "shift" && (
          <div className="pl-6">
            <label htmlFor={`${id}-shift`} className="block text-xs font-medium text-gray-600 mb-1">Créneau</label>
            <select id={`${id}-shift`} value={shiftId} onChange={(e) => setShiftId(e.target.value)} className="input">
              {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        <p id={`${id}-count`} aria-live="polite" aria-atomic="true" className="text-sm text-gray-700 pt-1">
          {!counting && dry ? (recipients === 0 ? "Personne à qui écrire dans cette sélection." : later
            ? `${plural(recipients)} aujourd'hui${kind === "invited_without_shift" && (dry.waitlistOnly ?? 0) > 0 ? `, dont ${dry.waitlistOnly} en liste d'attente` : ""} ; le nombre est recalculé au moment de l'envoi.`
            : `${plural(recipients)} recevr${recipients > 1 ? "ont" : "a"} ce message${kind === "invited_without_shift" && (dry.waitlistOnly ?? 0) > 0 ? `, dont ${dry.waitlistOnly} en liste d'attente` : ""}.`) : ""}
          {!counting && dry && kind === "invited_without_shift" && (dry.declinedExcluded ?? 0) > 0 ? ` ${dry.declinedExcluded} personne${dry.declinedExcluded! > 1 ? "s ont" : " a"} indiqué ne pas être disponible${dry.declinedExcluded! > 1 ? "s" : ""} et ne reçoi${dry.declinedExcluded! > 1 ? "vent" : "t"} rien.` : ""}
        </p>
        {counting && <p aria-hidden="true" className="text-sm text-gray-600">Comptage…</p>}
      </fieldset>

      {templates.length > 0 && (
        <div>
          <label htmlFor={`${id}-template`} className="block text-sm font-medium text-gray-800 mb-1">Partir d&apos;un modèle</label>
          <div className="flex flex-wrap items-center gap-2">
            <select id={`${id}-template`} value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-describedby={`${id}-template-hint`} className="input flex-1 min-w-48">
              <option value="">Choisir un modèle…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => {
                const t = templates.find((x) => x.id === templateId)
                if (!t) return
                setBeforeTemplate(subject.trim() || message.trim() ? { subject, message } : null)
                setSubject(t.subject)
                setMessage(t.body)
                announce(setTemplateNotice, `Modèle « ${t.name} » appliqué : objet et message remplacés, modifiables avant l'envoi.`)
              }}
              aria-disabled={!templateId || undefined}
              className={`text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded px-1 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${templateId ? "" : "opacity-60 cursor-not-allowed"}`}
            >
              Utiliser ce modèle
            </button>
            {beforeTemplate && (
              <button
                type="button"
                onClick={() => { setSubject(beforeTemplate.subject); setMessage(beforeTemplate.message); setBeforeTemplate(null); announce(setTemplateNotice, "Objet et message précédents rétablis.") }}
                className="text-sm text-gray-700 underline underline-offset-2 hover:text-gray-900 rounded px-1 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Rétablir le texte précédent
              </button>
            )}
          </div>
          <p id={`${id}-template-hint`} className="text-xs text-gray-600 mt-1">Remplace l&apos;objet et le message actuels ; vous pouvez les modifier ensuite.</p>
          <p role="status" className="text-xs text-gray-700 mt-1">{templateNotice}</p>
        </div>
      )}

      <div>
        <label htmlFor={`${id}-subject`} className={`block text-sm font-medium mb-1 ${attempted && subjectMissing ? "text-red-700" : "text-gray-800"}`}>Objet<RequiredMark /></label>
        <input id={`${id}-subject`} type="text" value={subject} maxLength={MESSAGE_SUBJECT_MAX} required aria-invalid={subjectProblems.length > 0 || (attempted && subjectMissing) ? true : undefined} aria-describedby={`${id}-subject-hint${subjectProblems.length > 0 ? ` ${id}-subject-problems` : ""}`} onChange={(e) => setSubject(e.target.value)} className={inputClass(subjectMissing, subjectProblems.length > 0)} />
        <p id={`${id}-subject-hint`} className="text-xs text-gray-600 mt-1">Le titre de l&apos;événement est ajouté après l&apos;objet. {subject.length}/{MESSAGE_SUBJECT_MAX} caractères.</p>
        {subjectProblems.length > 0 && (
          <ul id={`${id}-subject-problems`} role="list" className="text-xs text-red-700 mt-1 space-y-0.5">
            {subjectProblems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
      </div>

      <div>
        <label htmlFor={`${id}-message`} className={`block text-sm font-medium mb-1 ${attempted && messageMissing ? "text-red-700" : "text-gray-800"}`}>Message<RequiredMark /></label>
        <textarea id={`${id}-message`} rows={6} value={message} maxLength={MESSAGE_BODY_MAX} required aria-invalid={messageProblems.length > 0 || (attempted && messageMissing) ? true : undefined} aria-describedby={`${id}-message-hint${messageProblems.length > 0 ? ` ${id}-message-problems` : ""}`} onChange={(e) => setMessage(e.target.value)} className={inputClass(messageMissing, messageProblems.length > 0)} />
        <p id={`${id}-message-hint`} className="text-xs text-gray-600 mt-1">
          Texte simple, les retours à la ligne sont conservés. {message.length}/{MESSAGE_BODY_MAX} caractères. Variables possibles : {Object.keys(VARIABLES).map((k) => `{${k}}`).join(", ")}.
        </p>
        {messageProblems.length > 0 && (
          <ul id={`${id}-message-problems`} role="list" className="text-xs text-red-700 mt-1 space-y-0.5">
            {messageProblems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
      </div>

      <div className="flex items-start gap-2">
        <input id={`${id}-push`} type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} aria-describedby={`${id}-push-hint`} className="mt-0.5 h-4 w-4 rounded border-gray-500 text-blue-600 focus:ring-2 focus:ring-blue-500" />
        <div>
          <label htmlFor={`${id}-push`} className="text-sm font-medium text-gray-800">Envoyer aussi une notification (téléphone ou ordinateur)</label>
          <p id={`${id}-push-hint`} className="text-xs text-gray-600 mt-0.5">
            Pour une information urgente. Seuls les bénévoles qui ont activé les notifications la reçoivent ; l&apos;email part à tous. La notification montre l&apos;objet et la première ligne du message.
            {!counting && dry ? (pushDevices > 0 ? ` Ces destinataires ont ${devices(pushDevices)} abonné${pushDevices > 1 ? "s" : ""} aux notifications.` : " Aucun de ces destinataires n'a activé les notifications.") : ""}
          </p>
        </div>
      </div>

      {canSchedule && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-800">Quand l&apos;envoyer ?</legend>
          {([["now", "Maintenant"], ["later", "Programmer l'envoi"]] as const).map(([k, label]) => (
            <div key={k} className="flex items-center gap-2 min-h-8">
              <input id={`${id}-when-${k}`} type="radio" name={`${id}-when`} value={k} checked={when === k} onChange={() => setWhen(k)} className="h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500" />
              <label htmlFor={`${id}-when-${k}`} className="text-sm text-gray-800">{label}</label>
            </div>
          ))}
          {later && (
            <div className="pl-6 space-y-3">
              <div className="flex flex-wrap gap-4">
                <div>
                  <label htmlFor={`${id}-date`} className={`block text-xs font-medium mb-1 ${dateProblem ? "text-red-700" : "text-gray-600"}`}>Date d&apos;envoi<RequiredMark /></label>
                  <input
                    id={`${id}-date`} type="date" lang="fr-FR" value={date} required min={localNow(new Date(), timeZone).date}
                    onChange={(e) => { setDate(e.target.value); setServerWhen(null) }}
                    aria-invalid={dateProblem ? true : undefined}
                    aria-describedby={`${id}-when-hint${dateProblem ? ` ${id}-date-error` : ""}`}
                    className={`input ${dateProblem ? "!border-red-600" : ""}`}
                  />
                  {dateProblem && <p id={`${id}-date-error`} className="text-xs text-red-700 mt-1">{dateProblem}</p>}
                </div>
                <div>
                  <label htmlFor={`${id}-time`} className={`block text-xs font-medium mb-1 ${timeProblem ? "text-red-700" : "text-gray-600"}`}>Heure d&apos;envoi ({timeZone})<RequiredMark /></label>
                  <input
                    id={`${id}-time`} type="time" lang="fr-FR" value={time} required
                    onChange={(e) => { setTime(e.target.value); setServerWhen(null) }}
                    aria-invalid={timeProblem ? true : undefined}
                    aria-describedby={`${id}-when-hint${timeProblem ? ` ${id}-time-error` : ""}`}
                    className={`input ${timeProblem ? "!border-red-600" : ""}`}
                  />
                  {timeProblem && <p id={`${id}-time-error`} className="text-xs text-red-700 mt-1">{timeProblem}</p>}
                </div>
              </div>
              <p id={`${id}-when-hint`} className="text-xs text-gray-600">
                Le message part dans les {SCHEDULE_DELAY_MINUTES} minutes qui suivent. Les destinataires sont calculés au moment de l&apos;envoi : une personne inscrite d&apos;ici là le reçoit aussi, une personne désinscrite ne le reçoit pas. Vous pouvez l&apos;annuler jusque-là.
              </p>
            </div>
          )}
        </fieldset>
      )}

      {attempted && (subjectMissing || messageMissing) ? (
        <p role="alert" className="text-sm text-red-700">Champs obligatoires manquants : {[subjectMissing && "objet", messageMissing && "message"].filter(Boolean).join(", ")}.</p>
      ) : attempted && whenProblem ? (
        // The reason is under the field; the summary names the field, like the missing ones.
        <p role="alert" className="text-sm text-red-700">À corriger : {whenProblem.field === "date" ? "date d'envoi" : "heure d'envoi"}.</p>
      ) : null}
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 focus:outline-none">{error}</p>}

      <div className="flex gap-3 flex-wrap">
        <button
          type="submit"
          aria-disabled={counting || recipients === 0}
          aria-describedby={`${id}-count`}
          className={`bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${counting || recipients === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {later ? "Voir l'aperçu et programmer" : "Voir l'aperçu et envoyer"}
        </button>
      </div>

      {showPreview && dry?.preview && (
        <ModalShell title="Aperçu de l'email" onClose={() => setShowPreview(false)} panelClassName="max-w-2xl" closeOnBackdrop={false} initialFocusRef={cancelRef} describedBy={addressesToVerifyWarning ? `${id}-preview-warning` : undefined}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700">Tel que le recevra la première personne de la liste ; chacun voit ses propres créneaux.</p>
            <p className="text-sm"><span className="font-medium">Objet :</span> {dry.preview.subject}</p>
            <iframe title="Contenu de l'email" sandbox="" srcDoc={dry.preview.html} className="w-full h-[50vh] max-h-[28rem] border border-gray-200 rounded-lg bg-white" />
            {later
              ? <p className="text-sm text-gray-800">Programmer l&apos;email pour le <strong>{whenLabel}</strong>, à <strong>{plural(recipients)}</strong> ({dry.audience}, nombre actuel, recalculé au moment de l&apos;envoi){declinedPart}{pushPart} ?</p>
              : <p className="text-sm text-gray-800">Envoyer l&apos;email à <strong>{plural(recipients)}</strong> ({dry.audience}){declinedPart}{pushPart} ?</p>}
            {addressesToVerifyWarning && (
              <p id={`${id}-preview-warning`} className="text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 forced-colors:border-[CanvasText]">
                <span aria-hidden="true">⚠ </span>{addressesToVerifyWarning} L&apos;envoi reste possible.
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button ref={cancelRef} type="button" onClick={() => setShowPreview(false)} className="text-sm text-gray-700 px-3 py-2 rounded hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Retour au message</button>
              <button
                type="button"
                onClick={() => { setShowPreview(false); setConfirming(true) }}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {later ? `Programmer pour ${plural(recipients)}` : `Envoyer à ${plural(recipients)}`}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {confirming && (
        <ModalShell
          title={later ? "Confirmer la programmation" : "Confirmer l'envoi"}
          onClose={() => { if (!sending) setConfirming(false) }}
          busy={sending}
          initialFocusRef={cancelRef}
          describedBy={addressesToVerifyWarning ? `${id}-confirm-text ${id}-confirm-warning` : `${id}-confirm-text`}
          closeOnBackdrop={false}
        >
          <div className="space-y-4" aria-busy={sending}>
            {later ? (
              <p id={`${id}-confirm-text`} className="text-sm text-gray-800">
                « {subject} » partira le <strong>{whenLabel}</strong> à <strong>{plural(recipients)}</strong> ({dry?.audience}, nombre actuel, recalculé au moment de l&apos;envoi){declinedPart}{pushPart}. Vous pourrez l&apos;annuler jusque-là dans « Messages programmés », plus bas sur cette page.
              </p>
            ) : (
              <p id={`${id}-confirm-text`} className="text-sm text-gray-800">
                « {subject} » va partir à <strong>{plural(recipients)}</strong> ({dry?.audience}){declinedPart}{pushPart}. Cet envoi ne peut pas être annulé.
              </p>
            )}
            {addressesToVerifyWarning && (
              <p id={`${id}-confirm-warning`} className="text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 forced-colors:border-[CanvasText]">
                <span aria-hidden="true">⚠ </span>{addressesToVerifyWarning} L&apos;envoi reste possible.
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button ref={cancelRef} type="button" aria-disabled={sending} onClick={() => { if (!sending) setConfirming(false) }} className="text-sm text-gray-700 px-3 py-2 rounded hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Annuler</button>
              <button type="button" aria-disabled={sending} onClick={send} className={`bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${sending ? "opacity-50" : ""}`}>
                {later ? (sending ? "Programmation…" : "Confirmer la programmation") : (sending ? "Envoi…" : "Confirmer l'envoi")}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </form>
  )
}
