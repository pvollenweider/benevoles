-- Sign-up approval (#484): a shift can turn public sign-ups into requests.
ALTER TABLE "Shift" ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false;

-- New registration statuses: "requested" (holds a spot, live) and "refused" (terminal, kept for
-- history). Widening only: every value the previous code writes stays valid.
ALTER TABLE "Registration" DROP CONSTRAINT "Registration_status_check";
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_status_check" CHECK ("status" IN ('active', 'waiting', 'offered', 'requested', 'cancelled', 'refused', 'deleted'));

-- A request is a live registration: one per volunteer and shift, like the others (#264).
DROP INDEX "Registration_shift_volunteer_live_key";
CREATE UNIQUE INDEX "Registration_shift_volunteer_live_key" ON "Registration"("shiftId", "volunteerId") WHERE (status IN ('active', 'waiting', 'offered', 'requested'));
