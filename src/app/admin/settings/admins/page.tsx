import { redirect } from "next/navigation"
import { headers } from "next/headers"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import AdminsManager from "@/components/admin/AdminsManager"
import OrgNameForm from "@/components/admin/OrgNameForm"
import OrgLogoForm from "@/components/admin/OrgLogoForm"
import { ORG_LOGO_SELECT, orgLogoOf } from "@/lib/org-logo"
import OrgPublicTitleForm from "@/components/admin/OrgPublicTitleForm"
import OrgSlugForm from "@/components/admin/OrgSlugForm"
import OrgTimeZoneForm from "@/components/admin/OrgTimeZoneForm"
import { APP_TIME_ZONE, timeZoneChoices } from "@/lib/time-zone"
import OrgCharterForm from "@/components/admin/OrgCharterForm"
import OrgRosterDefaultForm from "@/components/admin/OrgRosterDefaultForm"
import { charterStatusLabel } from "@/lib/volunteer-charter"
import { hasLevel } from "@/lib/permissions"
import HelpLink from "@/components/admin/HelpLink"
import { siteDomain } from "@/lib/site"
import { spaceBaseDomain } from "@/lib/space-address"
import { configuredAppUrl } from "@/lib/urls"
import { canInviteAdmins } from "@/lib/org-approval"

export const dynamic = "force-dynamic"

export default async function AdminsSettingsPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db, organizationId, session } = ctx

  // Domain the org slug is a subdomain of (e.g. "benevol.app" for "cdp.benevol.app"), from the
  // configured address, not the request host (a proxy or a capture stack has its own host).
  // Computed here so the server and the client render the same address.
  const baseDomain = spaceBaseDomain(configuredAppUrl(), (await headers()).get("host"), siteDomain())

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
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, slug: true, outboundEmailApprovedAt: true, volunteerCharter: true, hasOrgInsurance: true, shiftRosterDefault: true, publicTitle: true, timeZone: true, logo: ORG_LOGO_SELECT } }),
    db.orgSlugHistory.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: { slug: true, createdAt: true },
    }),
    db.event.count({ where: { organizationId, publicStatus: "published" } }),
  ])

  const currentEmail = session.user?.email ?? ""
  // Organisers see these settings but can't change them (#469); the routes refuse it too.
  const isOwner = hasLevel(session.user?.role, "owner")
  const logo = org ? orgLogoOf(organizationId, org.logo) : null

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/admin/events" className="text-sm text-blue-600">← Événements</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Paramètres</h1>
          {org && <p className="text-sm text-gray-500">{org.name}</p>}
          <HelpLink route="/admin/settings/admins" />
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin/settings/notifications" className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            Emails
          </Link>
          <Link href="/admin/settings/message-templates" className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            Modèles de messages
          </Link>
          <Link href="/admin/settings/activity" className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            Journal d&apos;activité
          </Link>
        </div>
      </div>

      {org && !isOwner && (
        <section aria-labelledby="org-readonly-heading" className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
          <h2 id="org-readonly-heading" className="text-sm font-semibold text-gray-800">Organisation</h2>
          <p className="text-sm text-gray-700">Votre rôle : organisateur. Ces réglages sont réservés aux propriétaires de l&apos;organisation.</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-gray-600">Nom</dt><dd className="text-gray-900">{org.name}</dd>
            <dt className="text-gray-600">Logo</dt><dd className="text-gray-900">{logo ? "défini" : "aucun"}</dd>
            <dt className="text-gray-600">Titre public</dt><dd className="text-gray-900">{org.publicTitle || "aucun"}</dd>
            <dt className="text-gray-600">Adresse</dt><dd className="text-gray-900 break-all">{org.slug}.{baseDomain}</dd>
            <dt className="text-gray-600">Fuseau horaire</dt><dd className="text-gray-900">{org.timeZone || APP_TIME_ZONE}</dd>
            <dt className="text-gray-600">Charte des bénévoles</dt><dd className="text-gray-900">{charterStatusLabel(org.volunteerCharter)}</dd>
            <dt className="text-gray-600">Qui est inscrit, nouveaux événements</dt><dd className="text-gray-900">{org.shiftRosterDefault ? "activé" : "désactivé"}</dd>
          </dl>
        </section>
      )}

      {org && isOwner && <OrgNameForm initialName={org.name} />}

      {org && isOwner && <OrgLogoForm initialLogo={logo} organizationName={org.name} />}

      {org && isOwner && <OrgPublicTitleForm initialTitle={org.publicTitle ?? ""} />}

      {org && isOwner && (
        <OrgSlugForm
          initialSlug={org.slug}
          initialHistory={slugHistory.map((e) => ({ slug: e.slug, createdAt: e.createdAt.toISOString() }))}
          initialHasPublishedEvents={publishedEventCount > 0}
          baseDomain={baseDomain}
        />
      )}

      {org && isOwner && (
        <OrgTimeZoneForm
          initialTimeZone={org.timeZone ?? ""}
          defaultTimeZone={APP_TIME_ZONE}
          choices={timeZoneChoices(org.timeZone)}
        />
      )}

      {org && isOwner && (
        <OrgCharterForm
          initialCharter={org.volunteerCharter ?? null}
          initialHasOrgInsurance={org.hasOrgInsurance}
        />
      )}

      {org && isOwner && <OrgRosterDefaultForm initialValue={org.shiftRosterDefault} />}

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
        canManage={isOwner}
        canInvite={!!org && canInviteAdmins(org)}
      />
    </div>
  )
}
