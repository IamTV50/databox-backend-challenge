import { githubSource } from "@/sources/github";
import type { DataSource } from "@/lib/types";

export const sourceRegistry: Record<string, DataSource> = {
  [githubSource.name]: githubSource,
};
