-- Possible duplicate members (#601): dismissing a suggested pair so it stops being shown, until a
-- new kind of signal appears for it. Additive only: a new table, nothing existing is touched.

-- CreateTable
CREATE TABLE "DuplicateDismissal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "volunteerIdA" TEXT NOT NULL,
    "volunteerIdB" TEXT NOT NULL,
    "signalsFingerprint" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedBy" TEXT,

    CONSTRAINT "DuplicateDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DuplicateDismissal_organizationId_idx" ON "DuplicateDismissal"("organizationId");

-- CreateIndex
CREATE INDEX "DuplicateDismissal_volunteerIdA_idx" ON "DuplicateDismissal"("volunteerIdA");

-- CreateIndex
CREATE INDEX "DuplicateDismissal_volunteerIdB_idx" ON "DuplicateDismissal"("volunteerIdB");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateDismissal_organizationId_volunteerIdA_volunteerId_key" ON "DuplicateDismissal"("organizationId", "volunteerIdA", "volunteerIdB", "signalsFingerprint");

-- AddForeignKey
ALTER TABLE "DuplicateDismissal" ADD CONSTRAINT "DuplicateDismissal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateDismissal" ADD CONSTRAINT "DuplicateDismissal_volunteerIdA_fkey" FOREIGN KEY ("volunteerIdA") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateDismissal" ADD CONSTRAINT "DuplicateDismissal_volunteerIdB_fkey" FOREIGN KEY ("volunteerIdB") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
