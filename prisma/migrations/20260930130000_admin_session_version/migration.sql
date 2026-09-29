-- Session version of an admin (#360): incremented on password change or reset, compared with the
-- value in the JWT on every request. NOT NULL with a default: existing rows get 0, which is also
-- what tokens issued before this change are treated as, so nobody is signed out by the deploy.

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;
