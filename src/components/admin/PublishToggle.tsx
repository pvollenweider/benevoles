"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function PublishToggle({ eventId, currentStatus }: { eventId: string; currentStatus: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function toggle() {
    const newStatus = currentStatus === "published" ? "draft" : "published"
    setLoading(true)
    await fetch(`/api/admin/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicStatus: newStatus }),
    })
    setLoading(false)
    router.refresh()
  }

  const isPublished = currentStatus === "published"

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
        isPublished
          ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
          : "bg-green-100 text-green-700 hover:bg-green-200"
      }`}
    >
      {loading ? "…" : isPublished ? "Dépublier" : "Publier"}
    </button>
  )
}
