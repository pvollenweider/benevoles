-- Questions shown only for the roles a volunteer picks (#1140): an explicit display scope, apart from
-- "roleName" (which keeps routing answer-change emails). Additive, with defaults: every existing
-- question stays asked to the whole event, and pods still running the previous code keep working.
ALTER TABLE "EventQuestion" ADD COLUMN "displayScope" TEXT NOT NULL DEFAULT 'event';
ALTER TABLE "EventQuestion" ADD COLUMN "displayRoleNames" TEXT[] DEFAULT ARRAY[]::TEXT[];
