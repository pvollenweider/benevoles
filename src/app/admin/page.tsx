import { redirect } from "next/navigation"
import { ADMIN_HOME } from "@/lib/admin-next"

export default function AdminPage() {
  // The organiser's home is the dashboard (#1098).
  redirect(ADMIN_HOME)
}
