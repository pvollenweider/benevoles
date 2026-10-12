// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { blogAtomFeed, loadBlogPosts } from "@/lib/blog"
import { renderBlogPost } from "@/lib/public-content"
import { SITE_NAME } from "@/lib/seo-metadata"
import { apexBaseUrl } from "@/lib/urls"

// The blog's Atom feed (#944). Per request: its URLs carry the running deployment's address
// (NEXT_PUBLIC_APP_URL, only set in the container), never the one seen at build time.
export const dynamic = "force-dynamic"

export function GET() {
  const posts = loadBlogPosts().map((post) => ({ ...post, html: renderBlogPost(post) }))
  const body = blogAtomFeed({ base: apexBaseUrl(), siteName: SITE_NAME, posts })
  return new Response(body, { headers: { "Content-Type": "application/atom+xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } })
}
