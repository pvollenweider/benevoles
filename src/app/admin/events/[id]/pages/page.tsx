import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import EventPagesManager from "@/components/admin/EventPagesManager"

export const dynamic = "force-dynamic"

export default async function EventPagesPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params

  const event = await db.event.findFirst({
    where: { id },
    select: {
      id: true,
      title: true,
      pages: {
        select: { id: true, slug: true, title: true, content: true, displayOrder: true },
        orderBy: { displayOrder: "asc" },
      },
    },
  })
  if (!event) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/events/${id}`} className="text-sm text-blue-600">← {event.title}</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Pages</h1>
        <p className="text-sm text-gray-500">Règlement, FAQ, infos pratiques — du contenu libre en plus des instructions publiques, visible sur la page de l&apos;événement.</p>
      </div>

      <EventPagesManager eventId={id} initialPages={event.pages} />
    </div>
  )
}
