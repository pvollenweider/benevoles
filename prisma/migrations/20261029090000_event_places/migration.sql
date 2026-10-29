-- Places of an event and a place per shift (#1171, lot 2), for the travel margin of the workload
-- protection. Additive: a new table and a nullable column; existing events and shifts have none.

-- CreateTable
CREATE TABLE "EventPlace" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPlace_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN "placeId" TEXT;

-- CreateIndex
CREATE INDEX "EventPlace_eventId_idx" ON "EventPlace"("eventId");
CREATE INDEX "Shift_placeId_idx" ON "Shift"("placeId");

-- A place name is unique per event among the places not archived, whatever its case or spaces.
-- Expression index: it can't be declared in schema.prisma (see the comment on the model).
CREATE UNIQUE INDEX "EventPlace_eventId_name_ci_key" ON "EventPlace"("eventId", lower(trim("name"))) WHERE "archivedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "EventPlace" ADD CONSTRAINT "EventPlace_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- The app never deletes a place (it archives it); SET NULL only covers a manual cleanup.
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "EventPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
