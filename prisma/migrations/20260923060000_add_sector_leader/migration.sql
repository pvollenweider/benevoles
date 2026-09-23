-- CreateTable
CREATE TABLE "SectorLeader" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectorLeader_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SectorLeader_token_key" ON "SectorLeader"("token");

-- CreateIndex
CREATE INDEX "SectorLeader_eventId_idx" ON "SectorLeader"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "SectorLeader_eventId_roleName_email_key" ON "SectorLeader"("eventId", "roleName", "email");

-- AddForeignKey
ALTER TABLE "SectorLeader" ADD CONSTRAINT "SectorLeader_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
