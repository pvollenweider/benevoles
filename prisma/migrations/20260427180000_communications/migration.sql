-- ────────────────────────────────────────────────────────────────────────────
-- Sprint 3 — Communications
--
-- Adds:
--   • Event.reminderMessage / reminderSentAt / remindersEnabled (manual J-7)
--   • Registration.reminderJ2Sent / J1Sent / DdSent (auto reminders idempotency)
--   • indexes used by the cron job to avoid full table scans
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Event"
  ADD COLUMN "reminderMessage"  TEXT,
  ADD COLUMN "reminderSentAt"   TIMESTAMP(3),
  ADD COLUMN "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Registration"
  ADD COLUMN "reminderJ2Sent" TIMESTAMP(3),
  ADD COLUMN "reminderJ1Sent" TIMESTAMP(3),
  ADD COLUMN "reminderDdSent" TIMESTAMP(3);

-- Indexes used by /api/cron/reminders. Filtered queries hit
-- (status, reminderXSent IS NULL) on every run, so a composite index
-- on those two columns avoids scanning the whole table once volume grows.
CREATE INDEX "Registration_status_reminderJ2Sent_idx"
  ON "Registration"("status", "reminderJ2Sent");
CREATE INDEX "Registration_status_reminderJ1Sent_idx"
  ON "Registration"("status", "reminderJ1Sent");
CREATE INDEX "Registration_status_reminderDdSent_idx"
  ON "Registration"("status", "reminderDdSent");
