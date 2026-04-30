import { redirect } from "next/navigation"
import { auth } from "@/auth"
import NewOrgForm from "@/components/super-admin/NewOrgForm"

export const dynamic = "force-dynamic"

export default async function NewOrgPage() {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")

  return <NewOrgForm />
}
