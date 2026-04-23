import type { DataSource } from "@/lib/types";
import { projectStatsDataset } from "./datasets/project-stats";

export const gitlabSource: DataSource = {
  name: "gitlab",
  auth: {
    kind: "oauth2",
    clientIdEnvVar: "GITLAB_CLIENT_ID",
    clientSecretEnvVar: "GITLAB_CLIENT_SECRET",
    refreshTokenEnvVar: "GITLAB_REFRESH_TOKEN",
    tokenUrl: "https://gitlab.com/oauth/token",
  },
  datasets: {
    [projectStatsDataset.name]: projectStatsDataset,
  },
};
