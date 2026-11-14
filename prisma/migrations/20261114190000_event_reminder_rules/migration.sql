-- Per-event reminder delays and their durable send state (#1139). Additive: two new tables, no
-- existing column touched. The previous release keeps running during the deploy: it ignores these
-- tables and keeps sending the three default reminders for every event, and no rule exists yet
-- (this PR has no way to create one).

-- CreateTable
CREATE TABLE "EventReminderRule" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventReminderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderOccurrence" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "localDay" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "outboxId" TEXT,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderOccurrence_pkey" PRIMARY KEY ("id")
);

-- Closed value sets, checked by the database too (#321 style): the pure validator
-- (src/lib/reminder-rules.ts) owns the bounds and the duplicate-delay refusal.
ALTER TABLE "EventReminderRule" ADD CONSTRAINT "EventReminderRule_unit_check" CHECK ("unit" IN ('hours', 'days'));
ALTER TABLE "EventReminderRule" ADD CONSTRAINT "EventReminderRule_value_check" CHECK ("value" > 0);
ALTER TABLE "ReminderOccurrence" ADD CONSTRAINT "ReminderOccurrence_status_check" CHECK ("status" IN ('pending', 'queued', 'sent', 'cancelled'));

-- CreateIndex
CREATE INDEX "EventReminderRule_eventId_displayOrder_idx" ON "EventReminderRule"("eventId", "displayOrder");

-- CreateIndex
CREATE INDEX "ReminderOccurrence_status_dueAt_idx" ON "ReminderOccurrence"("status", "dueAt");

-- CreateIndex
CREATE INDEX "ReminderOccurrence_outboxId_idx" ON "ReminderOccurrence"("outboxId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderOccurrence_eventId_volunteerId_localDay_ruleId_key" ON "ReminderOccurrence"("eventId", "volunteerId", "localDay", "ruleId");

-- AddForeignKey
ALTER TABLE "EventReminderRule" ADD CONSTRAINT "EventReminderRule_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderOccurrence" ADD CONSTRAINT "ReminderOccurrence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderOccurrence" ADD CONSTRAINT "ReminderOccurrence_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderOccurrence" ADD CONSTRAINT "ReminderOccurrence_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "EventReminderRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
