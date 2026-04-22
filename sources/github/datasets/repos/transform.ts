import type { Repo, Row } from "./schema";

const SCHEMA_VERSION = "1";

export function transform(raw: Repo[], ctx: { now: Date }): Row[] {
  const capturedAt = ctx.now.toISOString();
  return raw.map((repo) => ({
    full_name: repo.full_name,
    name: repo.name,
    html_url: repo.html_url,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    open_issues: repo.open_issues_count,
    pushed_at: repo.pushed_at,
    default_branch: repo.default_branch,
    is_private: repo.private,
    is_archived: repo.archived,
    captured_at: capturedAt,
    schema_version: SCHEMA_VERSION,
  }));
}
