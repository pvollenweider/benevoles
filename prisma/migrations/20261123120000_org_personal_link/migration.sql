-- Organisation-wide personal link (#1429, lot A): one token per Volunteer (organisation-scoped).
-- Additive and nullable, safe while pods of the previous version still run: no backfill, no
-- mass issue, the token is created lazily the first time it is needed.
--
-- Operator note — rolling deploy and post-deploy cleanup (owner decision: no feature flag).
-- Nothing in this migration, at startup, or in a bulk job issues a token. During the deploy
-- window a new pod may issue an organisation link while a previous-version pod, which does not
-- know these columns, handles an address correction, merge or link regeneration for the same
-- volunteer and so does not revoke it. Once EVERY pod runs this version, revoke any token issued
-- before the cut-off, with the timestamp set to when the rollout completed (UTC). Run once:
--
--   UPDATE "Volunteer"
--      SET "orgLinkTokenHash" = NULL,
--          "orgLinkTokenEnc" = NULL,
--          "orgLinkTokenLegacy" = NULL,
--          "orgLinkIssuedAt" = NULL
--    WHERE "orgLinkIssuedAt" IS NOT NULL
--      AND "orgLinkIssuedAt" < TIMESTAMP '2026-11-23 12:00:00';
--
-- Links issued after that instant come from this version and stay valid; a cleared row issues a
-- fresh link lazily the next time one is needed (renewal, lost link, resend), never in bulk.

ALTER TABLE "Volunteer"
  ADD COLUMN "orgLinkTokenHash" TEXT,
  ADD COLUMN "orgLinkTokenEnc" TEXT,
  ADD COLUMN "orgLinkTokenLegacy" TEXT,
  ADD COLUMN "orgLinkIssuedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Volunteer_orgLinkTokenHash_key" ON "Volunteer"("orgLinkTokenHash");
