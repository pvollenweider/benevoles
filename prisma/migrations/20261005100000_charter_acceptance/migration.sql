-- Proof of acceptance of the volunteer charter at public sign-up (#569): stored on the
-- registration itself (one sign-up may create several, one row each), with the accepted text's
-- SHA-256 resolved back to its text later via CharterVersion. Additive only.

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN "charterAcceptedHash" TEXT,
ADD COLUMN "charterAcceptedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CharterVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharterVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharterVersion_organizationId_idx" ON "CharterVersion"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CharterVersion_organizationId_hash_key" ON "CharterVersion"("organizationId", "hash");

-- AddForeignKey
ALTER TABLE "CharterVersion" ADD CONSTRAINT "CharterVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
