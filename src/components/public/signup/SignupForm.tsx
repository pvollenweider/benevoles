"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { useSubmit } from "@/lib/use-submit"
import FormStatus from "@/components/FormStatus"
import { DESCRIPTION_LONG_MESSAGE, DESCRIPTION_SHORT_MESSAGE, SIGNUP_ACCEPTED_MESSAGE, SIGNUP_CLOSED_MESSAGE, SIGNUP_DESCRIPTION_MAX, SIGNUP_DESCRIPTION_MIN } from "@/lib/signup"

const inputClass = "w-full rounded-xl border border-gray-500 bg-white px-3 py-3 text-base text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400 dark:border-gray-500 dark:bg-gray-800 dark:text-gray-100"
const labelClass = "block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1"

type Field = "organizationName" | "description" | "contactName" | "email"

/**
 * The self-service sign-up form (#810, part 4b), on the forms pattern of the project (useSubmit,
 * FormStatus): each error under its field, the field marked and focused; the confirmation replaces
 * the form and takes the focus. A hidden field catches naive scripts; the time the form was shown
 * is sent so a submission faster than a person is ignored (src/lib/signup.ts).
 */
export default function SignupForm({ open }: { open: boolean }) {
  const id = useId()
  const orgRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const doneRef = useRef<HTMLHeadingElement>(null)
  const [values, setValues] = useState({ organizationName: "", description: "", contactName: "", email: "", website: "" })
  const [startedAt] = useState(() => Date.now())
  const [done, setDone] = useState(false)
  const { submit, busy, error, fail, isInvalid } = useSubmit()

  useEffect(() => { if (done) doneRef.current?.focus() }, [done])

  if (!open) {
    return <p className="text-base text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3">{SIGNUP_CLOSED_MESSAGE}</p>
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-2">
        <h2 ref={doneRef} tabIndex={-1} className="text-xl font-semibold text-gray-900 dark:text-gray-100 focus:outline-none">Vérifiez votre boîte email</h2>
        <p className="text-base text-gray-700 dark:text-gray-300">{SIGNUP_ACCEPTED_MESSAGE}</p>
      </div>
    )
  }

  function check(): { field: Field; message: string } | null {
    if (values.organizationName.trim().length < 2) return { field: "organizationName", message: "Indiquez le nom de l'association (2 caractères au moins)." }
    const description = values.description.trim().length
    if (description < SIGNUP_DESCRIPTION_MIN) return { field: "description", message: DESCRIPTION_SHORT_MESSAGE }
    if (description > SIGNUP_DESCRIPTION_MAX) return { field: "description", message: DESCRIPTION_LONG_MESSAGE }
    if (values.contactName.trim().length < 2) return { field: "contactName", message: "Indiquez votre nom (2 caractères au moins)." }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) return { field: "email", message: "Indiquez une adresse email valide, par exemple nom@exemple.org." }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // A second click or Enter while sending: ignored, never shown as a failure.
    if (busy) return
    const problem = check()
    if (problem) {
      const el = { organizationName: orgRef, description: descriptionRef, contactName: nameRef, email: emailRef }[problem.field].current
      fail(problem.message, problem.field, el)
      return
    }
    const outcome = await submit(() => fetch("/api/public/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, startedAt }),
    }), { silent: true })
    if (outcome.ok) { setDone(true); return }
    // The fields were checked above: what the server refuses (closed sign-up, server error) is general.
    fail(outcome.error || "La demande n'a pas pu être envoyée.")
  }

  const describedBy = (field: Field, hint?: string) => [hint, isInvalid(field) ? `${id}-error` : null].filter(Boolean).join(" ") || undefined

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <p className="text-sm text-gray-700 dark:text-gray-300">Tous les champs sont obligatoires.</p>
      <div>
        <label htmlFor={`${id}-org`} className={labelClass}>Nom de l&apos;association</label>
        <input id={`${id}-org`} ref={orgRef} value={values.organizationName} onChange={(e) => setValues({ ...values, organizationName: e.target.value })}
          required maxLength={100} autoComplete="organization" aria-invalid={isInvalid("organizationName")} aria-describedby={describedBy("organizationName")} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`${id}-description`} className={labelClass}>Votre association et votre besoin</label>
        <p id={`${id}-description-hint`} className="text-sm text-gray-700 dark:text-gray-300 mb-1">En quelques phrases : ce que fait votre association et pour quel événement vous cherchez des bénévoles. Nous le lisons avant de valider votre espace. Entre {SIGNUP_DESCRIPTION_MIN} et {SIGNUP_DESCRIPTION_MAX} caractères.</p>
        <textarea id={`${id}-description`} ref={descriptionRef} value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })}
          required rows={4} maxLength={SIGNUP_DESCRIPTION_MAX} aria-invalid={isInvalid("description")} aria-describedby={describedBy("description", `${id}-description-hint`)} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`${id}-name`} className={labelClass}>Votre nom</label>
        <input id={`${id}-name`} ref={nameRef} value={values.contactName} onChange={(e) => setValues({ ...values, contactName: e.target.value })}
          required maxLength={100} autoComplete="name" aria-invalid={isInvalid("contactName")} aria-describedby={describedBy("contactName")} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`${id}-email`} className={labelClass}>Votre adresse email</label>
        <p id={`${id}-email-hint`} className="text-sm text-gray-700 dark:text-gray-300 mb-1">Un lien de confirmation y sera envoyé. Elle sera aussi votre identifiant de connexion.</p>
        <input id={`${id}-email`} ref={emailRef} type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })}
          required maxLength={200} autoComplete="email" aria-invalid={isInvalid("email")} aria-describedby={describedBy("email", `${id}-email-hint`)} className={inputClass} />
      </div>
      {/* Honeypot: off screen and out of the tab order; people never see it, naive scripts fill it. */}
      <div aria-hidden="true" inert className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Site web (laisser vide)</label>
        <input id={`${id}-website`} tabIndex={-1} autoComplete="off" value={values.website} onChange={(e) => setValues({ ...values, website: e.target.value })} />
      </div>
      <FormStatus error={error} errorId={`${id}-error`} />
      <button type="submit" aria-disabled={busy || undefined}
        className={`rounded-xl bg-gray-900 px-5 py-3 text-base font-medium text-white hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white ${busy ? "cursor-wait opacity-80" : ""}`}>
        {busy ? "Envoi…" : "Créer mon espace"}
      </button>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Vos données servent uniquement à créer et gérer votre espace ; voir la <Link href="/legal/privacy" className="underline underline-offset-2 text-blue-700 dark:text-blue-300">politique de confidentialité</Link>.
      </p>
    </form>
  )
}
