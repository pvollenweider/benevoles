"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import ArchiveButton from "@/components/admin/ArchiveButton"
import { useAnnounceDone } from "@/components/admin/AnnounceProvider"

/**
 * « L'archiver » of an ended event in « Ce qui demande votre attention » and the overview's
 * « À traiter » (#1098): the archive confirmation in place, not a link to the overview. Once
 * archived the item (or the whole list) goes away on refresh: the surrounding AnnounceProvider
 * says so and the focus moves to `focusId`, the list's heading or the page's.
 */
export default function ArchiveFromList({ eventId, eventTitle, focusId }: { eventId: string; eventTitle: string; focusId: string }) {
  const done = useAnnounceDone()
  return (
    <ArchiveButton
      eventId={eventId}
      currentStatus="published"
      variant="inline"
      eventTitle={eventTitle}
      onDone={() => done(`Événement archivé : ${eventTitle}.`, focusId)}
    />
  )
}
