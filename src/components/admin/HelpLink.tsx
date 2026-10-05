// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { adminHelpLink, type AdminHelpRoute } from "@/lib/help-links"

/**
 * « Aide : <section> » under a main admin page's title (#568): the admin guide, opened at the
 * section that explains this page (src/lib/help-links.ts). A new tab, so a form being filled in
 * stays as it is; said visibly (↗) and to screen readers. 24 px tall at least (WCAG 2.5.8).
 */
export default function HelpLink({ route }: { route: AdminHelpRoute }) {
  const { section, href } = adminHelpLink(route)
  return (
    <p className="mt-1 text-sm">
      <a
        href={href}
        target="_blank"
        rel="noopener"
        className="inline-block py-0.5 font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        Aide : {section}{" "}
        <span className="sr-only">(ouvre dans un nouvel onglet)</span>
        <span aria-hidden="true" className="font-normal">↗</span>
      </a>
    </p>
  )
}
