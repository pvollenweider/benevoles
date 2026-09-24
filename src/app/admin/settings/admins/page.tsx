import { redirect } from "next/navigation"
import { headers } from "next/headers"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import AdminsManager from "@/components/admin/AdminsManager"
import OrgNameForm from "@/components/admin/OrgNameForm"
import OrgPublicTitleForm from "@/components/admin/OrgPublicTitleForm"
import OrgSlugForm from "@/components/admin/OrgSlugForm"
import OrgCharterForm from "@/components/admin/OrgCharterForm"
import ChangePasswordForm from "@/components/admin/ChangePasswordForm"

export const dynamic = "force-dynamic"

export default async function AdminsSettingsPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db, organizationId, session } = ctx

  // Domain the org slug is a subdomain of (e.g. "benevol.app" for "cdp.benevol.app").
  // Computed here so the server and the client render the same address.
  const host = (await headers()).get("host") ?? "benevol.app"
  const hostParts = host.split(".")
  const baseDomain = hostParts.length >= 3 ? hostParts.slice(1).join(".") : host

  const [admins, org, slugHistory, publishedEventCount] = await Promise.all([
    db.adminUser.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        setupTokenExpiresAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, slug: true, volunteerCharter: true, hasOrgInsurance: true, publicTitle: true } }),
    prisma.orgSlugHistory.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: { slug: true, createdAt: true },
    }),
    prisma.event.count({ where: { organizationId, publicStatus: "published" } }),
  ])

  const currentEmail = session.user?.email ?? ""

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/admin/events" className="text-sm text-blue-600">← Événements</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Paramètres</h1>
          {org && <p className="text-sm text-gray-500">{org.name}</p>}
        </div>
        <Link href="/admin/settings/activity" className="text-sm text-blue-600 hover:text-blue-800 transition-colors">
          Journal d&apos;activité
        </Link>
      </div>

      {org && <OrgNameForm initialName={org.name} />}

      {org && <OrgPublicTitleForm initialTitle={org.publicTitle ?? ""} />}

      {org && (
        <OrgSlugForm
          initialSlug={org.slug}
          initialHistory={slugHistory.map((e) => ({ slug: e.slug, createdAt: e.createdAt.toISOString() }))}
          initialHasPublishedEvents={publishedEventCount > 0}
          baseDomain={baseDomain}
        />
      )}

      {org && (
        <OrgCharterForm
          initialCharter={org.volunteerCharter ?? null}
          initialHasOrgInsurance={org.hasOrgInsurance}
        />
      )}

      <section className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900">Mon compte</h2>
        <p className="text-xs text-gray-500 mt-0.5 mb-4">
          {session.user?.name} · {currentEmail}
        </p>
        <ChangePasswordForm />
      </section>

      <AdminsManager
        initialAdmins={admins.map((a) => ({
          id: a.id,
          name: a.name,
          email: a.email,
          role: a.role,
          isActive: a.isActive,
          createdAt: a.createdAt.toISOString(),
          pending: !a.isActive && a.setupTokenExpiresAt != null,
        }))}
        currentEmail={currentEmail}
      />
    </div>
  )
}
