-- Case-insensitive email uniqueness (#342), in the same scopes as the existing unique keys: the
-- app normalizes emails to trimmed lower case (#310), and these indexes make the database refuse
-- a second row that only differs by case or spaces. Expression indexes can't be declared in
-- schema.prisma: they live only here (see the comments on the models).
--
-- Case-only duplicates left by 20260929150000_normalize_emails must be merged first: this
-- migration stops with an explicit message instead of a raw index error (production was checked
-- beforehand: none). Plain CREATE INDEX (not CONCURRENTLY, which can't run in a migration's
-- transaction): these tables are small, the lock lasts milliseconds.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Volunteer"
    WHERE "email" IS NOT NULL AND "organizationId" IS NOT NULL
    GROUP BY "organizationId", lower(trim("email")) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Volunteers whose emails differ only by case or spaces exist in the same organization: merge them before applying this migration (#342)';
  END IF;
  IF EXISTS (SELECT 1 FROM "AdminUser" GROUP BY lower(trim("email")) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Admin users whose emails differ only by case or spaces exist: merge them before applying this migration (#342)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "SectorLeader"
    GROUP BY "eventId", "roleName", lower(trim("email")) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Sector leaders whose emails differ only by case or spaces exist for the same event and role: merge them before applying this migration (#342)';
  END IF;
END $$;

CREATE UNIQUE INDEX "Volunteer_organizationId_email_ci_key" ON "Volunteer" ("organizationId", lower(trim("email")));
CREATE UNIQUE INDEX "AdminUser_email_ci_key" ON "AdminUser" (lower(trim("email")));
CREATE UNIQUE INDEX "SectorLeader_eventId_roleName_email_ci_key" ON "SectorLeader" ("eventId", "roleName", lower(trim("email")));
