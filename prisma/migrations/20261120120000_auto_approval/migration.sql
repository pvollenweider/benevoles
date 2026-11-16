-- Automatic validation of new spaces (#1371, second pull request). Additive, nullable, no
-- backfill: the previous release ignores these columns and the deployment stays compatible.
--
-- Organization.autoApprovedAt is written only by the automatic path (approveOrganization with the
-- automatic actor); Organization.autoApprovalReviewedAt is written when the operator marks that
-- validation as reviewed. AdminUser.activatedAt is the instant the account became active by its
-- one-time link, which the automatic validation waits on (AUTO_APPROVAL_MIN_AGE_MINUTES).
ALTER TABLE "Organization"
  ADD COLUMN "autoApprovedAt" TIMESTAMP(3),
  ADD COLUMN "autoApprovalReviewedAt" TIMESTAMP(3);

ALTER TABLE "AdminUser" ADD COLUMN "activatedAt" TIMESTAMP(3);
