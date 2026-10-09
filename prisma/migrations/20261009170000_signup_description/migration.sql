-- #810: the association's description of itself and its need, typed on the sign-up form.
ALTER TABLE "SignupRequest" ADD COLUMN "description" TEXT;
ALTER TABLE "Organization" ADD COLUMN "signupDescription" TEXT;
