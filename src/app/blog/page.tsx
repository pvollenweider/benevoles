// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { blogIndexMetadata, loadBlogPosts } from "@/lib/blog"
import { apexBaseUrl } from "@/lib/urls"
import { publicPageJsonLd } from "@/lib/structured-data"
import JsonLd from "@/components/public/JsonLd"
import { BlogIndex } from "@/components/public/Blog"

export function generateMetadata(): Metadata {
  return blogIndexMetadata(apexBaseUrl())
}

// The product newsletters, archived (#944): one Markdown file per post in blog/ (src/lib/blog.ts),
// the only copy of each post, listed newest first.
export default function BlogPage() {
  return (
    <>
      <JsonLd data={publicPageJsonLd("/blog", apexBaseUrl())} />
      <BlogIndex posts={loadBlogPosts()} />
    </>
  )
}
