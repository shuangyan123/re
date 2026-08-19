import type {
  MaterialRequirementAssessment,
  MaterialRequirementDerivedLabel,
} from "../contracts/index.js";

/** Public, provider-free severity policy for the experimental Judge path. */
export function aggregateMaterialRequirementAssessments(
  assessments: readonly Pick<MaterialRequirementAssessment, "status">[],
): MaterialRequirementDerivedLabel {
  if (assessments.length === 0) {
    throw new Error("At least one material requirement assessment is required.");
  }
  if (assessments.some((assessment) => assessment.status === "EXPLICIT_CONFLICT")) {
    return "FAIL";
  }
  const satisfiedCount = assessments.filter(
    (assessment) => assessment.status === "SATISFIED",
  ).length;
  if (satisfiedCount === assessments.length) {
    return "PASS";
  }
  return satisfiedCount === 0 ? "FAIL" : "PARTIAL";
}
