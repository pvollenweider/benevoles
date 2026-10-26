"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect, useRef } from "react"
import Link from "next/link"
import { useSearchParams, useSelectedLayoutSegments } from "next/navigation"
import PublishToggle from "@/components/admin/PublishToggle"
import { isFocusDropped } from "@/lib/focus-return"
import { useAnnounceDone } from "@/components/admin/AnnounceProvider"
import { eventHref, eventPrimaryAction, eventSubNav, eventTabs, showPrimaryAction, type PrimaryFacts } from "@/lib/event-nav"
import EventTabs from "./EventTabs"
import EventSubNav from "./EventSubNav"
import EventMoreMenu from "./EventMoreMenu"

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

export type EventHeaderProps = {
  facts: PrimaryFacts
  title: string
  dates: string
  location: string | null
  stage: { label: string; className: string }
  unlisted: boolean
  /** The space awaits the operator's validation (#810): « Demander la publication ». */
  awaitingValidation: boolean
  /** Owner of the organisation and event archived: the menu offers the permanent deletion. */
  canDelete: boolean
}

/**
 * The header of every page of an event (rendered once by src/app/admin/events/[id]/layout.tsx):
 * back to the list, the event's title, stage and dates, its one primary action, the « ⋯ » menu,
 * then the tabs and, for a tab of several pages, their own navigation. The title is the page's
 * <h1> on the overview only; every other page has its own <h1 id="page-heading">.
 */
export default function EventHeader({ facts, title, dates, location, stage, unlisted, awaitingValidation, canDelete }: EventHeaderProps) {
  const segments = useSelectedLayoutSegments()
  const subPath = segments.join("/")
  const pathname = eventHref(facts.eventId, subPath)
  const isOverview = segments.length === 0
  const tabs = eventTabs(facts, pathname)
  const subNav = eventSubNav(pathname, facts.eventId)
  const primary = eventPrimaryAction(facts)
  // Step 2 of the creation assistant has its own « Continuer » (#1098): no competing « Publier ».
  const inWizard = useSearchParams()?.has("wizard") ?? false
  const showPrimary = primary && showPrimaryAction(primary, pathname, facts.eventId, inWizard)
  const announceDone = useAnnounceDone()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const shownPath = useRef(pathname)

  // A link that led here and is no longer shown (the primary action on its own page, a menu
  // item): the focus would fall to <body>. Land on the page's heading instead. Not on the first
  // render: a page that just loaded starts at the top, as any other.
  useLayoutEffect(() => {
    if (shownPath.current === pathname) return
    shownPath.current = pathname
    // A link to an anchor (« Supprimer définitivement… »): the anchor's heading takes the focus.
    if (window.location.hash && document.getElementById(window.location.hash.slice(1))) return
    if (isFocusDropped(document.activeElement)) document.getElementById("page-heading")?.focus()
  }, [pathname])

  // The control that acted unmounts on refresh: say what happened (the layout's AnnounceProvider,
  // outside the panel), and put the focus on « ⋯ » (menu actions) or on the page's heading (the
  // primary « Publier »).
  function done(message: string, focus: "menu" | "heading") {
    const heading = focus === "heading" ? document.getElementById("page-heading") : null
    announceDone(message, heading ?? menuButtonRef.current)
  }

  return (
    <header className="space-y-3 print:hidden no-print">
      <Link href="/admin/events" className={`inline-flex min-h-6 items-center text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${FOCUS}`}>
        <span aria-hidden="true">←&nbsp;</span>Événements
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {isOverview ? (
              <h1 id="page-heading" tabIndex={-1} className="text-lg leading-7 font-bold text-gray-900 focus:outline-none">{title}</h1>
            ) : (
              <p className="text-lg leading-7 font-bold text-gray-900">{title}</p>
            )}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${stage.className}`}>
              {stage.label}
            </span>
            {unlisted && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900">non répertorié</span>
            )}
          </div>
          <p className="text-sm text-gray-700 mt-0.5">
            {dates}
            {location && <><span aria-hidden="true"> · </span><span className="sr-only">, </span>{location}</>}
          </p>
        </div>
        <div className="flex shrink-0 items-start justify-end gap-2">
          {showPrimary && primary.kind === "link" && (
            <Link href={primary.href} className={`inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 ${FOCUS}`}>
              {primary.label}
            </Link>
          )}
          {showPrimary && primary.kind === "publish" && (
            <PublishToggle eventId={facts.eventId} currentStatus={facts.publicStatus} awaitingValidation={awaitingValidation} onDone={(m) => done(m, "heading")} />
          )}
          <EventMoreMenu
            ref={menuButtonRef}
            eventId={facts.eventId}
            publicStatus={facts.publicStatus}
            canDelete={canDelete}
            pathname={pathname}
            onDone={(m) => done(m, "menu")}
          />
        </div>
      </div>
      <EventTabs tabs={tabs} />
      {subNav && <EventSubNav tabLabel={subNav.tabLabel} links={subNav.links} />}
    </header>
  )
}
