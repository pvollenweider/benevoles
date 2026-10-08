// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The one container of benevol.app's own public pages (home, features, documentation, videos,
 * changelog, accessibility, legal, 404): 72rem (1152 px) at most, centred, a 24 px gutter at every
 * width, so the header, the content and the footer of every page start and end on the same edges.
 * It is the /fonctionnalites frame, chosen for its air. A full-bleed band (a tinted section, the
 * « Sur cette page » strip) puts it inside the band. The text inside keeps its own measure (65 to
 * 75 characters: DOC_PROSE_CLASS, CONTENT_PROSE_CLASS, FEATURES_PROSE_CLASS), never stretched to
 * the container's width. DESIGN.md, « Conteneur du site ».
 */
export const SITE_CONTAINER_CLASS = "mx-auto w-full max-w-6xl px-6"

/**
 * The reading column of a single-column page (a guide or the documentation index, the changelog,
 * accessibility, legal): centred in the site container, so a wide screen keeps an even margin on
 * both sides instead of an empty band on the right. Pages whose composition fills the container
 * (home, features, videos, 404) and a documentation unit (side menu + text) keep their text on the
 * container's left edge.
 */
export const SITE_READING_COLUMN_CLASS = "mx-auto"
