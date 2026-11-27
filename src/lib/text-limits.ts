// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Length caps of the organisers' free texts (events, shifts, the volunteer convention, member notes).
 * Every one is re-rendered on public pages and in emails, so none may grow without bound. The caps
 * are well above any real use: the Markdown texts get the same 20,000 characters as an event's
 * custom pages. The forms carry the same values as `maxLength`.
 * No zod here: the forms import these values (the schemas use text-limits-schema.ts).
 */
export const EVENT_TITLE_MAX = 200
export const EVENT_LOCATION_MAX = 500
/** Markdown texts: event description, public instructions, confirmation message, volunteer convention. */
export const MARKDOWN_TEXT_MAX = 20000
export const SHOW_NAME_MAX = 200
export const SHIFT_ROLE_NAME_MAX = 100
export const SHIFT_LABEL_MAX = 200
export const SHIFT_DESCRIPTION_MAX = 5000
export const SHIFT_LOCATION_DETAILS_MAX = 1000
export const SHIFT_INTERNAL_NOTES_MAX = 5000
export const MEMBER_NOTES_MAX = 5000
/** A member's name, phone and tags, however the member is added (form, manual registration, import). */
export const MEMBER_NAME_MAX = 100
export const MEMBER_PHONE_MAX = 50
export const MEMBER_TAGS_MAX = 50
export const MEMBER_TAG_MAX = 100
/** The shows of an event's schedule: how many, and the length of a time (« HH:MM »). */
export const SHOW_SCHEDULE_MAX = 500
export const SHOW_TIME_MAX = 5

/** 20000 → « 20 000 » (the same on the server and in every browser, unlike Intl). */
function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+$)/g, " ")
}

/** « La description : 20 000 caractères au maximum. » */
export function tooLongMessage(label: string, max: number): string {
  return `${label} : ${groupThousands(max)} caractères au maximum.`
}

/** Recognises the messages of `tooLongMessage`, so a route can show one as is (api-error.ts). */
export const TOO_LONG_MESSAGE = / caractères au maximum\.$/
