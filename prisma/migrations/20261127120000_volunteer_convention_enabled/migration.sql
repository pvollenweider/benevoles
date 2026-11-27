-- « Demander aux bénévoles d'accepter une convention » (#1468): on by default, so a public
-- sign-up behaves exactly as before until an organisation turns it off. Additive, no data change.
ALTER TABLE "Organization"
  ADD COLUMN "volunteerConventionEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Without a convention, there is no acceptance proof to carry from a pending request to the
-- registrations it creates; both columns become nullable. Nothing is rewritten for existing rows.
ALTER TABLE "SignupConfirmation"
  ALTER COLUMN "charterAcceptedHash" DROP NOT NULL,
  ALTER COLUMN "charterAcceptedAt" DROP NOT NULL;
