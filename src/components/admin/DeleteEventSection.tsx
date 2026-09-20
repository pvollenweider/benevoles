"use client"

import { useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import ModalShell from "./ModalShell"
import { titlesMatch } from "@/lib/confirm-title"

type Props = {
  eventId: string
  title: string
  counts: { shifts: number; registrations: number; invitations: number }
  exportUrl: string
}

function count(n: number, one: string, many: string) {
  return `${new Intl.NumberFormat("fr-FR").format(n)} ${n > 1 ? many : one}`
}

/**
 * Permanent deletion of an archived event: an opener button and a confirmation
 * dialog with a strong warning, a way to save the event state first (PDF
 * export) and a typed-title confirmation.
 */
export default function DeleteEventSection({ eventId, title, counts, exportUrl }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const warningId = useId()
  const inputId = useId()
  const hintId = useId()

  const matches = titlesMatch(typed, title)

  function close() {
    if (pending) return
    setOpen(false)
    setTyped("")
    setError(null)
  }

  async function remove() {
    if (pending) return
    if (!matches) {
      setError("Saisissez le titre exact de l'événement pour confirmer.")
      inputRef.current?.focus()
      return
    }
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmTitle: typed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(typeof data?.error === "string" ? data.error : "La suppression a échoué. Réessayez.")
        setPending(false)
        return
      }
      router.push("/admin/events?deleted=1")
      router.refresh()
    } catch {
      setError("La suppression a échoué. Vérifiez votre connexion et réessayez.")
      setPending(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600">
        Cet événement est archivé. Vous pouvez le supprimer définitivement, avec ses créneaux, inscriptions et invitations.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-2 border-red-700 text-red-700 hover:bg-red-50 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
      >
        Supprimer l&apos;événement…
      </button>

      {open && (
        <ModalShell
          title="Supprimer définitivement cet événement ?"
          onClose={close}
          panelClassName="max-w-lg"
          initialFocusRef={cancelRef}
          closeOnBackdrop={false}
          describedBy={warningId}
        >
          <div id={warningId} className="rounded-xl border-2 border-red-700 bg-red-50 p-4 text-red-900">
            <p className="flex items-center gap-2 font-bold">
              <svg aria-hidden="true" className="w-5 h-5 flex-shrink-0 text-red-700" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              Action irréversible
            </p>
            <p className="mt-2 text-sm">
              « {title} » et tout ce qui s&apos;y rattache seront effacés définitivement :
            </p>
            <ul className="mt-2 text-sm list-disc pl-5 space-y-0.5">
              <li>{count(counts.shifts, "créneau", "créneaux")}</li>
              <li>{count(counts.registrations, "inscription", "inscriptions")} (listes d&apos;attente comprises)</li>
              <li>{count(counts.invitations, "invitation", "invitations")}</li>
            </ul>
            <p className="mt-2 text-sm">
              Les membres du pool et l&apos;organisation sont conservés.{" "}
              <strong>Les bénévoles ne sont pas prévenus</strong> : leur lien de gestion d&apos;inscription cessera de fonctionner.
              Pour les prévenir, annulez d&apos;abord les créneaux depuis la page des créneaux.
            </p>
          </div>

          <section aria-labelledby={`${warningId}-backup`} className="mt-4">
            <h3 id={`${warningId}-backup`} className="text-sm font-semibold text-gray-900">
              Sauvegarder avant de supprimer
            </h3>
            <p className="mt-1 text-sm text-gray-700">
              Ouvrez l&apos;export PDF (planning, récapitulatif par poste, liste des bénévoles), puis enregistrez-le
              depuis la fenêtre d&apos;impression de votre navigateur.
            </p>
            <a
              href={exportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm text-blue-700 underline underline-offset-2 hover:text-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
            >
              Ouvrir l&apos;export PDF
              <span className="sr-only"> (s&apos;ouvre dans un nouvel onglet)</span>
            </a>
          </section>

          <div className="mt-4">
            <label htmlFor={inputId} className="block text-sm font-medium text-gray-900">
              Pour confirmer, saisissez le titre de l&apos;événement : <strong>{title}</strong>
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value)
                setError(null)
              }}
              autoComplete="off"
              spellCheck={false}
              aria-describedby={hintId}
              disabled={pending}
              className="mt-1 w-full border border-gray-400 rounded-lg px-3 py-2 text-sm"
            />
            <p id={hintId} role="status" className={`mt-1 text-sm ${matches ? "text-green-800 font-medium" : "text-gray-700"}`}>
              {matches
                ? "Le titre correspond. Vous pouvez supprimer."
                : "Les majuscules et les accents ne comptent pas."}
            </p>
          </div>

          {error && <p role="alert" className="mt-3 text-sm font-medium text-red-800">{error}</p>}

          <div className="sticky bottom-0 -mx-5 mt-4 flex flex-wrap justify-end gap-2 border-t border-gray-200 bg-white px-5 pt-3">
            <button
              ref={cancelRef}
              type="button"
              onClick={close}
              disabled={pending}
              className="min-h-11 px-4 text-sm text-gray-800 hover:text-gray-950 underline disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={remove}
              aria-disabled={!matches || pending}
              className={`min-h-11 rounded-full px-5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 ${
                matches && !pending
                  ? "bg-red-700 text-white hover:bg-red-800"
                  : "bg-red-100 text-red-900 border border-dashed border-red-700 cursor-not-allowed"
              }`}
            >
              {pending ? "Suppression…" : "Supprimer définitivement"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
