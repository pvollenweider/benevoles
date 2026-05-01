CREATE TABLE "OrgSlugHistory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgSlugHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgSlugHistory_slug_key" ON "OrgSlugHistory"("slug");

ALTER TABLE "OrgSlugHistory" ADD CONSTRAINT "OrgSlugHistory_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
