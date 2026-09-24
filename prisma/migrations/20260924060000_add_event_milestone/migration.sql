-- CreateTable
CREATE TABLE "EventMilestone" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventMilestone_eventId_idx" ON "EventMilestone"("eventId");

-- AddForeignKey
ALTER TABLE "EventMilestone" ADD CONSTRAINT "EventMilestone_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
