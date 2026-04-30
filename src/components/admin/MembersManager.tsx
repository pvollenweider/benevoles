"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

type Member = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  tags: string[]
  active: boolean
  notes: string | null
}

type Props = {
  initialMembers: Member[]
  allTags: string[]
}

export default function MembersManager({ initialMembers, allTags }: Props) {
  const router = useRouter()
  const [members, setMembers] = useState(initialMembers)
  const [search, setSearch] = useState("")
  const [tagFilter, setTagFilter] = useState<string>("")
  const [showInactive, setShowInactive] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members.filter((m) => {
      if (!showInactive && !m.active) return false
      if (tagFilter && !m.tags.includes(tagFilter)) return false
      if (!q) return true
      return (
        m.firstName.toLowerCase().includes(q) ||
        m.lastName.toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q) ||
        (m.phone ?? "").toLowerCase().includes(q)
      )
    })
  }, [members, search, tagFilter, showInactive])

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function deactivate(id: string) {
    if (!confirm("Désactiver ce membre ?")) return
    const res = await fetch(`/api/admin/members/${id}`, { method: "DELETE" })
    if (res.ok) {
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, active: false } : m)))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Membres</h1>
          <p className="text-sm text-gray-500">{members.length} membre{members.length > 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            Importer CSV/Excel
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            + Nouveau membre
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher (nom, email, téléphone)…"
          className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">Tous les tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="text-sm text-gray-600 flex items-center gap-1.5">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Inclure inactifs
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {members.length === 0
            ? "Aucun membre. Ajoute-en un ou importe ton fichier Excel."
            : "Aucun membre ne correspond aux filtres."}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Nom</th>
                <th className="text-left px-4 py-2 font-medium">Contact</th>
                <th className="text-left px-4 py-2 font-medium">Tags</th>
                <th className="text-right px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className={`border-t border-gray-100 ${!m.active ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{m.firstName} {m.lastName}</div>
                    {!m.active && <div className="text-xs text-gray-400">inactif</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {m.email && <div className="text-xs">{m.email}</div>}
                    {m.phone && <div className="text-xs text-gray-400">{m.phone}</div>}
                    {!m.email && !m.phone && <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {m.tags.map((t) => (
                        <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.active && (
                      <button
                        onClick={() => deactivate(m.id)}
                        className="text-xs text-gray-400 hover:text-red-600"
                      >
                        Désactiver
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddMemberModal onClose={() => setShowAdd(false)} onCreated={refresh} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImported={refresh} />}
    </div>
  )
}

function AddMemberModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [tags, setTags] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const res = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email: email || undefined,
        phone: phone || undefined,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Erreur lors de la création")
      return
    }
    onCreated()
    onClose()
  }

  return (
    <ModalShell title="Nouveau membre" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom" required value={firstName} onChange={setFirstName} />
          <Field label="Nom" required value={lastName} onChange={setLastName} />
        </div>
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Téléphone" value={phone} onChange={setPhone} />
        <Field label="Tags (séparés par des virgules)" value={tags} onChange={setTags} placeholder="parent CM2, bar" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900">
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "…" : "Créer"}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [onDuplicate, setOnDuplicate] = useState<"skip" | "update">("skip")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{
    created: number
    updated: number
    skipped: number
    errors: { line: number; reason: string }[]
    detectedColumns: Record<string, string | null>
    totalParsed: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setSubmitting(true)
    setError(null)
    const fd = new FormData()
    fd.append("file", file)
    fd.append("onDuplicate", onDuplicate)
    const res = await fetch("/api/admin/members/import", { method: "POST", body: fd })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Erreur lors de l'import")
      return
    }
    const data = await res.json()
    setResult(data)
  }

  return (
    <ModalShell title="Importer des membres" onClose={onClose}>
      {!result ? (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Fichier CSV ou Excel</label>
            <input
              type="file"
              accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
              className="text-sm w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              Colonnes attendues : prénom, nom, email, téléphone, tags. Les variantes courantes sont reconnues.
            </p>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Si un email existe déjà</label>
            <div className="flex gap-3">
              <label className="text-sm text-gray-700 flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={onDuplicate === "skip"}
                  onChange={() => setOnDuplicate("skip")}
                />
                Ignorer
              </label>
              <label className="text-sm text-gray-700 flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={onDuplicate === "update"}
                  onChange={() => setOnDuplicate("update")}
                />
                Mettre à jour
              </label>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900">
              Annuler
            </button>
            <button
              type="submit"
              disabled={!file || submitting}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Import en cours…" : "Importer"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
            <strong>{result.created}</strong> créés, <strong>{result.updated}</strong> mis à jour, <strong>{result.skipped}</strong> ignorés ({result.totalParsed} lignes lues)
          </div>
          {result.errors.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-800">
              <p className="font-medium mb-2">{result.errors.length} ligne{result.errors.length > 1 ? "s" : ""} ignorée{result.errors.length > 1 ? "s" : ""} :</p>
              <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    {e.line > 0 ? `Ligne ${e.line} : ` : ""}
                    {e.reason}
                  </li>
                ))}
                {result.errors.length > 50 && <li>… et {result.errors.length - 50} autres</li>}
              </ul>
            </div>
          )}
          <div className="text-xs text-gray-500">
            Colonnes détectées :
            {Object.entries(result.detectedColumns).map(([k, v]) => (
              <span key={k} className="ml-2">{k} → {v ?? "—"}</span>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => {
                onImported()
                onClose()
              }}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm text-gray-700 mb-1">{label}{required && " *"}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
      />
    </div>
  )
}
