-- Notification settings per organization (#381): which automatic emails go out, and the
-- reply-to address volunteers reach when they answer an email. Both nullable: absent means
-- the defaults (every reminder on, admins emailed at each sign-up, platform reply-to).
ALTER TABLE "Organization" ADD COLUMN "replyToEmail" TEXT;
ALTER TABLE "Organization" ADD COLUMN "notificationSettings" JSONB;
