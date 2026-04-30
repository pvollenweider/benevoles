-- ────────────────────────────────────────────────────────────────────────────
-- Multi-tenant foundation
--
-- Adds Organization + Member, scopes Event and AdminUser to an organization.
-- Existing data is migrated under a single "default" organization to keep
-- the application working without manual intervention.
-- ────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- Seed the default organization so existing rows can reference it
INSERT INTO "Organization" ("id", "name", "slug", "createdAt", "updatedAt")
VALUES ('default', 'Organisation par défaut', 'default', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "tags" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Member_organizationId_idx" ON "Member"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_organizationId_email_key" ON "Member"("organizationId", "email");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────────────────────
-- Event: scope to organization
-- Adds organizationId (default 'default' to backfill existing rows), then
-- removes the global slug uniqueness in favor of (organizationId, slug).
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Event" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "Event" ALTER COLUMN "organizationId" DROP DEFAULT;

DROP INDEX "Event_slug_key";

CREATE INDEX "Event_organizationId_idx" ON "Event"("organizationId");
CREATE UNIQUE INDEX "Event_organizationId_slug_key" ON "Event"("organizationId", "slug");

ALTER TABLE "Event" ADD CONSTRAINT "Event_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────────────────────
-- AdminUser: optional organizationId (NULL means super_admin / cross-tenant)
-- Backfill: every existing admin that is not a super_admin is attached to
-- the default organization.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE "AdminUser" ADD COLUMN "organizationId" TEXT;

UPDATE "AdminUser" SET "organizationId" = 'default' WHERE "role" <> 'super_admin';

CREATE INDEX "AdminUser_organizationId_idx" ON "AdminUser"("organizationId");

ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────────────────────
-- Volunteer: index email for fast lookups (used by future cross-event views)
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX "Volunteer_email_idx" ON "Volunteer"("email");
