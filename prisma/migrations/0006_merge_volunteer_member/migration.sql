-- ============================================================
-- 0006_merge_volunteer_member
-- Merges the Member table into Volunteer.
-- MemberInvite.memberId → volunteerId.
-- No data is lost: Member rows without a matching Volunteer
-- are inserted as new Volunteer rows.
-- ============================================================

-- Step 1: Extend Volunteer with new columns (nullable initially)
ALTER TABLE "Volunteer"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "tags"           TEXT[]   NOT NULL DEFAULT '{}',
  ADD COLUMN "active"         BOOLEAN  NOT NULL DEFAULT TRUE,
  ADD COLUMN "notes"          TEXT;

-- email was NOT NULL; make it nullable to support roster entries without email
ALTER TABLE "Volunteer" ALTER COLUMN "email" DROP NOT NULL;

-- Step 2: Set organizationId on existing Volunteers from their registrations
-- (picks the most-recent event's org for each volunteer)
UPDATE "Volunteer" v
SET "organizationId" = (
  SELECT e."organizationId"
  FROM "Registration" r
  JOIN "Event" e ON e.id = r."eventId"
  WHERE r."volunteerId" = v.id
  ORDER BY r."createdAt" DESC
  LIMIT 1
)
WHERE v."organizationId" IS NULL;

-- Step 3: Dedup — if two Volunteers now share (organizationId, email),
-- keep the earliest-created one and reassign Registrations to it.
WITH ranked AS (
  SELECT id, "organizationId", email,
         ROW_NUMBER() OVER (
           PARTITION BY "organizationId", email
           ORDER BY "createdAt" ASC
         ) AS rn
  FROM "Volunteer"
  WHERE "organizationId" IS NOT NULL AND email IS NOT NULL
),
keep AS (
  SELECT "organizationId", email, id AS keep_id
  FROM ranked WHERE rn = 1
),
dupes AS (
  SELECT ranked.id AS dupe_id, keep.keep_id
  FROM ranked
  JOIN keep
    ON keep."organizationId" = ranked."organizationId"
   AND keep.email            = ranked.email
  WHERE ranked.rn > 1
)
UPDATE "Registration" r
SET "volunteerId" = d.keep_id
FROM dupes d
WHERE r."volunteerId" = d.dupe_id;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "organizationId", email
           ORDER BY "createdAt" ASC
         ) AS rn
  FROM "Volunteer"
  WHERE "organizationId" IS NOT NULL AND email IS NOT NULL
)
DELETE FROM "Volunteer" WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 4: Copy tags / active / notes from Member to the matching Volunteer
UPDATE "Volunteer" v
SET tags   = m.tags,
    active = m.active,
    notes  = m.notes
FROM "Member" m
WHERE v.email IS NOT DISTINCT FROM m.email
  AND v."organizationId" = m."organizationId";

-- Step 5: Create Volunteer rows for Members that have no matching Volunteer
-- (roster entries added manually, never registered)
INSERT INTO "Volunteer" (
  id, "organizationId", "firstName", "lastName",
  email, phone, tags, active, notes,
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  m."organizationId",
  m."firstName",
  m."lastName",
  m.email,
  m.phone,
  m.tags,
  m.active,
  m.notes,
  m."createdAt",
  NOW()
FROM "Member" m
WHERE NOT EXISTS (
  SELECT 1 FROM "Volunteer" v
  WHERE v.email IS NOT DISTINCT FROM m.email
    AND v."organizationId" = m."organizationId"
);

-- Step 6: Migrate MemberInvite — add volunteerId, populate, drop memberId

ALTER TABLE "MemberInvite" ADD COLUMN "volunteerId" TEXT;

-- Populate from Member→Volunteer by (email, orgId)
UPDATE "MemberInvite" mi
SET "volunteerId" = v.id
FROM "Member" m
JOIN "Volunteer" v
  ON v.email IS NOT DISTINCT FROM m.email
 AND v."organizationId" = m."organizationId"
WHERE mi."memberId" = m.id;

-- Fallback: if still null, match by email only (edge case with null orgId)
UPDATE "MemberInvite" mi
SET "volunteerId" = (
  SELECT v.id
  FROM "Member" m
  JOIN "Volunteer" v ON v.email IS NOT DISTINCT FROM m.email
  WHERE m.id = mi."memberId"
  ORDER BY v."createdAt" ASC
  LIMIT 1
)
WHERE mi."volunteerId" IS NULL;

-- Drop invites that have no resolvable volunteer (orphaned invites)
DELETE FROM "MemberInvite" WHERE "volunteerId" IS NULL;

-- Make volunteerId required
ALTER TABLE "MemberInvite" ALTER COLUMN "volunteerId" SET NOT NULL;

-- Add FK: MemberInvite → Volunteer
ALTER TABLE "MemberInvite"
  ADD CONSTRAINT "MemberInvite_volunteerId_fkey"
    FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old memberId FK and column
ALTER TABLE "MemberInvite" DROP CONSTRAINT "MemberInvite_memberId_fkey";
ALTER TABLE "MemberInvite" DROP COLUMN "memberId";

-- Replace unique index (eventId, memberId) → (eventId, volunteerId)
DROP INDEX "MemberInvite_eventId_memberId_key";
CREATE UNIQUE INDEX "MemberInvite_eventId_volunteerId_key"
  ON "MemberInvite"("eventId", "volunteerId");

-- Step 7: Add unique constraint and indices on Volunteer
-- (Postgres treats NULLs as distinct — no enforcement when either field is NULL)
CREATE UNIQUE INDEX "Volunteer_organizationId_email_key"
  ON "Volunteer"("organizationId", email);

CREATE INDEX "Volunteer_organizationId_idx" ON "Volunteer"("organizationId");

-- Add FK: Volunteer → Organization (SET NULL on org delete)
ALTER TABLE "Volunteer"
  ADD CONSTRAINT "Volunteer_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 8: Drop Member table
-- (MemberInvite FK to Member was already dropped above)
DROP INDEX "Member_organizationId_email_key";
DROP INDEX "Member_organizationId_idx";
ALTER TABLE "Member" DROP CONSTRAINT "Member_organizationId_fkey";
DROP TABLE "Member";
