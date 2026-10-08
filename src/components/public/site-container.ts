// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The one container of benevol.app's own public pages (home, features, documentation, videos,
 * changelog, accessibility, legal, 404): 72rem (1152 px) at most, centred, a 24 px gutter at every
 * width, so the header, the content and the footer of every page start and end on the same edges.
 * It is the /fonctionnalites frame, chosen for its air. A full-bleed band (a tinted section, the
 * « Sur cette page » strip) puts it inside the band. The text inside keeps its own measure (65 to
 * 75 characters: DOC_PROSE_CLASS, CONTENT_PROSE_CLASS, FEATURES_PROSE_CLASS), left-aligned on the
 * container's edge, never stretched to its width. DESIGN.md, « Conteneur du site ».
 */
export const SITE_CONTAINER_CLASS = "mx-auto w-full max-w-6xl px-6"
