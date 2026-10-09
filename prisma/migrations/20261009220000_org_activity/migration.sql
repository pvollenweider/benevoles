-- #811: when an organisation was last really used, and last confirmed it wants to keep its space.
ALTER TABLE "Organization" ADD COLUMN "lastMeaningfulActivityAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "lastRetentionConfirmedAt" TIMESTAMP(3);

-- Initialised from the existing data (the latest event, shift, registration or member), else the
-- organisation's creation; nobody is inactive on the day this ships.
UPDATE "Organization" o SET "lastMeaningfulActivityAt" = GREATEST(
  o."createdAt",
  (SELECT MAX(e."updatedAt") FROM "Event" e WHERE e."organizationId" = o."id"),
  (SELECT MAX(s."createdAt") FROM "Shift" s JOIN "Event" e ON e."id" = s."eventId" WHERE e."organizationId" = o."id"),
  (SELECT MAX(r."createdAt") FROM "Registration" r JOIN "Event" e ON e."id" = r."eventId" WHERE e."organizationId" = o."id"),
  (SELECT MAX(v."createdAt") FROM "Volunteer" v WHERE v."organizationId" = o."id")
);
