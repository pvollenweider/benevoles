import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import NewOrganizationForm from "@/components/admin/NewOrganizationForm"

export const dynamic = "force-dynamic"

export default async function NewOrganizationPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== "super_admin") redirect("/admin")

  return (
    <div className="max-w-xl space-y-5">
      <Link href="/super-admin/organizations" className="text-sm text-purple-600">← Retour</Link>
      <h1 className="text-xl font-bold text-gray-900">Nouvelle organisation</h1>
      <NewOrganizationForm />
    </div>
  )
}
