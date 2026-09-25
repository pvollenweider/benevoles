-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "receiveProductUpdates" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AdminUser" ADD COLUMN "productUpdatesUnsubscribedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProductUpdateSend" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sentByAdminId" TEXT,
    "recipientCount" INTEGER NOT NULL,
    "successCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductUpdateSend_pkey" PRIMARY KEY ("id")
);
