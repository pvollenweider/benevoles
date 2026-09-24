-- CreateTable
CREATE TABLE "OrgLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgLog_organizationId_createdAt_idx" ON "OrgLog"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrgLog" ADD CONSTRAINT "OrgLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
