-- Lightweight check-in (#399): when the organizer marked a registration present on site.
-- Nullable, no default: expand-only.

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "checkedInAt" TIMESTAMP(3);
