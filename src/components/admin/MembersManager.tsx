"use client"

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
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

type SortCol = "firstName" | "lastName"
type SortDir = "asc" | "desc"

export default function MembersManager({ initialMembers, allTags }: Props) {
  const router = useRouter()
  const members = initialMembers
  const [search, setSearch] = useState("")
  const [tagFilter, setTagFilter] = useState<string>("")
  const [showInactive, setShowInactive] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [sortCol, setSortCol] = useState<SortCol | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [sortAnnouncement, setSortAnnouncement] = useState("")
  const [, startTransition] = useTransition()

  function toggleSort(col: SortCol) {
    let nextCol: SortCol | null = col
    let nextDir: SortDir = "asc"
    if (sortCol === col) {
      if (sortDir === "asc") nextDir = "desc"
      else { nextCol = null }
    }
    setSortCol(nextCol)
    setSortDir(nextDir)
    setSortAnnouncement(
      nextCol
        ? `Trié par ${nextCol === "firstName" ? "prénom" : "nom"}, ${nextDir === "asc" ? "croissant" : "décroissant"}`
        : "Tri réinitialisé"
    )
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = members.filter((m) => {
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
    if (!sortCol) return list
    return [...list].sort((a, b) => {
      const av = a[sortCol].toLowerCase()
      const bv = b[sortCol].toLowerCase()
      const cmp = av.localeCompare(bv, "fr")
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [members, search, tagFilter, showInactive, sortCol, sortDir])

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function deactivate(id: string, name: string) {
    if (!confirm(`Désactiver ${name} ?`)) return
    const res = await fetch(`/api/admin/members/${id}`, { method: "DELETE" })
    if (res.ok) refresh()
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
        members.length === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-50 mb-5">
              <svg aria-hidden="true" className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Aucun membre dans le pool</h2>
            <p className="text-sm text-gray-500 max-w-xs mx-auto mb-6">
              Ajoutez des bénévoles à votre pool pour les inviter à vos événements.
              Vous pouvez aussi importer un fichier CSV ou Excel.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-blue-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
              >
                Ajouter un membre
              </button>
              <Link
                href="/admin/members/import"
                className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-full hover:bg-gray-50 transition-colors"
              >
                Importer un fichier
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500 text-sm">
            Aucun membre ne correspond aux filtres.
          </div>
        )
      ) : (
        <>
        <div role="status" aria-live="polite" className="sr-only">{sortAnnouncement}</div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table aria-label="Liste des membres" className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <SortTh col="firstName" label="Prénom" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortTh col="lastName"  label="Nom"    sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <th scope="col" className="text-left px-4 py-2 font-medium">Contact</th>
                <th scope="col" className="text-left px-4 py-2 font-medium">Tags</th>
                <th scope="col" className="text-right px-4 py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className={`border-t border-gray-100 ${!m.active ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{m.firstName}</div>
                    {!m.active && <div className="text-xs text-gray-400">inactif</div>}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{m.lastName}</td>
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
                  <td className="px-4 py-3 text-right space-x-3">
                    <button
                      onClick={() => setEditingMember(m)}
                      aria-label={`Éditer ${m.firstName} ${m.lastName}`}
                      className="text-xs text-gray-500 hover:text-blue-600"
                    >
                      Éditer
                    </button>
                    {m.active && (
                      <button
                        onClick={() => deactivate(m.id, `${m.firstName} ${m.lastName}`)}
                        aria-label={`Désactiver ${m.firstName} ${m.lastName}`}
                        className="text-xs text-gray-500 hover:text-red-600"
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
        </>
      )}

      {showAdd && <AddMemberModal onClose={() => setShowAdd(false)} onCreated={refresh} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImported={refresh} />}
      {editingMember && (
        <EditMemberModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSaved={() => { setEditingMember(null); refresh() }}
        />
      )}
    </div>
  )
}

// ── Edit modal ────────────────────────────────────────────────────────────────

function EditMemberModal({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: () => void }) {
  const [firstName, setFirstName] = useState(member.firstName)
  const [lastName, setLastName] = useState(member.lastName)
  const [email, setEmail] = useState(member.email ?? "")
  const [phone, setPhone] = useState(member.phone ?? "")
  const [tags, setTags] = useState(member.tags.join(", "))
  const [notes, setNotes] = useState(member.notes ?? "")
  const [active, setActive] = useState(member.active)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const activeId = useId()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const res = await fetch(`/api/admin/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email: email || undefined,
        phone: phone || undefined,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        notes: notes || undefined,
        active,
      }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Erreur lors de la mise à jour")
      return
    }
    onSaved()
  }

  return (
    <ModalShell title="Modifier le membre" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-gray-500">* champ obligatoire</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom" required value={firstName} onChange={setFirstName} />
          <Field label="Nom" required value={lastName} onChange={setLastName} />
        </div>
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Téléphone" value={phone} onChange={setPhone} />
        <Field label="Tags (séparés par des virgules)" value={tags} onChange={setTags} placeholder="bénévole, bar" />
        <Field label="Notes" value={notes} onChange={setNotes} multiline />
        <div className="flex items-center gap-2">
          <input
            id={activeId}
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <label htmlFor={activeId} className="text-sm text-gray-700">Membre actif</label>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900">
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Add modal ─────────────────────────────────────────────────────────────────

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
        <p className="text-xs text-gray-500">* champ obligatoire</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom" required value={firstName} onChange={setFirstName} />
          <Field label="Nom" required value={lastName} onChange={setLastName} />
        </div>
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Téléphone" value={phone} onChange={setPhone} />
        <Field label="Tags (séparés par des virgules)" value={tags} onChange={setTags} placeholder="parent CM2, bar" />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
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

// ── Import modal ──────────────────────────────────────────────────────────────

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
                <input type="radio" checked={onDuplicate === "skip"} onChange={() => setOnDuplicate("skip")} />
                Ignorer
              </label>
              <label className="text-sm text-gray-700 flex items-center gap-1.5">
                <input type="radio" checked={onDuplicate === "update"} onChange={() => setOnDuplicate("update")} />
                Mettre à jour
              </label>
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
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
                  <li key={i}>{e.line > 0 ? `Ligne ${e.line} : ` : ""}{e.reason}</li>
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
              onClick={() => { onImported(); onClose() }}
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

// ── ModalShell ────────────────────────────────────────────────────────────────

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return

    const focusableSelectors =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

    const getFocusable = () => [...el.querySelectorAll<HTMLElement>(focusableSelectors)]

    // Move focus into modal on open
    getFocusable()[0]?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return }
      if (e.key !== "Tab") return

      const els = getFocusable()
      if (!els.length) return
      const first = els[0]
      const last = els[els.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="bg-white rounded-2xl p-5 max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="modal-title" className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-gray-500 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── SortTh ───────────────────────────────────────────────────────────────────

function SortTh({
  col, label, sortCol, sortDir, onSort,
}: {
  col: SortCol
  label: string
  sortCol: SortCol | null
  sortDir: SortDir
  onSort: (col: SortCol) => void
}) {
  const active = sortCol === col
  const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
  const icon = active ? (sortDir === "asc" ? "↑" : "↓") : "↕"

  return (
    <th scope="col" aria-sort={ariaSort} className="text-left px-4 py-2 font-medium">
      <button
        type="button"
        onClick={() => onSort(col)}
        className="flex items-center gap-1 text-xs text-gray-500 uppercase tracking-wide font-medium hover:text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded"
      >
        {label}
        <span aria-hidden="true" className={active ? "text-blue-600" : "text-gray-300"}>{icon}</span>
      </button>
    </th>
  )
}

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  placeholder?: string
  multiline?: boolean
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-gray-700 mb-1">
        {label}{required && " *"}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
      )}
    </div>
  )
}
