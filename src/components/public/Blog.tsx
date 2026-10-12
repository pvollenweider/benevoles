// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import type { BlogPost } from "@/lib/blog"
import { BLOG_FEED_PATH, releaseAnchor } from "@/lib/blog"
import { formatReleaseDate } from "@/lib/changelog"
import { SITE_NAME } from "@/lib/seo-metadata"

/**
 * The blog (#944), inside ContentShell's article and its prose recipe (CONTENT_PROSE_CLASS), like
 * /nouveautes: the index lists the posts newest first, each its title (a link, in an <h2>), its
 * date in a <time>, its version and its summary; a post shows its title as the page's single <h1>,
 * its date and version, its Markdown (rendered and sanitized by renderBlogPost,
 * src/lib/public-content.ts), then where to read every change and the way back to the index.
 */

// The links the blog draws itself: colour, underline and the focus outline of DESIGN.md §4, as in
// the content navigation and the documentation.
const linkClass =
  "text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:decoration-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"

/** « Version 2.3 », a badge (DESIGN.md: a pill, its tint and its text in the same hue). */
function VersionBadge({ version }: { version: string }) {
  return <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">Version {version}</span>
}

/** The date a post was sent, and its version when it announces one. */
function PostMeta({ post, prefix }: { post: Pick<BlogPost, "date" | "version">; prefix?: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
      <span>
        {prefix}
        <time dateTime={post.date}>{formatReleaseDate(post.date)}</time>
      </span>
      {post.version && <VersionBadge version={post.version} />}
    </p>
  )
}

export function BlogIndex({ posts }: { posts: readonly BlogPost[] }) {
  return (
    <>
      <h1>Le blog</h1>
      <p>
        Les nouvelles de {SITE_NAME}, telles qu&apos;envoyées aux organisateurs, la plus récente en premier. Le détail de
        chaque changement, version par version, est dans les <Link href="/nouveautes">nouveautés</Link>. Pour être prévenu
        d&apos;un nouvel article, le blog a son <a href={BLOG_FEED_PATH}>flux Atom</a>.
      </p>

      {posts.length === 0 ? (
        <p>Aucun article pour le moment.</p>
      ) : (
        // `role="list"`: Safari drops the list semantics of a list without bullets.
        <ul role="list" className="not-prose mt-8 border-t border-gray-200 dark:border-gray-800">
          {posts.map((post) => (
            <li key={post.slug} className="border-b border-gray-200 dark:border-gray-800 py-6">
              <h2 className="text-xl font-semibold leading-snug tracking-tight text-gray-900 dark:text-gray-100 [overflow-wrap:anywhere]">
                <Link href={`/blog/${post.slug}`} className={linkClass}>
                  {post.title}
                </Link>
              </h2>
              <div className="mt-2">
                <PostMeta post={post} />
              </div>
              <p className="mt-2 max-w-[65ch] text-base leading-[1.75] text-gray-700 dark:text-gray-300">{post.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function BlogPostView({ post, html, releaseAnchors }: { post: BlogPost; html: string; releaseAnchors: readonly string[] }) {
  const anchor = post.version ? releaseAnchor(post.version) : null
  const release = anchor && releaseAnchors.includes(anchor) ? anchor : null
  return (
    <>
      <p className="not-prose mb-6 text-sm">
        <Link href="/blog" className={linkClass}>
          <span aria-hidden="true">← </span>Toutes les nouvelles
        </Link>
      </p>
      <h1 className="[overflow-wrap:anywhere]">{post.title}</h1>
      <div className="not-prose mt-4">
        <PostMeta post={post} prefix="Envoyé le " />
      </div>
      <div className="[overflow-wrap:anywhere]" dangerouslySetInnerHTML={{ __html: html }} />
      <hr />
      <p>
        {release ? (
          <>
            Chaque changement de la version {post.version}, en clair :{" "}
            <Link href={`/nouveautes#${release}`}>les nouveautés de la version {post.version}</Link>. Toutes les versions
            sont dans les <Link href="/nouveautes">nouveautés</Link>.
          </>
        ) : (
          <>
            Tout ce qui change, version par version, en clair : les <Link href="/nouveautes">nouveautés</Link>.
          </>
        )}
      </p>
      <p>
        <Link href="/blog">Toutes les nouvelles</Link>
      </p>
    </>
  )
}
