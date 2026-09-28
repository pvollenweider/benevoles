-- Store SHA-256 hashes of admin setup / password-reset tokens instead of the tokens (#269).
-- Rename in place and hash the pending values, so links already emailed keep working (the
-- app hashes the token from the URL the same way: lowercase hex SHA-256 of the UTF-8 string).

-- RenameColumn
ALTER TABLE "AdminUser" RENAME COLUMN "setupToken" TO "setupTokenHash";
ALTER TABLE "AdminUser" RENAME COLUMN "passwordResetToken" TO "passwordResetTokenHash";

-- RenameIndex
ALTER INDEX "AdminUser_setupToken_key" RENAME TO "AdminUser_setupTokenHash_key";
ALTER INDEX "AdminUser_passwordResetToken_key" RENAME TO "AdminUser_passwordResetTokenHash_key";
ALTER INDEX "AdminUser_setupToken_idx" RENAME TO "AdminUser_setupTokenHash_idx";

-- Hash pending tokens
UPDATE "AdminUser"
SET "setupTokenHash" = encode(sha256(convert_to("setupTokenHash", 'UTF8')), 'hex')
WHERE "setupTokenHash" IS NOT NULL;

UPDATE "AdminUser"
SET "passwordResetTokenHash" = encode(sha256(convert_to("passwordResetTokenHash", 'UTF8')), 'hex')
WHERE "passwordResetTokenHash" IS NOT NULL;
