"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import StatusBadge from "../StatusBadge"
import { contactPhone } from "@/lib/contact-phone"
import { workloadMessage, type WorkloadWarning } from "@/lib/workload"
import { availabilityLabel, hasAvailability } from "@/lib/availability"
import { spokenShortWhen } from "@/lib/spoken-time"
import { personName, shiftName, shiftSpoken, type Registration } from "./types"

const sourceLabels: Record<string, string> = {
  public_form: "Formulaire",
  admin_manual: "Manuel",
}

type Props = {
  reg: Registration
  selected: boolean
  onToggleSelected: () => void
  /** Opens the confirmation of the accept or refuse decision on a request (#484). */
  onDecision: (kind: "accept" | "refuse") => void
  /** Answers to the event's custom questions (#483) of this volunteer. */
  answers: { label: string; text: string }[]
  /** Workload warnings (#465) of this volunteer. */
  workload: WorkloadWarning[]
}

// ── One row of the registrations table ──────────────────────────────────────
export default function RegistrationRow({ reg, selected, onToggleSelected, onDecision, answers, workload }: Props) {
  return (
    <tr className={`hover:bg-gray-50 ${selected ? "bg-blue-50/60" : ""}`}>
      <td className="px-4 py-3">
        <label className="sr-only" htmlFor={`reg-select-${reg.id}`}>
          {/* The shift and time tell apart two rows of the same person (#582). */}
          Sélectionner l&apos;inscription de {personName(reg)}, {shiftSpoken(reg)}
        </label>
        <input
          id={`reg-select-${reg.id}`}
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          className="rounded border-gray-300"
        />
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-gray-900 flex items-center gap-1.5">
          {reg.volunteer.firstName} {reg.volunteer.lastName}
          {reg.isLeader && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
              {/* The role in words, not in a title only a mouse can show (#582). */}
              Responsable<span className="sr-only"> du poste {reg.shift.roleName}</span>
            </span>
          )}
          {reg.checkedInAt && reg.status === "active" && (
            <span className="inline-flex items-center rounded-full bg-green-50 px-1.5 py-0.5 text-xs font-semibold text-green-800">
              <span aria-hidden="true">✓ </span>Présent<span className="sr-only"> depuis {new Date(reg.checkedInAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
            </span>
          )}
        </p>
        <p className="text-xs text-gray-500">{reg.volunteer.email}</p>
        {reg.status === "requested" && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Demande à traiter</span>
            <button
              type="button"
              data-decision-accept=""
              onClick={() => onDecision("accept")}
              className="text-xs font-medium text-white bg-green-700 hover:bg-green-800 rounded-full px-3 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
            >
              Accepter{" "}<span className="sr-only">la demande de {personName(reg)} pour {shiftSpoken(reg)}</span>
            </button>
            <button
              type="button"
              onClick={() => onDecision("refuse")}
              className="text-xs font-medium text-red-800 border border-red-300 bg-white hover:bg-red-50 rounded-full px-3 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            >
              Refuser{" "}<span className="sr-only">la demande de {personName(reg)} pour {shiftSpoken(reg)}</span>
            </button>
          </div>
        )}
        {answers.length > 0 && (
          <ul role="list" className="text-xs text-gray-700 mt-0.5">
            {answers.map((a) => <li key={a.label}><span className="text-gray-600">{a.label} :</span> {a.text}</li>)}
          </ul>
        )}
        {reg.status === "active" && workload.filter((w) => w.shiftIds.includes(reg.shift.id)).map((w) => (
          <p key={`${w.kind}-${w.day}`} className="text-xs text-amber-900 mt-0.5"><span className="font-semibold">Charge élevée :</span> {workloadMessage(w)}</p>
        ))}
        {contactPhone(reg) && <p className="text-xs text-gray-500">{contactPhone(reg)}</p>}
        {hasAvailability(reg.volunteer) && <p className="text-xs text-gray-700"><span className="sr-only">Disponible : </span><span aria-hidden="true">🕒 </span>{availabilityLabel(reg.volunteer)}</p>}
        {reg.comment && <p className="text-xs text-gray-500 italic mt-0.5">"{reg.comment}"</p>}
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        {/* In words, as read aloud: no « · » nor en dash (#582). */}
        <p className="text-gray-700">{shiftName(reg)}</p>
        <p className="text-xs text-gray-500">{spokenShortWhen(reg.shift)}</p>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <span className="text-xs text-gray-500">{sourceLabels[reg.source] ?? reg.source}</span>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        {reg.status === "requested"
          ? <span className="text-xs text-amber-900">Demande à traiter</span>
          : reg.status !== "active" && <StatusBadge status={reg.status} />}
        {reg.status === "waiting" && reg.waitingPosition != null && (
          <span className="ml-1 text-xs text-gray-500">position {reg.waitingPosition}</span>
        )}
      </td>
    </tr>
  )
}
