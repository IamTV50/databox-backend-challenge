import { describe, it, expect } from "vitest";
import { transform } from "@/sources/github/datasets/repos/transform";
import { makeRepo } from "../fixtures";

const NOW = new Date("2026-01-01T12:00:00.000Z");

describe("github/repos transform", () => {
  it("maps a repo to a flat row including id, captured_at, and schema_version", () => {
    const [row] = transform([makeRepo()], { now: NOW });
    expect(row).toMatchObject({
      id: 1,
      full_name: "testorg/foo",
      name: "foo",
      stars: 10,
      forks: 2,
      open_issues: 3,
      pushed_at: "2025-12-30T00:00:00Z",
      default_branch: "main",
      is_private: 0,
      is_archived: 0,
      captured_at: "2026-01-01T12:00:00.000Z",
      schema_version: "1",
    });
  });

  it("converts booleans to 0/1", () => {
    const [row] = transform(
      [makeRepo({ private: true, archived: true })],
      { now: NOW },
    );
    expect(row.is_private).toBe(1);
    expect(row.is_archived).toBe(1);
  });

  it("omits pushed_at and default_branch from the JSON payload when null", () => {
    const [row] = transform(
      [makeRepo({ pushed_at: null, default_branch: null })],
      { now: NOW },
    );
    // The keys are undefined on the object; JSON.stringify drops undefined values.
    const serialized = JSON.parse(JSON.stringify(row));
    expect("pushed_at" in serialized).toBe(false);
    expect("default_branch" in serialized).toBe(false);
  });

  it("returns an empty array for empty input", () => {
    expect(transform([], { now: NOW })).toEqual([]);
  });
});
