"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"

export default function AdminNav({ userName, role, orgName }: { userName: string; role?: string; orgName?: string }) {
  const pathname = usePathname()
  const isSuperAdmin = role === "super_admin"

  return (
    <nav className="bg-white border-b border-gray-200 px-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link href="/admin/events" className="font-semibold text-gray-900 text-sm">
            {orgName ?? "Admin"}
          </Link>
          <Link
            href="/admin/dashboard"
            className={`text-sm ${pathname.startsWith("/admin/dashboard") ? "text-blue-600 font-medium" : "text-gray-500 hover:text-gray-800"}`}
          >
            Tableau de bord
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
          <Link
            href="/admin/settings/admins"
            className={`text-sm ${pathname.startsWith("/admin/settings") ? "text-blue-600 font-medium" : "text-gray-500 hover:text-gray-800"}`}
          >
            Paramètres
          </Link>
          {isSuperAdmin && (
            <>
              <span className="text-gray-200 select-none">|</span>
              <Link
                href="/super-admin/organizations"
                className={`text-sm ${pathname.startsWith("/super-admin") ? "text-purple-600 font-medium" : "text-purple-400 hover:text-purple-700"}`}
              >
                Organisations
              </Link>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          {isSuperAdmin && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
              Super Admin
            </span>
          )}
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
