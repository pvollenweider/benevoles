// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { blogNeighbors, blogPostMetadata, findBlogPost, loadBlogPosts } from "@/lib/blog"
import { renderBlogPost, renderChangelog } from "@/lib/public-content"
import { apexBaseUrl } from "@/lib/urls"
import { blogPostJsonLd } from "@/lib/structured-data"
import JsonLd from "@/components/public/JsonLd"
import { BlogPostView } from "@/components/public/Blog"

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = findBlogPost(slug, loadBlogPosts())
  return post ? blogPostMetadata(post, apexBaseUrl()) : {}
}

// A post of the blog (#944), rendered from its own blog/<date>-<slug>.md; an unknown slug is a 404,
// like the documentation units.
export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const posts = loadBlogPosts()
  const post = findBlogPost(slug, posts)
  if (!post) notFound()
  const { newer, older } = blogNeighbors(post.slug, posts)
  return (
    <>
      <JsonLd data={blogPostJsonLd(post, apexBaseUrl())} />
      <BlogPostView post={post} html={renderBlogPost(post)} releaseAnchors={renderChangelog().map((r) => r.version)} newer={newer} older={older} />
    </>
  )
}
