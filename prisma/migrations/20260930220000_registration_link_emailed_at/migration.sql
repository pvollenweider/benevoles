-- Personal links explained (#376): when an email carrying the personal link last went out for
-- this registration (confirmation, re-send), shown on the personal page.
ALTER TABLE "Registration" ADD COLUMN "linkEmailedAt" TIMESTAMP(3);
