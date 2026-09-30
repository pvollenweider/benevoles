-- Registration window (#463): open by default, so every existing event keeps accepting sign-ups.
ALTER TABLE "Event" ADD COLUMN "registrationsOpen" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "registrationOpensAt" TIMESTAMP(3),
  ADD COLUMN "registrationClosesAt" TIMESTAMP(3);
