// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"
import NotFoundTitle from "@/components/public/NotFoundTitle"
import { SITE_CONTAINER_CLASS } from "@/components/public/site-container"
import type { NotFoundLinks } from "@/lib/not-found-links"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"

// Fixed positions (no Math.random: server and client must draw the same rain).
// The R2 sequence scatters them evenly over the area, without rows or clumps.
const DROPS = Array.from({ length: 40 }, (_, i) => ({
  left: Math.round(((0.5 + i * 0.7548776662) % 1) * 1000) / 10,
  top: Math.round(((0.5 + i * 0.569840291) % 1) * 850) / 10 - 5,
  height: 0.9 + ((i * 7) % 5) * 0.2,
  delay: ((i * 0.37) % 1.4).toFixed(2),
  duration: (1.1 + (i % 5) * 0.12).toFixed(2),
}))

// Rings where drops hit the puddle, around the sinking card.
const RIPPLES = [
  { left: "8%", bottom: "2.6rem", width: "4.5rem", delay: "0s" },
  { left: "74%", bottom: "1.4rem", width: "5.5rem", delay: "0.9s" },
  { left: "30%", bottom: "0.6rem", width: "3.5rem", delay: "1.6s" },
  { left: "86%", bottom: "3rem", width: "3rem", delay: "0.4s" },
]

// A wave, drawn twice side by side so that sliding it by half its width loops seamlessly.
const WAVE_PATH = "M0 14 C 50 4, 100 4, 150 14 S 250 24, 300 14 S 400 4, 450 14 S 550 24, 600 14 V 80 H 0 Z"

/**
 * The picture of the 404 page: a shift card of the schedule, « Annulé », sinking in a puddle under
 * the rain. Purely decorative (the lead sentence says it in words), so hidden from assistive
 * technologies. Every movement goes through `motion-safe:`; with reduced motion the drops and the
 * rings stay still. Fixed height: nothing moves the text around it.
 */
function RainScene() {
  return (
    <div aria-hidden="true" className="relative mx-auto h-[17rem] w-full max-w-sm select-none overflow-hidden sm:h-[26rem]">
      <div className="absolute -inset-8 rotate-[8deg] [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_80%,transparent)]">
        {DROPS.map((drop, i) => (
          <span
            key={i}
            data-rain-drop
            className="absolute w-px rounded-full bg-blue-600/55 dark:bg-blue-400/60 motion-safe:animate-rain-fall"
            style={{
              left: `${drop.left}%`,
              top: `${drop.top}%`,
              height: `${drop.height}rem`,
              animationDelay: `-${drop.delay}s`,
              animationDuration: `${drop.duration}s`,
            }}
          />
        ))}
      </div>

      <div className="absolute bottom-6 left-1/2 w-[16.5rem] -translate-x-1/2 -rotate-[5deg] rounded-2xl border border-gray-200 bg-white px-5 pt-4 pb-16 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold text-gray-900 dark:text-gray-50">Retrouver la page</p>
          <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Annulé</span>
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-600 dark:text-gray-300">Créneau</dt>
          <dd className="text-gray-900 dark:text-gray-100">14h–16h</dd>
          <dt className="text-gray-600 dark:text-gray-300">Places</dt>
          <dd className="text-gray-900 dark:text-gray-100">0 sur ∞</dd>
          <dt className="text-gray-600 dark:text-gray-300">Motif</dt>
          <dd className="text-gray-900 dark:text-gray-100">Pluie</dd>
        </dl>
      </div>

      <div className="absolute inset-x-0 bottom-0 h-[4.75rem] overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_14%,black_86%,transparent)]">
        <svg viewBox="0 0 600 80" preserveAspectRatio="none" className="absolute bottom-0 left-0 h-full w-[200%] text-blue-600/15 dark:text-blue-400/20 motion-safe:animate-rain-drift">
          <path d={WAVE_PATH} fill="currentColor" transform="scale(0.5 1)" />
          <path d={WAVE_PATH} fill="currentColor" transform="translate(300 0) scale(0.5 1)" />
        </svg>
        <svg viewBox="0 0 600 80" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-[85%] w-[200%] text-blue-600/15 dark:text-blue-400/15 motion-safe:animate-rain-drift [animation-direction:reverse] [animation-duration:13s]">
          <path d={WAVE_PATH} fill="currentColor" transform="scale(0.5 1)" />
          <path d={WAVE_PATH} fill="currentColor" transform="translate(300 0) scale(0.5 1)" />
        </svg>
        {RIPPLES.map((ripple, i) => (
          <span
            key={i}
            className="absolute aspect-[5/1] rounded-[50%] border border-blue-600/45 dark:border-blue-400/50 motion-safe:animate-rain-ripple"
            style={{ left: ripple.left, bottom: ripple.bottom, width: ripple.width, animationDelay: ripple.delay }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * The 404 page (src/app/not-found.tsx): a deadpan line about a page « tombée à l'eau », the real
 * ways out right below. Light or dark as the system is (`data-color-scheme="system"`, the `dark`
 * variant of globals.css). No site header precedes the content, so no skip link (DESIGN.md).
 */
export default function NotFoundPage({ links }: { links: NotFoundLinks }) {
  return (
    <div data-color-scheme="system" className="flex flex-1 flex-col bg-gray-50 text-gray-900 [color-scheme:light] dark:bg-gray-900 dark:text-gray-50 dark:[color-scheme:dark]">
      <NotFoundTitle />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className={`${SITE_CONTAINER_CLASS} flex-1 py-12 focus:outline-none sm:py-20`}>
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-12">
          <div>
            <h1 className="text-[clamp(2.5rem,2rem+3vw,5.5rem)] font-extrabold leading-[0.98] tracking-[-0.035em] text-balance">
              Cette page est tombée à l&apos;eau.
            </h1>
            <p className="mt-6 max-w-[38ch] text-lg leading-relaxed text-gray-700 text-pretty sm:text-xl dark:text-gray-200">
              Annulée pour cause de pluie. Les bénévoles prévus ont été réaffectés au poste «&nbsp;Écopage&nbsp;».
            </p>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">Erreur 404&nbsp;: l&apos;adresse demandée n&apos;existe pas, ou plus.</p>
            <Link
              href={links.primary.href}
              className={`mt-8 inline-flex items-center gap-2 rounded-xl border border-transparent bg-blue-600 px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700 ${focusRing}`}
            >
              <span aria-hidden="true">←</span>
              {links.primary.label}
            </Link>
            {links.note && <p className="mt-4 max-w-[48ch] text-sm text-gray-600 dark:text-gray-300">{links.note}</p>}
          </div>
          <RainScene />
        </div>

        <nav aria-label="Liens utiles" className="mt-14 sm:mt-20">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Le reste du site est resté au sec.</h2>
          <ul className="mt-4 grid border-t border-gray-200 sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-3 dark:border-gray-700">
            {links.links.map((link) => (
              <li key={link.href} className="border-b border-gray-200 py-4 dark:border-gray-700">
                <Link
                  href={link.href}
                  className={`rounded font-semibold text-blue-700 underline decoration-1 underline-offset-4 hover:decoration-2 dark:text-blue-300 ${focusRing}`}
                >
                  {link.label}
                </Link>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{link.description}</p>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </div>
  )
}
