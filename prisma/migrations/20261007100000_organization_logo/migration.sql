-- Organization logo (#300): one processed image per organization (PNG or JPEG, resized
-- server-side), in its own table so organization queries never load the bytes, deleted with the
-- organization. Additive only.

-- CreateTable
CREATE TABLE "OrganizationLogo" (
    "organizationId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationLogo_pkey" PRIMARY KEY ("organizationId")
);

-- AddForeignKey
ALTER TABLE "OrganizationLogo" ADD CONSTRAINT "OrganizationLogo_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
