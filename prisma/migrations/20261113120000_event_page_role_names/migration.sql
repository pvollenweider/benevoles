-- #1324: attach an information page to the postes whose confirmed volunteers read it before
-- their shift. Additive with a default, so pods of the previous version still write EventPage
-- rows while the new version is rolled out (CONTRIBUTING.md, « Migrations compatibles »).
ALTER TABLE "EventPage" ADD COLUMN "roleNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
