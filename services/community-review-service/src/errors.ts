export type CommunityReviewServiceErrorCode =
  | "authentication_required"
  | "authentication_failed"
  | "authentication_subject_not_found"
  | "operator_not_authorized"
  | "reviewer_not_found"
  | "reviewer_not_authorized"
  | "reviewer_account_withdrawn"
  | "reviewer_account_disabled"
  | "consent_required"
  | "consent_revoked"
  | "consent_stale"
  | "qualification_pool_not_found"
  | "qualification_pool_not_active"
  | "qualification_pool_invalid_state"
  | "qualification_material_not_found"
  | "qualification_material_invalid"
  | "qualification_attempt_not_found"
  | "qualification_attempt_not_owner"
  | "qualification_attempt_already_submitted"
  | "qualification_attempt_limit"
  | "qualification_packet_invalid"
  | "qualification_response_invalid"
  | "qualification_not_qualified"
  | "qualification_receipt_not_issued"
  | "qualification_receipt_invalid"
  | "qualification_receipt_not_authoritative"
  | "no_eligible_review_batch"
  | "review_batch_material_not_found"
  | "review_batch_material_invalid"
  | "batch_not_found"
  | "batch_not_open"
  | "batch_not_closed"
  | "assignment_not_found"
  | "assignment_withdrawn"
  | "duplicate_assignment"
  | "submission_already_exists"
  | "replacement_submission"
  | "repository_conflict"
  | "invalid_service_record";

const messages: Record<CommunityReviewServiceErrorCode, string> = {
  authentication_required: "Community Review authentication is required.",
  authentication_failed: "Community Review authentication failed.",
  authentication_subject_not_found: "Authenticated Community Review principal is not provisioned.",
  operator_not_authorized: "Community Review operator authorization is required.",
  reviewer_not_found: "Community Review reviewer account was not found.",
  reviewer_not_authorized: "Community Review reviewer is not authorized for this operation.",
  reviewer_account_withdrawn: "Community Review reviewer account has been withdrawn.",
  reviewer_account_disabled: "Community Review reviewer account is disabled.",
  consent_required: "Current Community Review consent is required.",
  consent_revoked: "Current Community Review consent has been revoked.",
  consent_stale: "Current Community Review consent is for a stale policy version.",
  qualification_pool_not_found: "Community Review qualification pool was not found.",
  qualification_pool_not_active: "Community Review qualification pool is not active for new attempts.",
  qualification_pool_invalid_state: "Community Review qualification pool cannot make that state transition.",
  qualification_material_not_found: "Sealed Community Review qualification material was not found.",
  qualification_material_invalid: "Sealed Community Review qualification material failed validation.",
  qualification_attempt_not_found: "Community Review qualification attempt was not found.",
  qualification_attempt_not_owner: "Community Review qualification attempt does not belong to this reviewer.",
  qualification_attempt_already_submitted: "Community Review qualification attempt has already been submitted.",
  qualification_attempt_limit: "Community Review qualification attempt limit was reached.",
  qualification_packet_invalid: "Community Review qualification packet is invalid.",
  qualification_response_invalid: "Community Review qualification response is incomplete or invalid.",
  qualification_not_qualified: "Community Review qualification attempt did not qualify.",
  qualification_receipt_not_issued: "Community Review qualification receipt has not been issued.",
  qualification_receipt_invalid: "Community Review qualification receipt is invalid.",
  qualification_receipt_not_authoritative:
    "Community Review qualification receipt is not authoritative in service persistence.",
  no_eligible_review_batch: "No eligible open Community Review batch is available.",
  review_batch_material_not_found: "Sealed Community Review batch material was not found.",
  review_batch_material_invalid: "Sealed Community Review batch material failed validation.",
  batch_not_found: "Community Review batch was not found.",
  batch_not_open: "Community Review batch is not open for this operation.",
  batch_not_closed: "Community Review batch is not closed for this operation.",
  assignment_not_found: "Community Review assignment was not found.",
  assignment_withdrawn: "Community Review assignment is withdrawn.",
  duplicate_assignment: "Community Review assignment already exists with different evidence.",
  submission_already_exists: "Community Review submission already exists.",
  replacement_submission: "Community Review replacement submission is not accepted.",
  repository_conflict: "Community Review persistence uniqueness constraint was violated.",
  invalid_service_record: "Community Review service record is invalid.",
};

export class CommunityReviewServiceError extends Error {
  readonly code: CommunityReviewServiceErrorCode;

  constructor(code: CommunityReviewServiceErrorCode) {
    super(messages[code]);
    this.name = "CommunityReviewServiceError";
    this.code = code;
  }
}
