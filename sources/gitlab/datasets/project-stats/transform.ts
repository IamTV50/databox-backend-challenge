import type { Raw, Row } from "./schema";

const SCHEMA_VERSION = "1";

export function transform(raw: Raw, ctx: { now: Date }): Row[] {
  const capturedAt = ctx.now.toISOString();
  return [
    {
      id: capturedAt,
      project_id: raw.project.id,
      project_path: raw.project.path_with_namespace,
      web_url: raw.project.web_url,
      stars: raw.project.star_count,
      forks: raw.project.forks_count,
      open_issues: raw.project.open_issues_count ?? 0,
      open_merge_requests: raw.open_merge_requests,
      branches: raw.branches_count,
      tags: raw.tags_count,
      commits: raw.project.statistics?.commit_count ?? 0,
      captured_at: capturedAt,
      schema_version: SCHEMA_VERSION,
    },
  ];
}
