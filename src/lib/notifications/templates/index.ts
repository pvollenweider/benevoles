// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Templates for every notification kind. Plain-text + HTML.
 *
 * One file per family (registration, invitations, reminders, waitlist, sector leaders,
 * administration); `render()` picks the template of a kind.
 */

import type { NotificationPayload } from "../types"
import { withOrgLogo, type RenderedEmail } from "./shared"
import { emailLogoHtml, type OrgLogo } from "../../org-logo"
import { renderConfirmation, renderRegistrationRequested, renderRegistrationRefused, renderShiftModified, renderShiftCancelled, renderRegistrationLinkResend, renderRegistrationRemoved } from "./registration"
import { renderMemberInvite, renderAdminInvite } from "./invitations"
import { renderReminderJ2, renderReminderJ1, renderReminderDd, renderManualReminder, renderTargetedMessage } from "./reminders"
import { renderWaitlistConfirmation, renderWaitlistOffered } from "./waitlist"
import { renderSectorLeaderInvite, renderSectorLeaderNewSignup, renderSectorLeaderWithdrawal } from "./sector-leaders"
import { renderOpenShifts } from "./open-shifts"
import { renderAdminNotification, renderWithdrawalAdminNotice, renderPasswordReset, renderAdminWelcome, renderProductUpdate, renderReleaseAvailable, renderAddressesToVerifySummary, renderOperatorAlert, renderSignupConfirmation, renderSpaceApproved } from "./administration"

export type { RenderedEmail } from "./shared"

/** The organization an email is sent for (#300): its logo at the top of the email, if it has one. */
export type EmailBrand = { organizationName: string; logo: OrgLogo | null; baseUrl: string }

export function render(payload: NotificationPayload, brand?: EmailBrand | null): RenderedEmail {
  const email = renderKind(payload)
  if (!brand?.logo) return email
  return { ...email, html: withOrgLogo(email.html, emailLogoHtml(brand.logo, brand.baseUrl, brand.organizationName)) }
}

function renderKind(payload: NotificationPayload): RenderedEmail {
  switch (payload.kind) {
    case "registration_confirmation":
      return renderConfirmation(payload)
    case "member_invite":
      return renderMemberInvite(payload)
    case "reminder_j2":
      return renderReminderJ2(payload)
    case "reminder_j1":
      return renderReminderJ1(payload)
    case "reminder_dd":
      return renderReminderDd(payload)
    case "manual_reminder":
      return renderManualReminder(payload)
    case "shift_modified":
      return renderShiftModified(payload)
    case "shift_cancelled":
      return renderShiftCancelled(payload)
    case "registration_cancelled":
      return renderWithdrawalAdminNotice(payload)
    case "admin_notification":
      return renderAdminNotification(payload)
    case "admin_invite":
      return renderAdminInvite(payload)
    case "admin_welcome":
      return renderAdminWelcome(payload)
    case "password_reset":
      return renderPasswordReset(payload)
    case "waitlist_confirmation":
      return renderWaitlistConfirmation(payload)
    case "waitlist_offered":
      return renderWaitlistOffered(payload)
    case "sector_leader_invite":
      return renderSectorLeaderInvite(payload)
    case "sector_leader_new_signup":
      return renderSectorLeaderNewSignup(payload)
    case "sector_leader_withdrawal":
      return renderSectorLeaderWithdrawal(payload)
    case "product_update":
      return renderProductUpdate(payload)
    case "operator_alert":
      return renderOperatorAlert(payload)
    case "signup_confirmation":
      return renderSignupConfirmation(payload)
    case "space_approved":
      return renderSpaceApproved(payload)
    case "registration_link_resend":
      return renderRegistrationLinkResend(payload)
    case "targeted_message":
      return renderTargetedMessage(payload)
    case "registration_requested":
      return renderRegistrationRequested(payload)
    case "registration_refused":
      return renderRegistrationRefused(payload)
    case "registration_removed":
      return renderRegistrationRemoved(payload)
    case "release_available":
      return renderReleaseAvailable(payload)
    case "addresses_to_verify_summary":
      return renderAddressesToVerifySummary(payload)
    case "open_shifts":
      return renderOpenShifts(payload)
  }
}
