-- Super-admin health page (#383): one row per scheduled job (reminders, cleanup, backup, offsite
-- copy, restore test) with its last run, so the page can say when each last succeeded.
CREATE TABLE "JobRun" (
    "job" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN,
    "error" TEXT,
    "summary" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("job")
);
