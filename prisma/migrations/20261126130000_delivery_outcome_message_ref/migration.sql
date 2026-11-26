-- Random reference of a direct send's Message-ID: lets a deferred bounce find the
-- DeliveryOutcome rows of that send without trusting anything in the notice. Additive and
-- nullable, safe while pods of the previous version still run: no default, no backfill. Existing
-- rows (outbox sends and direct sends of the previous version) keep NULL and are matched by
-- `outboxId` when they have one; a direct send without it stays uncorrelated (legacy notices).

ALTER TABLE "DeliveryOutcome"
  ADD COLUMN "messageRef" TEXT;

CREATE INDEX "DeliveryOutcome_messageRef_idx" ON "DeliveryOutcome"("messageRef");
