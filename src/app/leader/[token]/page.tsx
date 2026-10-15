"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { fmtRange } from "@/lib/gantt-utils"
import { slugify } from "@/lib/utils"
import PublicFooter from "@/components/PublicFooter"
import { orgPageFooterSite } from "@/lib/urls"
import { spokenStaffingState, staffingStateText, type StaffingState } from "@/lib/staffing"

type RegistrationItem = {
  id: string
  status: string
  comment: string | null
  volunteer: { firstName: string; lastName: string; email: string; phone: string }
  shift: { label: string; date: string; startTime: string; endTime: string }
}

/** A shift of the role with a minimum of people (#949) and where it stands. */
type StaffingItem = {
  label: string; date: string; startTime: string; endTime: string
  capacity: number; minVolunteers: number; active: number; state: StaffingState
}

type PageData = {
  event: { title: string; slug: string }
  roleName: string
  leaderName: string
  registrations: RegistrationItem[]
  staffing?: StaffingItem[]
}

const shiftKey = (s: { label: string; date: string; startTime: string }) => `${s.label}__${s.date}__${s.startTime}`

/** « 2/4 · minimum atteint », « 1/4 · sous le minimum (2) » (#949), read « 2 inscrits sur 4, minimum atteint ». */
function StaffingLine({ s }: { s: StaffingItem }) {
  const text = staffingStateText(s, s.state)
  if (!text) return null
  const below = s.state === "below_minimum"
  return (
    <p className={`text-xs mt-0.5 ${below ? "font-semibold text-red-800" : "text-gray-700"}`}>
      <span aria-hidden="true">{below ? "⚠ " : ""}{s.active}/{s.capacity} · {text}</span>
      <span className="sr-only">{s.active} inscrit{s.active > 1 ? "s" : ""} sur {s.capacity}, {spokenStaffingState(s, s.state)}</span>
    </p>
  )
}

type ShiftGroup = {
  key: string
  label: string
  date: string
  startTime: string
  endTime: string
  registrations: RegistrationItem[]
}

function groupByShift(registrations: RegistrationItem[]): ShiftGroup[] {
  const groups = new Map<string, ShiftGroup>()
  for (const reg of registrations) {
    const key = shiftKey(reg.shift)
    let group = groups.get(key)
    if (!group) {
      group = { key, label: reg.shift.label, date: reg.shift.date, startTime: reg.shift.startTime, endTime: reg.shift.endTime, registrations: [] }
      groups.set(key, group)
    }
    group.registrations.push(reg)
  }
  return Array.from(groups.values())
}

export default function SectorLeaderPage() {
  const params = useParams()
  const token = params.token as string

  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/public/leader/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setData(d)
        setLoading(false)
      })
      .catch(() => {
        setError("Une erreur est survenue.")
        setLoading(false)
      })
  }, [token])

  useEffect(() => {
    if (data) document.title = `Responsable · ${data.roleName} — Bénévoles`
  }, [data])

  if (loading) return <div role="status" className="flex items-center justify-center min-h-screen text-gray-500">Chargement…</div>

  if (error || !data) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <h1 className="text-lg font-semibold text-gray-700 mb-2">Lien introuvable</h1>
          <p className="text-sm text-gray-500">{error ?? "Ce lien n'est plus valide."}</p>
        </div>
      </main>
    )
  }

  const groups = groupByShift(data.registrations)
  const staffingByKey = new Map((data.staffing ?? []).map((s) => [shiftKey(s), s]))
  const belowMinimum = (data.staffing ?? []).filter((s) => s.state === "below_minimum")

  return (
    <>
    <main className="flex-1 bg-gray-50 px-4 py-10">
      <div className="max-w-lg mx-auto space-y-4">
        <div>
          <p className="text-sm text-gray-500">{data.event.title}</p>
          <h1 className="text-xl font-bold text-gray-900">Responsable · {data.roleName}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {data.registrations.length} bénévole{data.registrations.length > 1 ? "s" : ""} inscrit{data.registrations.length > 1 ? "s" : ""}
          </p>
        </div>

        {/* Shifts below their minimum (#949), those without anyone included: what to fill first. */}
        {belowMinimum.length > 0 && (
          <section aria-labelledby="below-minimum-heading" className="bg-white rounded-xl border border-red-200 p-4">
            <h2 id="below-minimum-heading" className="font-medium text-gray-900 text-sm">
              <span aria-hidden="true">⚠ </span>{belowMinimum.length > 1 ? `${belowMinimum.length} créneaux sous leur minimum` : "1 créneau sous son minimum"}
            </h2>
            <p className="text-xs text-gray-600 mt-0.5">Sous ce nombre de personnes, le créneau ne peut pas tourner.</p>
            <ul role="list" className="mt-2 space-y-1 text-sm text-gray-900">
              {belowMinimum.map((s) => (
                <li key={shiftKey(s)}>
                  {s.label}, {new Date(s.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · {fmtRange(s.startTime, s.endTime)}
                  <StaffingLine s={s} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {groups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500 text-sm">
            Personne n&apos;est encore inscrit·e sur ce poste.
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const date = new Date(group.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
              // Shift labels are free text — HTML ids can't contain whitespace, hence slugify().
              const headingId = `shift-${slugify(group.key) || "creneau"}`
              return (
                <section key={group.key} className="bg-white rounded-xl border border-gray-200 p-4" aria-labelledby={headingId}>
                  <h2 id={headingId} className="font-medium text-gray-900 text-sm">{group.label}</h2>
                  <p className={`text-xs text-gray-500 mt-0.5 ${staffingByKey.has(group.key) ? "" : "mb-3"}`}>{date} · {fmtRange(group.startTime, group.endTime)}</p>
                  {staffingByKey.has(group.key) && <div className="mb-3"><StaffingLine s={staffingByKey.get(group.key)!} /></div>}
                  <ul className="space-y-2" role="list">
                    {group.registrations.map((reg) => (
                      <li key={reg.id} className="border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-gray-900">{reg.volunteer.firstName} {reg.volunteer.lastName}</span>
                          {reg.status === "waiting" && (
                            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 flex-shrink-0">Liste d&apos;attente</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                          <a href={`mailto:${reg.volunteer.email}`} className="hover:text-blue-600 underline-offset-2 hover:underline">{reg.volunteer.email}</a>
                          {reg.volunteer.phone && (
                            <a href={`tel:${reg.volunteer.phone}`} className="hover:text-blue-600 underline-offset-2 hover:underline">{reg.volunteer.phone}</a>
                          )}
                        </div>
                        {reg.comment && <p className="text-xs text-gray-600 mt-1 italic">{reg.comment}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </main>
    {/* After </main>: a footer inside main loses its contentinfo role. */}
    <div className="px-4"><PublicFooter site={orgPageFooterSite()} /></div>
    </>
  )
}
