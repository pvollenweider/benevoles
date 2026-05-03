ALTER TABLE "Registration" ADD COLUMN "waitingPosition" INTEGER;
ALTER TABLE "Registration" ADD COLUMN "waitingOfferedAt" TIMESTAMP(3);
ALTER TABLE "Registration" ADD COLUMN "waitingExpiresAt" TIMESTAMP(3);
ALTER TABLE "Shift" ADD COLUMN "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Registration_status_shiftId_idx" ON "Registration"("status", "shiftId");
CREATE INDEX "Registration_waitingPosition_shiftId_idx" ON "Registration"("waitingPosition", "shiftId");
