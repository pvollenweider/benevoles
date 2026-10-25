-- Valuing volunteer work (#867): the organisation's hourly rate (cents), its currency and when it
-- was set. Additive and nullable: every existing organisation has no rate (nothing changes), and
-- pods still running the previous code keep working.
ALTER TABLE "Organization" ADD COLUMN "volunteerHourRateCents" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "volunteerHourRateCurrency" TEXT;
ALTER TABLE "Organization" ADD COLUMN "volunteerHourRateSetAt" TIMESTAMP(3);
