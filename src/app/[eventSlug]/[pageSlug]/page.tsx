import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { resolveOrgSlug } from "@/lib/resolve-org"
import { renderEventPageMarkdown } from "@/lib/event-page-markdown"

export default async function EventCustomPage({
  params,
}: {
  params: Promise<{ eventSlug: string; pageSlug: string }>
}) {
  const { eventSlug, pageSlug } = await params
  const rawOrgSlug = (await headers()).get("x-org-slug")
  if (!rawOrgSlug) notFound()

  const resolved = await resolveOrgSlug(rawOrgSlug, `/${eventSlug}/${pageSlug}`)
  if (!resolved) notFound()
  if (resolved.redirectUrl) redirect(resolved.redirectUrl)

  const event = await prisma.event.findFirst({
    where: { slug: eventSlug, publicStatus: "published", organizationId: resolved.org.id },
    select: {
      id: true,
      title: true,
      pages: { select: { slug: true, title: true, content: true }, orderBy: { displayOrder: "asc" } },
    },
  })
  if (!event) notFound()

  const page = event.pages.find((p) => p.slug === pageSlug)
  if (!page) notFound()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href={`/${eventSlug}`} className="text-sm text-blue-600 hover:underline">← {event.title}</Link>

        <article className="mt-4 bg-white border border-gray-100 rounded-xl p-6 sm:p-8 prose prose-gray max-w-none
          prose-headings:font-semibold prose-headings:tracking-tight
          prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
          prose-p:text-sm prose-p:text-gray-700 prose-p:leading-relaxed
          prose-li:text-sm prose-li:text-gray-700
          prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
          prose-strong:text-gray-900
        ">
          <h1>{page.title}</h1>
          <div dangerouslySetInnerHTML={{ __html: renderEventPageMarkdown(page.content) }} />
        </article>
      </div>
    </div>
  )
}
