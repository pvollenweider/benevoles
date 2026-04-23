"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

export default function DuplicateButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDuplicate() {
    if (!confirm("Dupliquer cet événement (brouillon) avec tous ses créneaux ?")) return
    setLoading(true)
    const res = await fetch(`/api/admin/events/${eventId}/duplicate`, { method: "POST" })
    if (res.ok) {
      const data = await res.json()
      router.push(`/admin/events/${data.id}`)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <button
      onClick={handleDuplicate}
      disabled={loading}
      className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
    >
      {loading ? "…" : "Dupliquer"}
    </button>
  )
}
