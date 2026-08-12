import { buildTutorEvalCoverageReport, loadTutorEvalDataset } from "../datasets/index.js";
import { TUTOR_EVAL_DATASET_ID } from "../contracts/index.js";

const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
console.log(JSON.stringify(buildTutorEvalCoverageReport(dataset), null, 2));
