-- Permissions of an organisation awaiting the operator's validation (#810): two separate grants,
-- publishing (public pages) and emailing third parties, so a later risk-based validation can grant
-- them one by one. Null = not granted yet.
--
-- Granted by default at creation: every existing path that creates an organisation (super admin,
-- seeds, scripts) keeps creating a usable one; only the self-service sign-up creates one with both
-- explicitly null. Existing organisations: granted from their creation date.
ALTER TABLE "Organization" ADD COLUMN "publicationApprovedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Organization" ADD COLUMN "outboundEmailApprovedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
UPDATE "Organization" SET "publicationApprovedAt" = "createdAt", "outboundEmailApprovedAt" = "createdAt";
