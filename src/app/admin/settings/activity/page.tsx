import { redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import ActivityLog from "@/components/admin/ActivityLog"

export const dynamic = "force-dynamic"

export default async function ActivityPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/settings/admins" className="text-sm text-blue-600">← Paramètres</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Journal d&apos;activité</h1>
        <p className="text-sm text-gray-500">
          Membres et comptes admin créés, modifiés ou retirés — indépendant du journal par événement.
        </p>
      </div>

      <ActivityLog />
    </div>
  )
}
