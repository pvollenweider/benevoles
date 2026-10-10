-- #811 ORG_INACTIVITY=on: the procedure under way, and the « Conserver mon organisation » links.
ALTER TABLE "Organization" ADD COLUMN "inactivityNoticeAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "inactivityEmailsSent" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "OrgKeepLink" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgKeepLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgKeepLink_tokenHash_key" ON "OrgKeepLink"("tokenHash");
CREATE INDEX "OrgKeepLink_organizationId_idx" ON "OrgKeepLink"("organizationId");
ALTER TABLE "OrgKeepLink" ADD CONSTRAINT "OrgKeepLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
