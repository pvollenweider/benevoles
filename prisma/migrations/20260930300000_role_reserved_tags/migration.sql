-- Roles reserved to members with a tag (#470), shared per role like colorKey.
ALTER TABLE "Shift" ADD COLUMN "reservedTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
