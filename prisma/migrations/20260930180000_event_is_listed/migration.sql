-- Unlisted events (#414): reachable by link, absent from public lists. Every existing event
-- stays listed (default true). Additive, safe with the previous release still running.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "isListed" BOOLEAN NOT NULL DEFAULT true;
