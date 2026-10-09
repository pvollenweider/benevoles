"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { NETWORK_ERROR, useSubmit } from "@/lib/use-submit"
import { announce } from "@/lib/announce"
import FormStatus from "@/components/FormStatus"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { IP_DEFAULT_DAYS, IP_MAX_DAYS, REASON_MAX, type BlockKind } from "@/lib/signup-blocklist"

type Block = { id: string; kind: string; label: string; reason: string; expiresAt: string | null; createdAt: string }

const KIND_LABELS: Record<BlockKind, string> = { email: "Adresse email", domain: "Domaine", ip: "Adresse IP" }
const VALUE_LABELS: Record<BlockKind, string> = { email: "Adresse email à bloquer", domain: "Domaine à bloquer", ip: "Adresse IP à bloquer" }
const inputClass = "w-full rounded-xl border border-gray-500 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const when = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })

/**
 * Block list of the self-service sign-up (#810, part 5): add an address, a domain (a common mail
 * provider asks for a confirmation) or an IP (with its expiry), each with a reason; remove one.
 * Forms pattern of the project (useSubmit, FormStatus): the field in error is marked and focused.
 */
export default function BlocklistManager({ initialBlocks }: { initialBlocks: Block[] }) {
  const id = useId()
  const valueRef = useRef<HTMLInputElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const daysRef = useRef<HTMLInputElement>(null)
  const firstKindRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const listHeadingRef = useRef<HTMLHeadingElement>(null)
  const removeButtons = useRef(new Map<string, HTMLButtonElement>())
  const [adding, setAdding] = useState(false)
  const [blocks, setBlocks] = useState(initialBlocks)
  const [kind, setKind] = useState<BlockKind>("email")
  const [value, setValue] = useState("")
  const [reason, setReason] = useState("")
  const [days, setDays] = useState(String(IP_DEFAULT_DAYS))
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [confirmCommon, setConfirmCommon] = useState(false)
  const [outcome, setOutcome] = useState("")
  const [removing, setRemoving] = useState<Block | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const { error, fail, isInvalid } = useSubmit()
  const busy = adding

  // The confirmation box appears after the server refuses a common provider: it takes the focus.
  useEffect(() => { if (needsConfirmation) confirmRef.current?.focus() }, [needsConfirmation])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (adding) return
    setAdding(true)
    const res = await fetch("/api/super-admin/blocklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, value, reason, days: kind === "ip" ? days : undefined, confirmCommonProvider: confirmCommon }),
    }).catch(() => null)
    setAdding(false)
    if (!res) { fail(NETWORK_ERROR); return }
    const data = await res.json().catch(() => ({})) as Partial<Block> & { error?: string; field?: string; needsConfirmation?: boolean }
    if (!res.ok) {
      // The server names the field in error; a common provider shows the confirmation box.
      const message = data.error ?? "L'entrée n'a pas été ajoutée."
      if (data.needsConfirmation) {
        fail(message, "value")
        setNeedsConfirmation(true)
        return
      }
      const el = data.field === "reason" ? reasonRef.current : data.field === "days" ? daysRef.current : data.field === "kind" ? firstKindRef.current : valueRef.current
      fail(message, data.field ?? "value", el)
      return
    }
    const added = data as Block
    setBlocks((list) => [added, ...list.filter((b) => b.id !== added.id)])
    setValue("")
    setReason("")
    setNeedsConfirmation(false)
    setConfirmCommon(false)
    announce(setOutcome, `${added.label} ajouté à la liste de blocage.`)
  }

  async function remove(block: Block) {
    setRemoveBusy(true)
    setRemoveError(null)
    const res = await fetch(`/api/super-admin/blocklist/${block.id}`, { method: "DELETE" }).catch(() => null)
    setRemoveBusy(false)
    if (!res || !res.ok) { setRemoveError("Le retrait n'a pas été enregistré. Réessayez."); return }
    // The removed row's button disappears: focus goes to the next « Retirer », else the previous
    // one, else the list's heading, never lost on <body>.
    const index = blocks.findIndex((b) => b.id === block.id)
    const neighbour = blocks[index + 1] ?? blocks[index - 1]
    flushSync(() => {
      setBlocks((list) => list.filter((b) => b.id !== block.id))
      setRemoving(null)
    })
    const target = neighbour ? removeButtons.current.get(neighbour.id) : null
    if (target) target.focus()
    else listHeadingRef.current?.focus()
    announce(setOutcome, `${block.label} retiré de la liste de blocage.`)
  }

  return (
    <div className="space-y-6">
      <p role="status" className={outcome ? "text-sm text-gray-800 bg-green-50 border border-green-200 rounded-xl px-3 py-2" : "sr-only"}>{outcome}</p>

      <form onSubmit={add} noValidate className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Bloquer</h2>
        <fieldset>
          <legend className="text-sm font-medium text-gray-900">Ce qui est bloqué</legend>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            {(Object.keys(KIND_LABELS) as BlockKind[]).map((k, i) => (
              <label key={k} className="inline-flex items-center gap-2 text-sm text-gray-900 min-h-6">
                <input ref={i === 0 ? firstKindRef : undefined} type="radio" name={`${id}-kind`} value={k} checked={kind === k} onChange={() => { setKind(k); setNeedsConfirmation(false); setConfirmCommon(false) }} className="h-4 w-4" />
                {KIND_LABELS[k]}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={`${id}-value`} className="block text-sm font-medium text-gray-900 mb-1">{VALUE_LABELS[kind]}</label>
          {kind === "domain" && <p id={`${id}-domain-hint`} className="text-xs text-gray-700 mb-1">À utiliser exceptionnellement : un domaine bloque toutes les adresses qui l&apos;utilisent.</p>}
          <input id={`${id}-value`} ref={valueRef} value={value} onChange={(e) => { setValue(e.target.value); setNeedsConfirmation(false); setConfirmCommon(false) }} required autoComplete="off"
            aria-invalid={isInvalid("value")} aria-describedby={[kind === "domain" ? `${id}-domain-hint` : null, isInvalid("value") ? `${id}-error` : null].filter(Boolean).join(" ") || undefined}
            className={inputClass} />
        </div>
        {kind === "domain" && needsConfirmation && (
          <label className="flex items-start gap-2 text-sm text-gray-900">
            <input ref={confirmRef} type="checkbox" checked={confirmCommon} onChange={(e) => setConfirmCommon(e.target.checked)} aria-describedby={error ? `${id}-error` : undefined} className="mt-0.5 h-4 w-4" />
            Je confirme vouloir bloquer ce domaine, utilisé par beaucoup de personnes.
          </label>
        )}
        {kind === "ip" && (
          <div>
            <label htmlFor={`${id}-days`} className="block text-sm font-medium text-gray-900 mb-1">Durée du blocage, en jours</label>
            <p id={`${id}-days-hint`} className="text-xs text-gray-700 mb-1">De 1 à {IP_MAX_DAYS} jours : une adresse IP est souvent partagée (école, café, opérateur mobile).</p>
            <input id={`${id}-days`} ref={daysRef} type="number" inputMode="numeric" min={1} max={IP_MAX_DAYS} value={days} onChange={(e) => setDays(e.target.value)}
              aria-invalid={isInvalid("days")} aria-describedby={[`${id}-days-hint`, isInvalid("days") ? `${id}-error` : null].filter(Boolean).join(" ")}
              className={`${inputClass} max-w-[8rem]`} />
          </div>
        )}
        <div>
          <label htmlFor={`${id}-reason`} className="block text-sm font-medium text-gray-900 mb-1">Raison</label>
          <textarea id={`${id}-reason`} ref={reasonRef} value={reason} onChange={(e) => setReason(e.target.value)} required rows={2} maxLength={REASON_MAX}
            aria-invalid={isInvalid("reason")} aria-describedby={isInvalid("reason") ? `${id}-error` : undefined} className={inputClass} />
        </div>
        <FormStatus error={error} errorId={`${id}-error`} />
        <button type="submit" aria-disabled={busy || undefined}
          className={`rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${busy ? "cursor-wait opacity-80" : ""}`}>
          {busy ? "Ajout…" : "Ajouter à la liste"}
        </button>
      </form>

      <section aria-labelledby={`${id}-list`} className="space-y-2">
        <h2 id={`${id}-list`} ref={listHeadingRef} tabIndex={-1} className="text-base font-semibold text-gray-900 focus:outline-none">Entrées</h2>
        {blocks.length === 0 ? (
          <p className="text-sm text-gray-700">Aucune entrée.</p>
        ) : (
          <div tabIndex={0} role="region" aria-label="Entrées de la liste de blocage" className="bg-white border border-gray-200 rounded-2xl overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            <table className="w-full text-sm">
              <caption className="sr-only">Entrées de la liste de blocage, de la plus récente à la plus ancienne</caption>
              <thead className="bg-gray-50 text-left text-gray-700">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Bloqué</th>
                  <th scope="col" className="px-4 py-2 font-medium">Type</th>
                  <th scope="col" className="px-4 py-2 font-medium">Raison</th>
                  <th scope="col" className="px-4 py-2 font-medium">Jusqu&apos;au</th>
                  <th scope="col" className="px-4 py-2 font-medium"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {blocks.map((b) => (
                  <tr key={b.id}>
                    <th scope="row" className="px-4 py-2 text-left font-normal text-gray-900 break-all">{b.label}</th>
                    <td className="px-4 py-2 text-gray-800">{KIND_LABELS[b.kind as BlockKind] ?? b.kind}</td>
                    <td className="px-4 py-2 text-gray-800 break-words">{b.reason}</td>
                    <td className="px-4 py-2 text-gray-800 whitespace-nowrap">{b.expiresAt ? when(b.expiresAt) : "Sans limite"}</td>
                    <td className="px-4 py-2 text-right">
                      <button type="button" ref={(el) => { if (el) removeButtons.current.set(b.id, el); else removeButtons.current.delete(b.id) }} onClick={() => { setRemoveError(null); setRemoving(b) }}
                        aria-label={`Retirer ${b.label}`}
                        className="inline-flex items-center min-h-6 px-1 text-sm text-red-700 underline underline-offset-2 hover:text-red-800 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {removing && (
        <ConfirmActionModal
          recap={{ title: `Retirer « ${removing.label} » de la liste de blocage ?`, lines: ["Les inscriptions correspondantes seront de nouveau acceptées.", "Aucun email n'est envoyé."], confirmLabel: "Retirer", danger: false }}
          busy={removeBusy}
          error={removeError}
          onConfirm={() => void remove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  )
}
