import type { DataSource } from "@/lib/types";
import { reposDataset } from "./datasets/repos";

export const githubSource: DataSource = {
  name: "github",
  auth: { kind: "bearer", tokenEnvVar: "GITHUB_TOKEN" },
  datasets: {
    [reposDataset.name]: reposDataset,
  },
};
