-- Breaks and workload protection policy per event (#1171, beta capability « workloadProtection »).
-- Additive, safe for pods still running the previous code: defaulted or nullable columns, no rewrite
-- of existing data. Every existing event keeps protection off; the organisation's default only
-- seeds new events, and only while the capability can be adopted.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "workloadPolicyDefault" JSONB;
ALTER TABLE "Event" ADD COLUMN "workloadProtectionEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "workloadPolicy" JSONB;
