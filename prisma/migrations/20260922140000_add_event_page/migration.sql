-- CreateTable
CREATE TABLE "EventPage" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventPage_eventId_idx" ON "EventPage"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventPage_eventId_slug_key" ON "EventPage"("eventId", "slug");

-- AddForeignKey
ALTER TABLE "EventPage" ADD CONSTRAINT "EventPage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
