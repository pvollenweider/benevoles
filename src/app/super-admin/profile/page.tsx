import { auth } from "@/auth"
import { redirect } from "next/navigation"
import ProfileForm from "./ProfileForm"
import SecondFactorCard from "./SecondFactorCard"
import { secondFactorStatus } from "@/lib/second-factor-server"
import { frenchLongDate } from "@/lib/second-factor-display"
import { appTimeZone } from "@/lib/time-zone"

export default async function SuperAdminProfilePage() {
  const session = await auth()
  if (!session || session.user?.role !== "super_admin" || !session.user.id) redirect("/admin/login")
  const status = await secondFactorStatus(session.user.id)

  return (
    <div className="max-w-md">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Mon profil</h1>
      <ProfileForm currentEmail={session.user.email ?? ""} />
      {status.enrolled && (
        <SecondFactorCard
          enabledLabel={status.enabledAt ? frenchLongDate(status.enabledAt, appTimeZone()) : null}
          recoveryCodesLeft={status.recoveryCodesLeft}
          email={session.user.email ?? ""}
        />
      )}
    </div>
  )
}
