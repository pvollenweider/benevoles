-- Optional sectors grouping several postes (#1147). Additive, safe for pods still running the
-- previous code: a new table, nullable or defaulted columns, no rewrite of existing data. Every
-- existing event keeps its simple « postes → créneaux » structure (sectorsEnabled false, no
-- sector), every organisation's default stays off.

-- CreateTable
CREATE TABLE "Sector" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sector_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "sectorsDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "sectorsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "sectorsAdoptedAt" TIMESTAMP(3);
ALTER TABLE "Shift" ADD COLUMN "sectorId" TEXT;

-- CreateIndex
CREATE INDEX "Sector_eventId_idx" ON "Sector"("eventId");
CREATE INDEX "Shift_sectorId_idx" ON "Shift"("sectorId");

-- A sector name is unique per event among the sectors not archived, whatever its case or spaces
-- (« Parking » and « parking » are the same sector). An archived « Parking » keeps its name and
-- never blocks a new one. Expression index: it can't be declared in schema.prisma (see the
-- comment on the model).
CREATE UNIQUE INDEX "Sector_eventId_name_ci_key" ON "Sector"("eventId", lower(trim("name"))) WHERE "archivedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "Sector" ADD CONSTRAINT "Sector_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- The app never deletes a sector (it archives it); SET NULL only covers a manual cleanup.
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE SET NULL ON UPDATE CASCADE;
