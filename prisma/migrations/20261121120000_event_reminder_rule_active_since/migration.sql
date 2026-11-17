-- When a per-event reminder rule last started to apply (creation, re-enabling, revival). Additive,
-- nullable, no backfill: the previous release ignores the column, and a null value falls back to
-- the row's createdAt in the evaluator.
ALTER TABLE "EventReminderRule" ADD COLUMN "activeSince" TIMESTAMP(3);
