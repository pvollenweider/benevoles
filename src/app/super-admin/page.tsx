import { redirect } from "next/navigation"

export default function SuperAdminIndex() {
  redirect("/super-admin/organizations")
}
