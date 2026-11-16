// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « En savoir plus ↗ » after a short hint: the page of the documentation that holds the details
 * (src/lib/help-links.ts docHref). A new tab, so a form being filled in stays as it is; said
 * visibly (↗) and to screen readers, with the topic (`about`) so the link's name is clear out of
 * context (WCAG 2.4.4). Its name starts with the visible text (2.5.3). 24 px tall at least (2.5.8).
 * Never inside the text a field's aria-describedby points to: the field would read the link too.
 * Client-safe (no doc-units loading), unlike HelpLink.
 */
export default function DocMoreLink({ href, about, className = "" }: { href: string; about: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={`inline-block py-0.5 font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${className}`}
    >
      En savoir plus{" "}<span className="sr-only">sur {about} (ouvre dans un nouvel onglet)</span>{" "}
      <span aria-hidden="true" className="font-normal">↗</span>
    </a>
  )
}
