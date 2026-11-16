-- « Comment avez-vous connu benevol.app ? » (#1094): optional answer of the space request form,
-- stored with the request and copied to the organisation. Additive, nullable: existing rows unchanged.
ALTER TABLE "SignupRequest" ADD COLUMN "source" TEXT;
ALTER TABLE "SignupRequest" ADD COLUMN "sourceDetail" TEXT;
ALTER TABLE "Organization" ADD COLUMN "signupSource" TEXT;
ALTER TABLE "Organization" ADD COLUMN "signupSourceDetail" TEXT;
