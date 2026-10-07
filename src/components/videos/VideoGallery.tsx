"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import AutoplayLink from "@/components/videos/AutoplayLink"
import { useEffect, useMemo, useRef, useState } from "react"
import { announce } from "@/lib/announce"
import {
  applyVideoFilters,
  audiencesInUse,
  formatDuration,
  levelsInUse,
  tagsInUse,
  themesInUse,
  AUDIENCE_LABELS,
  LEVEL_LABELS,
  type Audience,
  type Level,
  type ThemeId,
  type Video,
} from "@/lib/video-catalog"

// The gallery searches script text too (#644), so it needs the full Video, script included —
// the catalogue is small (under 60 videos, a few KB of script each), an acceptable payload.
export default function VideoGallery({ videos }: { videos: Video[] }) {
  const [theme, setTheme] = useState<ThemeId | "">("")
  const [audience, setAudience] = useState<Audience | "">("")
  const [level, setLevel] = useState<Level | "">("")
  const [tag, setTag] = useState<string>("")
  const [query, setQuery] = useState("")

  const themeOptions = useMemo(() => themesInUse(videos), [videos])
  const audienceOptions = useMemo(() => audiencesInUse(videos), [videos])
  const levelOptions = useMemo(() => levelsInUse(videos), [videos])
  const tagOptions = useMemo(() => tagsInUse(videos), [videos])

  const filtered = useMemo(
    () => applyVideoFilters(videos, { theme: theme || null, audience: audience || null, level: level || null, tag: tag || null, query }),
    [videos, theme, audience, level, tag, query],
  )

  const [resultAnnouncement, setResultAnnouncement] = useState("")
  const everChangedRef = useRef(false)
  useEffect(() => {
    if (!everChangedRef.current) { everChangedRef.current = true; return }
    // Debounced (same pattern as MembersManager, #599): `query` changes on every keystroke. A
    // single announcement effect covers every filter (theme, audience, level, tag, search), so
    // combining several in one gesture still announces once.
    const t = setTimeout(() => {
      const n = filtered.length
      announce(setResultAnnouncement, n === 0 ? "Aucune vidéo ne correspond." : `${n} vidéo${n > 1 ? "s" : ""} affichée${n > 1 ? "s" : ""}.`)
    }, 400)
    return () => clearTimeout(t)
  }, [theme, audience, level, tag, query, filtered.length])

  function resetFilters() {
    setTheme("")
    setAudience("")
    setLevel("")
    setTag("")
    setQuery("")
  }

  const hasFilters = theme !== "" || audience !== "" || level !== "" || tag !== "" || query.trim() !== ""

  return (
    <div className="space-y-8">
      <form role="search" onSubmit={(e) => e.preventDefault()} className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-gray-800">Filtrer les vidéos</legend>

          <div>
            <label htmlFor="video-search" className="block text-sm font-medium text-gray-700 mb-1">Recherche</label>
            <input
              id="video-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Titre, description, étiquette, contenu du script…"
              className="input w-full"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="video-theme" className="block text-sm font-medium text-gray-700 mb-1">Thème</label>
              <select id="video-theme" value={theme} onChange={(e) => setTheme(e.target.value as ThemeId | "")} className="input w-full">
                <option value="">Tous les thèmes</option>
                {themeOptions.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="video-level" className="block text-sm font-medium text-gray-700 mb-1">Niveau</label>
              <select id="video-level" value={level} onChange={(e) => setLevel(e.target.value as Level | "")} className="input w-full">
                <option value="">Tous les niveaux</option>
                {levelOptions.map((l) => (
                  <option key={l} value={l}>{LEVEL_LABELS[l]}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="video-audience" className="block text-sm font-medium text-gray-700 mb-1">Public</label>
              <select id="video-audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience | "")} className="input w-full">
                <option value="">Tous les publics</option>
                {audienceOptions.map((a) => (
                  <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="video-tag" className="block text-sm font-medium text-gray-700 mb-1">Étiquette</label>
              <select id="video-tag" value={tag} onChange={(e) => setTag(e.target.value)} className="input w-full">
                <option value="">Toutes les étiquettes</option>
                {tagOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {hasFilters && (
            <button type="button" onClick={resetFilters} className="text-sm text-blue-600 hover:underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              Réinitialiser les filtres
            </button>
          )}
        </fieldset>
      </form>

      <div role="status" aria-live="polite" className="sr-only">{resultAnnouncement}</div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-600">Aucune vidéo ne correspond à ces critères.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((video) => (
            <li key={video.id}>
              {/* The card's only interactive element is the title link; "stretched link"
                  (after:absolute after:inset-0 on a relatively positioned card) makes the whole
                  card clickable without nesting interactive elements inside the link, so the
                  link's accessible name stays just the title (#644 accessibility review). */}
              <article className="relative h-full bg-white border border-gray-200 rounded-2xl p-5 hover:border-blue-200 hover:shadow-sm transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="text-sm font-semibold text-gray-900">
                    <AutoplayLink
                      href={`/videos/${video.id}`}
                      className="after:absolute after:inset-0 hover:text-blue-700 hover:underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      {video.title}
                    </AutoplayLink>
                  </h2>
                  <span className="shrink-0 text-xs font-medium text-gray-500">{formatDuration(video.durationMs)}</span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed mb-3 line-clamp-3">{video.description}</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {video.themes.map((t) => (
                    <span key={t} className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 text-xs font-medium px-2 py-0.5">
                      {themeOptions.find((o) => o.id === t)?.label ?? t}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span>{LEVEL_LABELS[video.level]}</span>
                  <span>{video.audience.map((a) => AUDIENCE_LABELS[a]).join(", ")}</span>
                  {!video.published && <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-xs font-medium px-2 py-0.5">À venir</span>}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
