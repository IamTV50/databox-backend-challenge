import type { Dataset } from "@/lib/types";
import { rawSchema, rowSchema, type Repo, type Row } from "./schema";
import { extract } from "./extract";
import { transform } from "./transform";

export const reposDataset: Dataset<Repo[], Row> = {
  name: "repos",
  datasetIdEnvVar: "GITHUB_REPOS_DATASET_ID",
  rawSchema,
  rowSchema,
  extract,
  transform,
};
