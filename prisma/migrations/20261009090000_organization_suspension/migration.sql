-- Suspension of an organisation for abuse (#810), distinct from a plain deactivation: never
-- reactivated by « Réactiver » nor by any self-service flow until the super admin lifts it, and
-- never erased by the nightly cleanup (data kept for the investigation). Additive only.
ALTER TABLE "Organization" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "suspensionReason" TEXT;
