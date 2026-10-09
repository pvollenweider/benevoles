-- #810: the operator's decisions, kept apart from the organisation's own log.
CREATE TABLE "OperatorLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperatorLog_createdAt_idx" ON "OperatorLog"("createdAt");
