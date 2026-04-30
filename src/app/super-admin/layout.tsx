import { redirect } from "next/navigation"
import { auth } from "@/auth"
import SuperAdminNav from "@/components/admin/SuperAdminNav"

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin")

  return (
    <div className="min-h-screen bg-gray-50">
      <SuperAdminNav userName={session.user.name ?? "Super admin"} />
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
