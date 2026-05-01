-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);
ALTER TABLE "AdminUser" ADD COLUMN "passwordResetToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_passwordResetToken_key" ON "AdminUser"("passwordResetToken");
