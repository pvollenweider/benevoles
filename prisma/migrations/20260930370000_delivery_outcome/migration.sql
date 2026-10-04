-- DeliveryOutcome (#598): per-recipient SMTP outcome of a send. No raw reply, no address, no
-- content, no token: only codes, a normalized reason, and a hash of the normalized address.
CREATE TABLE "DeliveryOutcome" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "volunteerId" TEXT,
    "outboxId" TEXT,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "responseCode" INTEGER,
    "enhancedStatus" TEXT,
    "addressHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryOutcome_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryOutcome_organizationId_createdAt_idx" ON "DeliveryOutcome"("organizationId", "createdAt");

CREATE INDEX "DeliveryOutcome_volunteerId_createdAt_idx" ON "DeliveryOutcome"("volunteerId", "createdAt");

CREATE INDEX "DeliveryOutcome_addressHash_createdAt_idx" ON "DeliveryOutcome"("addressHash", "createdAt");

ALTER TABLE "DeliveryOutcome" ADD CONSTRAINT "DeliveryOutcome_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
