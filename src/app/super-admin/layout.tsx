import { auth } from "@/auth"
import SuperAdminNav from "@/components/super-admin/SuperAdminNav"

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SuperAdminNav userName={session.user?.name ?? "Super Admin"} />
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
