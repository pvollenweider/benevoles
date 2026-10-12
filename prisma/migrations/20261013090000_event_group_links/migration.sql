-- Share links per group (#947): one link and QR code per club or team, filtered by role, and the
-- registrations each one brought. Additive only: a nullable column and a new table.
-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "groupLinkId" TEXT;

-- CreateTable
CREATE TABLE "EventGroupLink" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hideFull" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventGroupLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventGroupLink_code_key" ON "EventGroupLink"("code");

-- CreateIndex
CREATE INDEX "EventGroupLink_eventId_idx" ON "EventGroupLink"("eventId");

-- CreateIndex
CREATE INDEX "Registration_groupLinkId_idx" ON "Registration"("groupLinkId");

-- AddForeignKey
ALTER TABLE "EventGroupLink" ADD CONSTRAINT "EventGroupLink_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_groupLinkId_fkey" FOREIGN KEY ("groupLinkId") REFERENCES "EventGroupLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

