-- Normalize stored email addresses to trimmed lower case (#310), the form the app now writes
-- and looks up. Data-only and compatible with the previous code (expand/contract): no schema
-- change. A row is only rewritten when that doesn't collide with another row's unique key;
-- case-only duplicates (e.g. "Alice@x.com" and "alice@x.com" in the same organization) are left
-- as they are rather than merged automatically.

UPDATE "Volunteer" v
SET "email" = lower(trim(v."email"))
WHERE v."email" IS NOT NULL
  AND v."email" <> lower(trim(v."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "Volunteer" o
    WHERE o."id" <> v."id"
      AND o."organizationId" IS NOT DISTINCT FROM v."organizationId"
      AND lower(trim(o."email")) = lower(trim(v."email"))
  );

UPDATE "AdminUser" a
SET "email" = lower(trim(a."email"))
WHERE a."email" <> lower(trim(a."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "AdminUser" o
    WHERE o."id" <> a."id" AND lower(trim(o."email")) = lower(trim(a."email"))
  );

UPDATE "SectorLeader" s
SET "email" = lower(trim(s."email"))
WHERE s."email" <> lower(trim(s."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "SectorLeader" o
    WHERE o."id" <> s."id"
      AND o."eventId" = s."eventId"
      AND o."roleName" = s."roleName"
      AND lower(trim(o."email")) = lower(trim(s."email"))
  );
