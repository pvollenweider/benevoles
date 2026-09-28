-- Volunteer-facing tokens (#290): add a SHA-256 lookup column and an encrypted copy, keep the
-- clear-text column (now nullable, "legacy") until the app encrypts it (cleanup cron, once
-- TOKEN_ENCRYPTION_KEY is set). Hashes are computed in place from the existing clear text, the
-- same way the app hashes the token from a URL, so every link already sent keeps working.

-- DropIndex
DROP INDEX "SectorLeader_token_key";
DROP INDEX "Registration_editToken_key";
DROP INDEX "MemberInvite_token_key";
DROP INDEX "MemberInvite_token_idx";

-- AddColumns
ALTER TABLE "SectorLeader" ADD COLUMN "tokenEnc" TEXT, ADD COLUMN "tokenHash" TEXT;
ALTER TABLE "Registration" ADD COLUMN "editTokenEnc" TEXT, ADD COLUMN "editTokenHash" TEXT;
ALTER TABLE "MemberInvite" ADD COLUMN "tokenEnc" TEXT, ADD COLUMN "tokenHash" TEXT;

-- Backfill hashes from the clear text
UPDATE "SectorLeader" SET "tokenHash" = encode(sha256(convert_to("token", 'UTF8')), 'hex');
UPDATE "Registration" SET "editTokenHash" = encode(sha256(convert_to("editToken", 'UTF8')), 'hex');
UPDATE "MemberInvite" SET "tokenHash" = encode(sha256(convert_to("token", 'UTF8')), 'hex');

-- AlterTable
ALTER TABLE "SectorLeader" ALTER COLUMN "tokenHash" SET NOT NULL, ALTER COLUMN "token" DROP NOT NULL;
ALTER TABLE "Registration" ALTER COLUMN "editTokenHash" SET NOT NULL, ALTER COLUMN "editToken" DROP NOT NULL;
ALTER TABLE "MemberInvite" ALTER COLUMN "tokenHash" SET NOT NULL, ALTER COLUMN "token" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SectorLeader_tokenHash_key" ON "SectorLeader"("tokenHash");
CREATE UNIQUE INDEX "Registration_editTokenHash_key" ON "Registration"("editTokenHash");
CREATE UNIQUE INDEX "MemberInvite_tokenHash_key" ON "MemberInvite"("tokenHash");
