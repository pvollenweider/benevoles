"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { fmtRange } from "@/lib/gantt-utils"
import { slugify } from "@/lib/utils"
import PublicFooter from "@/components/PublicFooter"

type RegistrationItem = {
  id: string
  status: string
  comment: string | null
  volunteer: { firstName: string; lastName: string; email: string; phone: string }
  shift: { label: string; date: string; startTime: string; endTime: string }
}

type PageData = {
  event: { title: string; slug: string }
  roleName: string
  leaderName: string
  registrations: RegistrationItem[]
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
    const key = `${reg.shift.label}__${reg.shift.date}__${reg.shift.startTime}`
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

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-lg mx-auto space-y-4">
        <div>
          <p className="text-sm text-gray-500">{data.event.title}</p>
          <h1 className="text-xl font-bold text-gray-900">Responsable · {data.roleName}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {data.registrations.length} bénévole{data.registrations.length > 1 ? "s" : ""} inscrit{data.registrations.length > 1 ? "s" : ""}
          </p>
        </div>

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
                  <p className="text-xs text-gray-500 mt-0.5 mb-3">{date} · {fmtRange(group.startTime, group.endTime)}</p>
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
      <PublicFooter />
    </main>
  )
}
