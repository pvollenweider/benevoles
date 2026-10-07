import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { cache } from "react"
import { prisma } from "@/lib/prisma"
import { resolveOrgSlug } from "@/lib/resolve-org"
import { renderEventPageMarkdown } from "@/lib/event-page-markdown"
import { eventInfoPageMetadata } from "@/lib/event-share"

// One query for the page and its metadata, awaited by the page: the metadata is resolved before
// the shell is sent and its tags land in the <head> (see ../page.tsx, #773).
const loadEvent = cache((organizationId: string, slug: string) =>
  prisma.event.findFirst({
    where: { slug, organizationId },
    select: {
      id: true,
      title: true,
      description: true,
      startDate: true,
      endDate: true,
      publicStatus: true,
      isListed: true,
      pages: { select: { slug: true, title: true, content: true }, orderBy: { displayOrder: "asc" } },
    },
  }),
)

// Title and description of a published event's page; the pages of an unlisted event (#414) aren't
// indexed either, and a draft or an archived event's give nothing away.
export async function generateMetadata({ params }: { params: Promise<{ eventSlug: string; pageSlug: string }> }): Promise<Metadata> {
  const { eventSlug, pageSlug } = await params
  const rawOrgSlug = (await headers()).get("x-org-slug")
  if (!rawOrgSlug) return {}
  const resolved = await resolveOrgSlug(rawOrgSlug, `/${eventSlug}/${pageSlug}`)
  if (!resolved || resolved.redirectUrl) return {}
  const event = await loadEvent(resolved.org.id, eventSlug)
  if (!event) return {}
  return eventInfoPageMetadata(
    { ...event, organizationName: resolved.org.name },
    event.pages.find((p) => p.slug === pageSlug) ?? null,
  )
}

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

  const event = await loadEvent(resolved.org.id, eventSlug)
  if (!event || event.publicStatus !== "published") notFound()

  const page = event.pages.find((p) => p.slug === pageSlug)
  if (!page) notFound()

  // Only a back link precedes the content: a <main> landmark, no skip link (it would add a Tab stop
  // to skip a single one).
  return (
    <main className="min-h-screen bg-gray-50">
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
    </main>
  )
}
