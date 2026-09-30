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
        <a href="/api/admin/settings/activity/export" download className="inline-block mt-2 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          Exporter tout le journal (CSV)<span className="sr-only"> (télécharge un fichier)</span>
        </a>
        <p className="text-sm text-gray-500">
          Membres et comptes admin créés, modifiés ou retirés — indépendant du journal par événement.
        </p>
      </div>

      <ActivityLog />
    </div>
  )
}
