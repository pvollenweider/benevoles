-- Invitation reminders (#1105): when the invitation email was last sent again (a reminder, or a
-- new invitation of someone already invited), so « Relancer » skips people emailed less than 48 h
-- ago. Additive: one nullable column, no existing invitation is rewritten (null = only the first
-- invitation was sent, at sentAt).
ALTER TABLE "MemberInvite" ADD COLUMN "lastRemindedAt" TIMESTAMP(3);
