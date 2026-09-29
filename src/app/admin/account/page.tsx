// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/auth"
import ChangePasswordForm from "@/components/admin/ChangePasswordForm"

export const dynamic = "force-dynamic"

// The signed-in admin's own account, reached from the user menu in the top bar (it used to be a
// "Mon compte" block at the bottom of the organization settings). Super admins have their own
// profile page, which also lets them change their email.
export default async function AccountPage() {
  const session = await auth()
  if (!session) redirect("/admin/login")
  if (session.user?.role === "super_admin") redirect("/super-admin/profile")

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <Link href="/admin/events" className="text-sm text-blue-600">← Événements</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Mon compte</h1>
        <p className="text-sm text-gray-500">
          {session.user?.name} · {session.user?.email}
        </p>
      </div>

      <section aria-labelledby="password-heading" className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 id="password-heading" className="text-sm font-semibold text-gray-900 mb-4">Mot de passe</h2>
        <ChangePasswordForm />
      </section>
    </div>
  )
}
