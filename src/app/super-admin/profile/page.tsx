import { auth } from "@/auth"
import { redirect } from "next/navigation"
import ProfileForm from "./ProfileForm"

export default async function SuperAdminProfilePage() {
  const session = await auth()
  if (!session || session.user?.role !== "super_admin") redirect("/admin/login")

  return (
    <div className="max-w-md">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Mon profil</h1>
      <ProfileForm currentEmail={session.user.email ?? ""} />
    </div>
  )
}
