-- The email kind a sending limit held or refused (#1270): null on older rows.
ALTER TABLE "EmailLimitHit" ADD COLUMN "kind" TEXT;
