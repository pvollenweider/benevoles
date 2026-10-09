-- Self-service sign-up requests (#810, part 4b): what someone typed on /inscription, until the
-- address is confirmed (link sent by email, valid 24 h). Only the hash of the confirmation token
-- is stored. Deleted by the nightly cleanup 7 days after creation, confirmed or not (the
-- organisation and its owner account then exist on their own).
CREATE TABLE "SignupRequest" (
    "id" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SignupRequest_tokenHash_key" ON "SignupRequest"("tokenHash");
CREATE INDEX "SignupRequest_createdAt_idx" ON "SignupRequest"("createdAt");
