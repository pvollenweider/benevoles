-- Block list of the self-service sign-up (#810, part 5): an email address, a domain (exceptional)
-- or an IP address (always with an expiry, stored only as a keyed hash). Each entry has a reason.
CREATE TABLE "SignupBlock" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupBlock_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SignupBlock_kind_check" CHECK ("kind" IN ('email', 'domain', 'ip'))
);

CREATE UNIQUE INDEX "SignupBlock_kind_value_key" ON "SignupBlock"("kind", "value");
