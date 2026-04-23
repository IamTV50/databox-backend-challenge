import { describe, it, expect } from "vitest";
import { transform } from "@/sources/gitlab/datasets/project-stats/transform";
import { makeGitlabProject } from "../fixtures";

const NOW = new Date("2026-04-23T12:00:00.000Z");

describe("gitlab/project-stats transform", () => {
  it("returns exactly one row — a time-series snapshot of the project", () => {
    const rows = transform(
      {
        project: makeGitlabProject(),
        branches_count: 3,
        tags_count: 5,
        open_merge_requests: 2,
      },
      { now: NOW },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "2026-04-23T12:00:00.000Z",
      project_id: 42,
      project_path: "acme/demo",
      stars: 7,
      forks: 1,
      open_issues: 4,
      open_merge_requests: 2,
      branches: 3,
      tags: 5,
      commits: 123,
      captured_at: "2026-04-23T12:00:00.000Z",
      schema_version: "1",
    });
  });

  it("defaults open_issues and commits to 0 when the project payload omits them", () => {
    const [row] = transform(
      {
        project: makeGitlabProject({ open_issues_count: undefined, statistics: undefined }),
        branches_count: 0,
        tags_count: 0,
        open_merge_requests: 0,
      },
      { now: NOW },
    );
    expect(row.open_issues).toBe(0);
    expect(row.commits).toBe(0);
  });
});
