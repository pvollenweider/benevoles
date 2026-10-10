-- Retention of past events' personal data (#813, phase 2).
-- When an event's registrations were anonymised (3 years after its end); null = not yet.
ALTER TABLE "Event" ADD COLUMN "personalDataAnonymizedAt" TIMESTAMP(3);
-- The one notice to the organisation, 30 days before its first batch, and its last monthly batch.
ALTER TABLE "Organization" ADD COLUMN "pastEventNoticeAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "pastEventBatchAt" TIMESTAMP(3);

-- The anonymous records an anonymisation creates (erasedAt set at insert) are not new members:
-- the cumulative « membres créés » counter (#805) stays as it was.
CREATE OR REPLACE TRIGGER "usage_counter_members" AFTER INSERT ON "Volunteer" FOR EACH ROW WHEN (NEW."erasedAt" IS NULL) EXECUTE FUNCTION usage_counter_increment('members', 'organizationId');
