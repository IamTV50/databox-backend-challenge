import { describe, it, expect } from "vitest";
import { rawSchema, rowSchema } from "@/sources/gitlab/datasets/project-stats/schema";
import { makeGitlabProject } from "../fixtures";

describe("gitlab/project-stats rawSchema", () => {
  it("accepts a valid project + counts payload", () => {
    const parsed = rawSchema.safeParse({
      project: makeGitlabProject(),
      branches_count: 3,
      tags_count: 5,
      open_merge_requests: 2,
    });
    expect(parsed.success).toBe(true);
  });

  it("strips unknown project fields", () => {
    const parsed = rawSchema.safeParse({
      project: { ...makeGitlabProject(), description: "ignored" },
      branches_count: 0,
      tags_count: 0,
      open_merge_requests: 0,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.project).not.toHaveProperty("description");
    }
  });

  it("fails when a required count is missing", () => {
    const parsed = rawSchema.safeParse({
      project: makeGitlabProject(),
      branches_count: 1,
      tags_count: 1,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("gitlab/project-stats rowSchema", () => {
  it("accepts a fully populated row", () => {
    const parsed = rowSchema.safeParse({
      id: "2026-04-23T00:00:00Z",
      project_id: 42,
      project_path: "acme/demo",
      web_url: "https://gitlab.test/acme/demo",
      stars: 7,
      forks: 1,
      open_issues: 4,
      open_merge_requests: 2,
      branches: 3,
      tags: 5,
      commits: 123,
      captured_at: "2026-04-23T00:00:00Z",
      schema_version: "1",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a row missing a required metric", () => {
    const parsed = rowSchema.safeParse({
      id: "2026-04-23T00:00:00Z",
      project_id: 42,
      project_path: "acme/demo",
      web_url: "x",
      stars: 7,
      forks: 1,
      open_issues: 4,
      open_merge_requests: 2,
      branches: 3,
      tags: 5,
      captured_at: "2026-04-23T00:00:00Z",
      schema_version: "1",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a row missing the id primary key", () => {
    const parsed = rowSchema.safeParse({
      project_id: 42,
      project_path: "acme/demo",
      web_url: "x",
      stars: 7,
      forks: 1,
      open_issues: 4,
      open_merge_requests: 2,
      branches: 3,
      tags: 5,
      commits: 123,
      captured_at: "2026-04-23T00:00:00Z",
      schema_version: "1",
    });
    expect(parsed.success).toBe(false);
  });
});
