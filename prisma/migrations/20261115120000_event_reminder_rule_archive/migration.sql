-- Archive a reminder rule that already sent at least one occurrence (#1139). Additive and
-- nullable: the previous release ignores the column and keeps reading every rule row, so a
-- rolling deployment stays compatible. A null archivedAt means an active rule; an archived rule
-- is not shown, counted or sent again, and its sent occurrences keep protecting those volunteers
-- when the same delay is recreated.
ALTER TABLE "EventReminderRule" ADD COLUMN "archivedAt" TIMESTAMP(3);
