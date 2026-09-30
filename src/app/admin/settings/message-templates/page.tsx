// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import MessageTemplatesManager from "@/components/admin/messages/MessageTemplatesManager"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Modèles de messages" }

/** The organisation's reusable targeted-message templates (#482). */
export default async function MessageTemplatesPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const templates = await ctx.db.messageTemplate.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, subject: true, body: true },
  })
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/admin/settings/admins" className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <span aria-hidden="true">← </span>Paramètres
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Modèles de messages</h1>
        <p className="text-sm text-gray-700 mt-1">
          Les messages que vous envoyez souvent (infos pratiques, convocation, remerciements). Dans « Écrire aux bénévoles », « Partir d&apos;un modèle » remplit l&apos;objet et le message, que vous pouvez encore modifier avant l&apos;envoi.
        </p>
      </div>
      <MessageTemplatesManager initialTemplates={templates} />
    </div>
  )
}
