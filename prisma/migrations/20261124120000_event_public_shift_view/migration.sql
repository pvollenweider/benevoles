-- Default view of the shifts on an event's public page (#1407): "auto", "frise" or "liste".
ALTER TABLE "Event" ADD COLUMN "publicShiftView" TEXT NOT NULL DEFAULT 'auto';
