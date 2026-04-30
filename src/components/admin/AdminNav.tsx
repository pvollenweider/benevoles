"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"

export default function AdminNav({ userName }: { userName: string }) {
  const pathname = usePathname()

  return (
    <nav className="bg-white border-b border-gray-200 px-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link href="/admin/events" className="font-semibold text-gray-900 text-sm">
            🗂 Admin
          </Link>
          <Link
            href="/admin/events"
            className={`text-sm ${pathname.startsWith("/admin/events") ? "text-blue-600 font-medium" : "text-gray-500 hover:text-gray-800"}`}
          >
            Événements
          </Link>
          <Link
            href="/admin/members"
            className={`text-sm ${pathname.startsWith("/admin/members") ? "text-blue-600 font-medium" : "text-gray-500 hover:text-gray-800"}`}
          >
            Membres
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-400">{userName}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="text-xs text-gray-500 hover:text-gray-800"
          >
            Déconnexion
          </button>
        </div>
      </div>
    </nav>
  )
}
