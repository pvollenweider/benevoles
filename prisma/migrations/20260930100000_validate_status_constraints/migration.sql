-- Validate the status CHECK constraints added NOT VALID in 20260929200000 (#345): existing rows
-- are now checked too, so a legacy value can no longer make an unrelated update of its row fail
-- later. Production was checked beforehand (no out-of-list values). VALIDATE only takes a SHARE
-- UPDATE EXCLUSIVE lock: reads and writes continue, compatible with the previous code.

ALTER TABLE "Registration" VALIDATE CONSTRAINT "Registration_status_check";
ALTER TABLE "Registration" VALIDATE CONSTRAINT "Registration_source_check";
ALTER TABLE "Shift" VALIDATE CONSTRAINT "Shift_status_check";
ALTER TABLE "Event" VALIDATE CONSTRAINT "Event_publicStatus_check";
ALTER TABLE "AdminUser" VALIDATE CONSTRAINT "AdminUser_role_check";
ALTER TABLE "NotificationOutbox" VALIDATE CONSTRAINT "NotificationOutbox_status_check";
ALTER TABLE "EventLog" VALIDATE CONSTRAINT "EventLog_actorType_check";
ALTER TABLE "OrgLog" VALIDATE CONSTRAINT "OrgLog_actorType_check";
