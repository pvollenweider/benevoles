-- Cumulative usage counters for the super admin (#805): how many organisations, events, shifts,
-- registrations, members, admin accounts, sector leaders and member invitations have ever been
-- created. They only go up: deleting a row never lowers them. Counts only, no personal data.
--
-- PlatformCounter: one row per metric, never touched by a deletion (a deleted organisation's
-- counts stay in the platform totals). OrganizationCounter: one row per organisation and metric,
-- deleted with its organisation (owner decision, 2026-10-08).
--
-- Incremented by AFTER INSERT triggers, in the inserting transaction: every creation path (forms,
-- series, duplication, import, seed, scripts) is counted once, and a rolled-back insert is not.
-- Prisma does not model triggers; they live in this migration only (see src/lib/usage-counters.ts).

-- CreateTable
CREATE TABLE "PlatformCounter" (
    "metric" TEXT NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "PlatformCounter_pkey" PRIMARY KEY ("metric")
);

-- CreateTable
CREATE TABLE "OrganizationCounter" (
    "organizationId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "OrganizationCounter_pkey" PRIMARY KEY ("organizationId", "metric")
);

-- AddForeignKey
ALTER TABLE "OrganizationCounter" ADD CONSTRAINT "OrganizationCounter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TG_ARGV[0]: the metric. TG_ARGV[1]: how to find the row's organisation: 'self' (the
-- Organization row: platform counter only), 'organizationId' (nullable column on the row) or
-- 'eventId' (through its event).
CREATE FUNCTION usage_counter_increment() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  org_id TEXT;
BEGIN
  INSERT INTO "PlatformCounter" ("metric", "value") VALUES (TG_ARGV[0], 1)
    ON CONFLICT ("metric") DO UPDATE SET "value" = "PlatformCounter"."value" + 1;

  IF TG_ARGV[1] = 'organizationId' THEN
    org_id := NEW."organizationId";
  ELSIF TG_ARGV[1] = 'eventId' THEN
    SELECT "organizationId" INTO org_id FROM "Event" WHERE "id" = NEW."eventId";
  END IF;

  IF org_id IS NOT NULL THEN
    INSERT INTO "OrganizationCounter" ("organizationId", "metric", "value") VALUES (org_id, TG_ARGV[0], 1)
      ON CONFLICT ("organizationId", "metric") DO UPDATE SET "value" = "OrganizationCounter"."value" + 1;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER "usage_counter_organizations" AFTER INSERT ON "Organization" FOR EACH ROW EXECUTE FUNCTION usage_counter_increment('organizations', 'self');
CREATE TRIGGER "usage_counter_events" AFTER INSERT ON "Event" FOR EACH ROW EXECUTE FUNCTION usage_counter_increment('events', 'organizationId');
CREATE TRIGGER "usage_counter_shifts" AFTER INSERT ON "Shift" FOR EACH ROW EXECUTE FUNCTION usage_counter_increment('shifts', 'eventId');
CREATE TRIGGER "usage_counter_registrations" AFTER INSERT ON "Registration" FOR EACH ROW EXECUTE FUNCTION usage_counter_increment('registrations', 'eventId');
CREATE TRIGGER "usage_counter_members" AFTER INSERT ON "Volunteer" FOR EACH ROW EXECUTE FUNCTION usage_counter_increment('members', 'organizationId');
CREATE TRIGGER "usage_counter_admins" AFTER INSERT ON "AdminUser" FOR EACH ROW EXECUTE FUNCTION usage_counter_increment('admins', 'organizationId');
CREATE TRIGGER "usage_counter_sector_leaders" AFTER INSERT ON "SectorLeader" FOR EACH ROW EXECUTE FUNCTION usage_counter_increment('sector_leaders', 'eventId');
CREATE TRIGGER "usage_counter_member_invites" AFTER INSERT ON "MemberInvite" FOR EACH ROW EXECUTE FUNCTION usage_counter_increment('member_invites', 'eventId');

-- Backfill from what exists today (owner decision): what was deleted before cannot be recovered.
INSERT INTO "PlatformCounter" ("metric", "value")
          SELECT 'organizations', COUNT(*) FROM "Organization"
UNION ALL SELECT 'events', COUNT(*) FROM "Event"
UNION ALL SELECT 'shifts', COUNT(*) FROM "Shift"
UNION ALL SELECT 'registrations', COUNT(*) FROM "Registration"
UNION ALL SELECT 'members', COUNT(*) FROM "Volunteer"
UNION ALL SELECT 'admins', COUNT(*) FROM "AdminUser"
UNION ALL SELECT 'sector_leaders', COUNT(*) FROM "SectorLeader"
UNION ALL SELECT 'member_invites', COUNT(*) FROM "MemberInvite";

INSERT INTO "OrganizationCounter" ("organizationId", "metric", "value")
          SELECT "organizationId", 'events', COUNT(*) FROM "Event" GROUP BY "organizationId"
UNION ALL SELECT e."organizationId", 'shifts', COUNT(*) FROM "Shift" s JOIN "Event" e ON e."id" = s."eventId" GROUP BY e."organizationId"
UNION ALL SELECT e."organizationId", 'registrations', COUNT(*) FROM "Registration" r JOIN "Event" e ON e."id" = r."eventId" GROUP BY e."organizationId"
UNION ALL SELECT "organizationId", 'members', COUNT(*) FROM "Volunteer" WHERE "organizationId" IS NOT NULL GROUP BY "organizationId"
UNION ALL SELECT "organizationId", 'admins', COUNT(*) FROM "AdminUser" WHERE "organizationId" IS NOT NULL GROUP BY "organizationId"
UNION ALL SELECT e."organizationId", 'sector_leaders', COUNT(*) FROM "SectorLeader" l JOIN "Event" e ON e."id" = l."eventId" GROUP BY e."organizationId"
UNION ALL SELECT e."organizationId", 'member_invites', COUNT(*) FROM "MemberInvite" i JOIN "Event" e ON e."id" = i."eventId" GROUP BY e."organizationId";
