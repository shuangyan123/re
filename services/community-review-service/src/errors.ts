export type CommunityReviewServiceErrorCode =
  | "reviewer_not_found"
  | "reviewer_not_authorized"
  | "qualification_pool_not_found"
  | "qualification_attempt_not_found"
  | "qualification_receipt_invalid"
  | "qualification_receipt_not_authoritative"
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
  reviewer_not_found: "Community Review reviewer account was not found.",
  reviewer_not_authorized: "Community Review reviewer is not authorized for this operation.",
  qualification_pool_not_found: "Community Review qualification pool was not found.",
  qualification_attempt_not_found: "Community Review qualification attempt was not found.",
  qualification_receipt_invalid: "Community Review qualification receipt is invalid.",
  qualification_receipt_not_authoritative:
    "Community Review qualification receipt is not authoritative in service persistence.",
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
