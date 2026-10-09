-- #810: sign-up indicators in the super admin statistics.

-- When a space came from the self-service sign-up. Backfill: a space with a sign-up description,
-- one still awaiting a grant, or one granted more than a minute after its creation (any other
-- creation is granted at once by the column default) came from the sign-up.
ALTER TABLE "Organization" ADD COLUMN "signupAt" TIMESTAMP(3);
UPDATE "Organization" SET "signupAt" = "createdAt"
WHERE "signupDescription" IS NOT NULL
   OR "publicationApprovedAt" IS NULL
   OR "outboundEmailApprovedAt" IS NULL
   OR "publicationApprovedAt" > "createdAt" + INTERVAL '1 minute';

-- Cumulative counters (never lowered by a deletion), same mechanism as #805.
CREATE TRIGGER "usage_counter_signup_requests" AFTER INSERT ON "SignupRequest" FOR EACH ROW EXECUTE FUNCTION usage_counter_increment('signup_requests', 'self');
CREATE TRIGGER "usage_counter_signup_spaces" AFTER INSERT ON "Organization" FOR EACH ROW WHEN (NEW."signupAt" IS NOT NULL) EXECUTE FUNCTION usage_counter_increment('signup_spaces', 'self');

-- Backfill from what exists today: sign-up requests are only kept 7 days.
INSERT INTO "PlatformCounter" ("metric", "value")
          SELECT 'signup_requests', COUNT(*) FROM "SignupRequest"
UNION ALL SELECT 'signup_spaces', COUNT(*) FROM "Organization" WHERE "signupAt" IS NOT NULL
ON CONFLICT ("metric") DO UPDATE SET "value" = EXCLUDED."value";
