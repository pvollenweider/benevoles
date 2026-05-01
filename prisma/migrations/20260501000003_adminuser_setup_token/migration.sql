ALTER TABLE "AdminUser"
  ADD COLUMN "setupToken" TEXT,
  ADD COLUMN "setupTokenExpiresAt" TIMESTAMP(3);

ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_setupToken_key" UNIQUE ("setupToken");
CREATE INDEX "AdminUser_setupToken_idx" ON "AdminUser"("setupToken");
