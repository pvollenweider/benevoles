"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"

export default function SuperAdminNav({ userName }: { userName: string }) {
  const pathname = usePathname()

  return (
    <nav className="bg-purple-50 border-b border-purple-200 px-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link href="/super-admin/organizations" className="font-semibold text-purple-900 text-sm">
            ⚙ Super admin
          </Link>
          <Link
            href="/super-admin/organizations"
            className={`text-sm ${pathname.startsWith("/super-admin/organizations") ? "text-purple-700 font-medium" : "text-purple-500 hover:text-purple-800"}`}
          >
            Organisations
          </Link>
          <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-800">
            ↩ Vue admin
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-purple-500">{userName}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="text-xs text-purple-500 hover:text-purple-800"
          >
            Déconnexion
          </button>
        </div>
      </div>
    </nav>
  )
}
