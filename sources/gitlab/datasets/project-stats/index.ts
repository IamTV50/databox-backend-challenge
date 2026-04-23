import type { Dataset } from "@/lib/types";
import { rawSchema, rowSchema, type Raw, type Row } from "./schema";
import { extract } from "./extract";
import { transform } from "./transform";

export const projectStatsDataset: Dataset<Raw, Row> = {
  name: "project-stats",
  datasetIdEnvVar: "GITLAB_PROJECT_STATS_DATASET_ID",
  rawSchema,
  rowSchema,
  extract,
  transform,
};
