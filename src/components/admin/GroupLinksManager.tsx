"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { useId, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { announce } from "@/lib/announce"
import { deleteGroupLinkRecap } from "@/lib/action-recap"
import { focusFirstAvailable, type FocusCandidate } from "@/lib/focus-return"
import {
  GROUP_LINK_NAME_MAX,
  GROUP_LINK_NAME_REQUIRED,
  GROUP_LINK_NAME_ERRORS,
  GROUP_LINK_ROLES_REQUIRED,
  groupLinkStatsText,
  type AdminGroupLink,
} from "@/lib/group-links"
import { requestJson, useSubmit } from "@/lib/use-submit"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import FormStatus from "@/components/FormStatus"
import { COPIED, COPY_FAILED } from "@/components/admin/EventShareLink"

const outlineButton =
  "inline-flex items-center min-h-9 text-sm font-medium border border-blue-600 text-blue-700 px-3 py-1.5 rounded-xl hover:bg-blue-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const quietButton =
  "inline-flex items-center min-h-9 text-sm font-medium border border-gray-300 text-gray-800 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const dangerButton =
  "inline-flex items-center min-h-9 text-sm font-medium border border-transparent text-red-700 px-3 py-1.5 rounded-xl hover:bg-red-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

type FormValues = { name: string; roleNames: string[]; hideFull: boolean }

/**
 * Share links per group (#947), in the event's « Partager l'événement » area: one link per club or
 * team, showing only its roles, with its QR code and the sign-ups it brought. Inline forms (no
 * dialog), the focus handled by hand as in MilestonesSection; deletion asks first.
 */
export default function GroupLinksManager({ eventId, roles, initialLinks, published }: {
  eventId: string
  /** Roles on the planning (live shifts), in its order. */
  roles: string[]
  initialLinks: AdminGroupLink[]
  published: boolean
}) {
  const [links, setLinks] = useState(initialLinks)
  // "new" for the creation form, a link id for its edit form, null when no form is open.
  const [editing, setEditing] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [failed, setFailed] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<AdminGroupLink | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const createButtonRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const urlRefs = useRef(new Map<string, HTMLElement>())
  const [focusRequest, setFocusRequest] = useState<{ candidates: FocusCandidate[] } | null>(null)
  const headingId = useId()

  // Once React has committed the render that goes with it (form closed, row removed).
  useLayoutEffect(() => {
    if (focusRequest) focusFirstAvailable(focusRequest.candidates)
  }, [focusRequest])

  const byAction = (id: string, action: string) => () =>
    listRef.current?.querySelector<HTMLElement>(`[data-link-id="${CSS.escape(id)}"] [data-action="${action}"]`) ?? null

  async function copy(link: AdminGroupLink) {
    try {
      await navigator.clipboard.writeText(link.url)
      setFailed(false)
      announce(setMessage, `${COPIED.replace(/\.$/, "")} : « ${link.name} ».`)
    } catch {
      const el = urlRefs.current.get(link.id)
      if (el) window.getSelection()?.selectAllChildren(el)
      setFailed(true)
      announce(setMessage, COPY_FAILED)
    }
  }

  function closeForm(focusTo: FocusCandidate[]) {
    setEditing(null)
    setFocusRequest({ candidates: focusTo })
  }

  function saved(link: AdminGroupLink, created: boolean) {
    setLinks((prev) => (created ? [...prev, link] : prev.map((l) => (l.id === link.id ? link : l))))
    setFailed(false)
    announce(setMessage, created ? `Lien « ${link.name} » créé.` : `Lien « ${link.name} » enregistré.`)
    // Getters: the create button is only rendered again once the form has closed.
    closeForm([byAction(link.id, created ? "copy" : "edit"), () => createButtonRef.current, headingRef.current])
  }

  async function runDelete(link: AdminGroupLink) {
    setDeleting(true)
    setDeleteError(null)
    const outcome = await requestJson(
      () => fetch(`/api/admin/events/${eventId}/group-links/${link.id}`, { method: "DELETE" }),
      `Impossible de supprimer le lien « ${link.name} ».`,
    )
    setDeleting(false)
    if (!outcome.ok) { setDeleteError(outcome.error); return }
    const index = links.findIndex((l) => l.id === link.id)
    const neighbour = links[index + 1] ?? links[index - 1]
    flushSync(() => {
      setPendingDelete(null)
      setLinks((prev) => prev.filter((l) => l.id !== link.id))
    })
    setFailed(false)
    announce(setMessage, `Lien « ${link.name} » supprimé.`)
    focusFirstAvailable([neighbour ? byAction(neighbour.id, "copy") : null, createButtonRef.current, headingRef.current])
  }

  return (
    <div className="space-y-3 border-t border-gray-200 pt-3">
      <div>
        <h3 id={headingId} ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-gray-900 focus:outline-none">Liens par groupe</h3>
        <p className="text-sm text-gray-700">
          Un lien et un QR code par club ou par équipe : la page n&apos;affiche que ses postes, et vous voyez combien d&apos;inscriptions chaque lien a apportées.
        </p>
        {!published && (
          <p className="text-sm text-gray-700 mt-1">L&apos;événement n&apos;est pas publié : en attendant, ces liens mènent à une page introuvable, comme le lien principal. Ils ouvriront sa page dès sa publication.</p>
        )}
      </div>

      <p role="status" className={message ? `text-sm ${failed ? "text-red-800" : "text-green-800"}` : "sr-only"}>{message}</p>

      {pendingDelete && (
        <ConfirmActionModal
          recap={deleteGroupLinkRecap(pendingDelete.name, pendingDelete.registrations)}
          busy={deleting}
          error={deleteError}
          onConfirm={() => void runDelete(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {links.length > 0 && (
        <ul ref={listRef} aria-labelledby={headingId} className="space-y-2">
          {links.map((link) => (
            <li key={link.id} data-link-id={link.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
              {editing === link.id ? (
                <GroupLinkForm
                  eventId={eventId}
                  roles={roles}
                  link={link}
                  onSaved={(l) => saved(l, false)}
                  onCancel={() => closeForm([byAction(link.id, "edit"), headingRef.current])}
                />
              ) : (
                <>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 break-words">{link.name}</p>
                    <p className="text-sm text-gray-700 break-words">
                      {link.roleNames.length > 0 ? <>Postes : {link.roleNames.join(", ")}</> : "Aucun poste"}
                      {link.hideFull && " · créneaux complets masqués"}
                    </p>
                    {link.missingRoles.length > 0 && (
                      <p className="text-sm text-amber-900">
                        {link.missingRoles.length === link.roleNames.length
                          ? "Aucun de ses postes n'est au planning : le lien affiche tout l'événement."
                          : `Plus au planning : ${link.missingRoles.join(", ")}.`}
                      </p>
                    )}
                    {link.roleNames.length === 0 && (
                      <p className="text-sm text-amber-900">Le lien affiche tout l&apos;événement : modifiez-le pour choisir ses postes.</p>
                    )}
                    <p className="text-sm text-gray-700">
                      {groupLinkStatsText({ registrations: link.registrations, people: link.people })}
                      {link.registrations > 0 && (
                        <>
                          {" · "}
                          <Link
                            href={`/admin/events/${eventId}/registrations?lien=${encodeURIComponent(link.id)}`}
                            className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                          >
                            Voir ses inscriptions<span className="sr-only"> (« {link.name} »)</span>
                          </Link>
                        </>
                      )}
                    </p>
                    <p className="text-sm text-gray-700 mt-1">
                      Lien :{" "}
                      <span
                        ref={(el) => { if (el) urlRefs.current.set(link.id, el); else urlRefs.current.delete(link.id) }}
                        className="font-medium text-gray-900 break-all select-all"
                      >
                        {link.url}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" data-action="copy" onClick={() => void copy(link)} className={outlineButton}>
                      Copier le lien<span className="sr-only"> « {link.name} »</span>
                    </button>
                    <a href={`/api/admin/events/${eventId}/qr?link=${encodeURIComponent(link.id)}&format=png&download=1`} download className={quietButton}>
                      QR code PNG<span className="sr-only"> « {link.name} », fichier à télécharger</span>
                    </a>
                    <a href={`/api/admin/events/${eventId}/qr?link=${encodeURIComponent(link.id)}&format=svg&download=1`} download className={quietButton}>
                      QR code SVG<span className="sr-only"> « {link.name} », fichier à télécharger</span>
                    </a>
                    <button type="button" data-action="edit" onClick={() => setEditing(link.id)} className={quietButton}>
                      Modifier<span className="sr-only"> le lien « {link.name} »</span>
                    </button>
                    <button type="button" data-action="delete" onClick={() => { setDeleteError(null); setPendingDelete(link) }} className={dangerButton}>
                      Supprimer<span className="sr-only"> le lien « {link.name} »</span>
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing === "new" ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <GroupLinkForm
            eventId={eventId}
            roles={roles}
            onSaved={(l) => saved(l, true)}
            onCancel={() => closeForm([() => createButtonRef.current, headingRef.current])}
          />
        </div>
      ) : roles.length === 0 ? (
        <p className="text-sm text-gray-700">Ajoutez d&apos;abord des postes au planning pour créer un lien par groupe.</p>
      ) : (
        <button ref={createButtonRef} type="button" onClick={() => setEditing("new")} className={outlineButton}>
          Créer un lien pour un groupe
        </button>
      )}
    </div>
  )
}

/** Creation or edition of a link: its name, its roles (at least one) and the « complets » option. */
function GroupLinkForm({ eventId, roles, link, onSaved, onCancel }: {
  eventId: string
  roles: string[]
  link?: AdminGroupLink
  onSaved: (link: AdminGroupLink) => void
  onCancel: () => void
}) {
  const id = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const firstRoleRef = useRef<HTMLInputElement>(null)
  // A role of the link that is no longer on the planning is not offered again: it stays out.
  const [values, setValues] = useState<FormValues>({
    name: link?.name ?? "",
    roleNames: (link?.roleNames ?? []).filter((r) => roles.includes(r)),
    hideFull: link?.hideFull ?? false,
  })
  const { submit, busy, error, fail, isInvalid } = useSubmit()
  const errorId = `${id}-error`

  useLayoutEffect(() => {
    nameRef.current?.focus()
  }, [])

  function toggleRole(role: string, on: boolean) {
    setValues((v) => ({ ...v, roleNames: on ? roles.filter((r) => r === role || v.roleNames.includes(r)) : v.roleNames.filter((r) => r !== role) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.name.trim()) { fail(GROUP_LINK_NAME_REQUIRED, "name", nameRef.current); return }
    if (values.roleNames.length === 0) { fail(GROUP_LINK_ROLES_REQUIRED, "roles", firstRoleRef.current); return }
    const outcome = await submit<AdminGroupLink>(() => fetch(
      link ? `/api/admin/events/${eventId}/group-links/${link.id}` : `/api/admin/events/${eventId}/group-links`,
      {
        method: link ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: values.name.trim(), roleNames: values.roleNames, hideFull: values.hideFull }),
      },
    ), { silent: true })
    if (!outcome.ok) {
      if (!outcome.error) return // a second click while the first request runs
      // The server names the field; its name messages are these two, anything else is about the roles.
      const roleField = !GROUP_LINK_NAME_ERRORS.includes(outcome.error)
      const fieldError = outcome.status === 400 || outcome.status === 409
      fail(outcome.error, fieldError ? (roleField ? "roles" : "name") : undefined, fieldError ? (roleField ? firstRoleRef.current : nameRef.current) : null)
      return
    }
    onSaved(outcome.data)
  }

  const nameInvalid = isInvalid("name")
  const rolesInvalid = isInvalid("roles")

  return (
    <form onSubmit={handleSubmit} noValidate aria-label={link ? `Modifier le lien « ${link.name} »` : "Nouveau lien pour un groupe"} className="space-y-3">
      <div>
        <label htmlFor={`${id}-name`} className="block text-sm font-medium text-gray-700 mb-1">
          Nom du groupe <span aria-hidden="true">*</span>
        </label>
        <input
          ref={nameRef}
          id={`${id}-name`}
          type="text"
          required
          maxLength={GROUP_LINK_NAME_MAX}
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          aria-invalid={nameInvalid}
          aria-describedby={[`${id}-name-hint`, nameInvalid && errorId].filter(Boolean).join(" ")}
          className={`input w-full ${nameInvalid ? "!border-red-600" : ""}`}
        />
        <p id={`${id}-name-hint`} className="text-xs text-gray-600 mt-1">
          Par exemple « Amicale des pompiers ». Il s&apos;affiche sur la page du lien. {GROUP_LINK_NAME_MAX} caractères au plus.
        </p>
      </div>
      <fieldset
        aria-describedby={[`${id}-roles-hint`, rolesInvalid && errorId].filter(Boolean).join(" ")}
        className={`rounded-xl border p-2 -m-2 ${rolesInvalid ? "border-red-600" : "border-transparent"}`}
      >
        <legend className="block text-sm font-medium text-gray-700 mb-1">
          Postes affichés <span aria-hidden="true">*</span>
        </legend>
        <p id={`${id}-roles-hint`} className="text-xs text-gray-600 mb-1">Cochez au moins un poste.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {roles.map((role, i) => (
            <label key={role} className="inline-flex items-center gap-2 text-sm text-gray-800 min-h-9 cursor-pointer">
              <input
                ref={i === 0 ? firstRoleRef : undefined}
                type="checkbox"
                checked={values.roleNames.includes(role)}
                onChange={(e) => toggleRole(role, e.target.checked)}
                aria-invalid={rolesInvalid}
                // The focused box carries the message too: VoiceOver does not read the fieldset's.
                aria-describedby={i === 0 && rolesInvalid ? errorId : undefined}
                className="h-4 w-4 rounded border-gray-400"
              />
              {role}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="inline-flex items-center gap-2 text-sm text-gray-800 min-h-9 cursor-pointer">
          <input
            type="checkbox"
            checked={values.hideFull}
            onChange={(e) => setValues((v) => ({ ...v, hideFull: e.target.checked }))}
            aria-describedby={`${id}-full-hint`}
            className="h-4 w-4 rounded border-gray-400"
          />
          Masquer les créneaux complets
        </label>
        <p id={`${id}-full-hint`} className="text-xs text-gray-600">Les bénévoles ne voient que les créneaux où il reste de la place.</p>
      </div>
      <FormStatus error={error} errorId={errorId} />
      <p role="status" className="sr-only">{busy ? "Enregistrement en cours…" : ""}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={quietButton}>Annuler</button>
        <button
          type="submit"
          aria-disabled={busy || undefined}
          className="inline-flex items-center min-h-9 border border-transparent bg-blue-600 text-white px-4 py-1.5 rounded-xl text-sm font-medium hover:bg-blue-700 aria-disabled:opacity-50 aria-disabled:cursor-wait transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {busy ? "Enregistrement…" : link ? "Enregistrer" : "Créer le lien"}
        </button>
      </div>
    </form>
  )
}
