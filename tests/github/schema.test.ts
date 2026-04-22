import { describe, it, expect } from "vitest";
import { rawSchema, rowSchema } from "@/sources/github/datasets/repos/schema";
import { makeRepo } from "../fixtures";

describe("github/repos rawSchema", () => {
  it("accepts a valid repo list", () => {
    const parsed = rawSchema.safeParse([makeRepo()]);
    expect(parsed.success).toBe(true);
  });

  it("strips unknown keys without failing", () => {
    const parsed = rawSchema.safeParse([{ ...makeRepo(), extra_field: "ignored" }]);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data[0]).not.toHaveProperty("extra_field");
    }
  });

  it("fails when a required field is missing", () => {
    const parsed = rawSchema.safeParse([{ id: 1, name: "foo" }]);
    expect(parsed.success).toBe(false);
  });
});

describe("github/repos rowSchema", () => {
  it("accepts a row with all optional fields present", () => {
    const parsed = rowSchema.safeParse({
      id: 1,
      full_name: "o/foo",
      name: "foo",
      html_url: "x",
      stars: 0,
      forks: 0,
      open_issues: 0,
      pushed_at: "2026-01-01T00:00:00Z",
      default_branch: "main",
      is_private: 1,
      is_archived: 0,
      captured_at: "2026-01-01T00:00:00Z",
      schema_version: "1",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a row with the nullable-originating fields omitted", () => {
    const parsed = rowSchema.safeParse({
      id: 1,
      full_name: "o/foo",
      name: "foo",
      html_url: "x",
      stars: 0,
      forks: 0,
      open_issues: 0,
      is_private: 0,
      is_archived: 0,
      captured_at: "2026-01-01T00:00:00Z",
      schema_version: "1",
    });
    expect(parsed.success).toBe(true);
  });
});
