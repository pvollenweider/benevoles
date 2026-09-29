// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

export const MAIN_CONTENT_ID = "main"

/**
 * First focusable element of the admin (#389): hidden until focused, then a visible link that
 * jumps over the top bar to `<main id="main" tabIndex={-1}>`. Landmarks alone leave a keyboard
 * user tabbing through the organization name, the navigation, the search and the user menu on
 * every page.
 */
export default function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-blue-800 focus:shadow-lg focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
    >
      Aller au contenu
    </a>
  )
}
