-- ────────────────────────────────────────────────────────────────────────────
-- Sprint 4 — Admin invitations + organization soft-delete + password reset
--
-- Adds:
--   • Organization.isActive (soft-delete)
--   • AdminInvitation (token-based admin invitations per org)
--   • PasswordResetToken (forgot-password flow)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Organization"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "AdminInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminInvitation_token_key" ON "AdminInvitation"("token");
CREATE UNIQUE INDEX "AdminInvitation_email_organizationId_key"
    ON "AdminInvitation"("email", "organizationId");
CREATE INDEX "AdminInvitation_organizationId_idx" ON "AdminInvitation"("organizationId");
CREATE INDEX "AdminInvitation_token_idx" ON "AdminInvitation"("token");

ALTER TABLE "AdminInvitation" ADD CONSTRAINT "AdminInvitation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminInvitation" ADD CONSTRAINT "AdminInvitation_invitedBy_fkey"
    FOREIGN KEY ("invitedBy") REFERENCES "AdminUser"("id")
    ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "AdminUser"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
