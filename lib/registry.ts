import { githubSource } from "@/sources/github";
import { gitlabSource } from "@/sources/gitlab";
import type { DataSource } from "@/lib/types";

export const sourceRegistry: Record<string, DataSource> = {
  [githubSource.name]: githubSource,
  [gitlabSource.name]: gitlabSource,
};
