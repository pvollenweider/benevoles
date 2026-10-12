// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import type { BlogPost } from "@/lib/blog"
import { BLOG_FEED_PATH, blogPostPath, releaseAnchor } from "@/lib/blog"
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

// A post's title in the index: ink, not a blue underlined link, so the list reads as headlines;
// the underline comes back on hover and with the focus outline (DESIGN.md §4).
const titleLinkClass =
  "text-gray-900 dark:text-gray-100 no-underline hover:underline underline-offset-4 decoration-2 decoration-blue-600 dark:decoration-blue-400 rounded focus-visible:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"

export function BlogIndex({ posts }: { posts: readonly BlogPost[] }) {
  const [latest, ...earlier] = posts
  return (
    <>
      <h1>Le blog</h1>
      <p className="text-lg">Les nouvelles de {SITE_NAME}, telles qu&apos;envoyées aux organisateurs.</p>
      <p className="not-prose mt-2 text-sm text-gray-600 dark:text-gray-400">
        Le détail version par version : <Link href="/nouveautes" className={linkClass}>nouveautés</Link>
        <span aria-hidden="true"> · </span>
        <span className="sr-only">. </span>
        <a href={BLOG_FEED_PATH} className={linkClass}>S&apos;abonner au flux Atom<span className="sr-only"> (fichier XML, pour un lecteur de flux)</span></a>
      </p>

      {!latest ? (
        <p>Aucun article pour le moment.</p>
      ) : (
        // `role="list"`: Safari drops the list semantics of a list without bullets.
        <ul role="list" className="not-prose mt-10">
          {/* The latest post leads, larger: the one people come for. */}
          <li className="flex flex-col pb-10 border-b border-gray-200 dark:border-gray-800">
            <h2 className="mt-3 text-2xl sm:text-3xl font-bold leading-tight tracking-tight [text-wrap:balance] [overflow-wrap:anywhere]">
              <Link href={blogPostPath(latest)} className={titleLinkClass}>
                {latest.title}
              </Link>
            </h2>
            {/* After the title in reading order (heading navigation lands on the title, then the date), above it on screen. */}
            <div className="order-first"><PostMeta post={latest} /></div>
            <p className="mt-3 max-w-[65ch] text-lg leading-relaxed text-gray-700 dark:text-gray-300 [text-wrap:pretty]">{latest.summary}</p>
          </li>
          {earlier.map((post) => (
            <li key={post.slug} className="flex flex-col py-7 border-b border-gray-200 dark:border-gray-800">
              <h2 className="mt-2 text-xl font-semibold leading-snug tracking-tight [text-wrap:balance] [overflow-wrap:anywhere]">
                <Link href={blogPostPath(post)} className={titleLinkClass}>
                  {post.title}
                </Link>
              </h2>
              <div className="order-first"><PostMeta post={post} /></div>
              <p className="mt-2 max-w-[65ch] text-base leading-relaxed text-gray-700 dark:text-gray-300 [text-wrap:pretty]">{post.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function BlogPostView({ post, html, releaseAnchors, newer = null, older = null }: { post: BlogPost; html: string; releaseAnchors: readonly string[]; newer?: BlogPost | null; older?: BlogPost | null }) {
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
      {(older || newer) && (
        // Reading on from one post to the next, without going back to the list.
        <nav aria-label="Autres nouvelles" className="not-prose mt-10 grid gap-4 sm:grid-cols-2">
          {older && (
            <Link href={blogPostPath(older)} className="group block rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:border-blue-600 dark:hover:border-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400">
              <span className="block text-sm text-gray-600 dark:text-gray-400"><span aria-hidden="true">← </span>Précédent<span className="sr-only"> : </span></span>
              <span className="mt-1 block font-semibold text-gray-900 dark:text-gray-100 group-hover:underline underline-offset-4 [overflow-wrap:anywhere]">{older.title}</span>
            </Link>
          )}
          {newer && (
            <Link href={blogPostPath(newer)} className="group block rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:col-start-2 sm:text-right hover:border-blue-600 dark:hover:border-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400">
              <span className="block text-sm text-gray-600 dark:text-gray-400">Suivant<span aria-hidden="true"> →</span><span className="sr-only"> : </span></span>
              <span className="mt-1 block font-semibold text-gray-900 dark:text-gray-100 group-hover:underline underline-offset-4 [overflow-wrap:anywhere]">{newer.title}</span>
            </Link>
          )}
        </nav>
      )}
      <p className="not-prose mt-8 text-sm">
        <Link href="/blog" className={linkClass}>Toutes les nouvelles</Link>
      </p>
    </>
  )
}
