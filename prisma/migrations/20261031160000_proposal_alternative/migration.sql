-- « Proposer une autre répartition » (#1172): a run launched from an earlier one tries further
-- seeds until its result differs from the earlier results with the same choices.
ALTER TABLE "ProposalRun" ADD COLUMN "alternative" BOOLEAN NOT NULL DEFAULT false;
-- Its search found nothing different within the budget: nothing written, the drafts kept.
ALTER TABLE "ProposalRun" DROP CONSTRAINT "ProposalRun_stop_reason_check";
ALTER TABLE "ProposalRun" ADD CONSTRAINT "ProposalRun_stop_reason_check" CHECK ("stopReason" IN ('budget', 'iterations', 'deadline', 'cancelled', 'lease_expired', 'error', 'no_other'));
