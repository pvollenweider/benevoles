-- Existing duplicates (same volunteer, same shift, several live rows) would make the unique
-- index below fail. Keep the oldest live row of each pair and mark the others cancelled (not
-- deleted: registrations are kept for history).
UPDATE "Registration" r
SET "status" = 'cancelled', "waitingPosition" = NULL, "waitingOfferedAt" = NULL, "waitingExpiresAt" = NULL
WHERE r."status" IN ('active', 'waiting', 'offered')
  AND EXISTS (
    SELECT 1 FROM "Registration" o
    WHERE o."shiftId" = r."shiftId"
      AND o."volunteerId" = r."volunteerId"
      AND o."status" IN ('active', 'waiting', 'offered')
      AND (o."createdAt", o."id") < (r."createdAt", r."id")
  );

-- CreateIndex
CREATE UNIQUE INDEX "Registration_shift_volunteer_live_key" ON "Registration"("shiftId", "volunteerId") WHERE (status IN ('active', 'waiting', 'offered'));
