import { describe, it, expect, vi } from "vitest";
import { extract } from "@/sources/gitlab/datasets/project-stats/extract";
import { makeGitlabProject } from "../fixtures";

function projectResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

function countResponse(total: number) {
  return new Response("[]", {
    headers: { "content-type": "application/json", "x-total": String(total) },
  });
}

describe("gitlab/project-stats extract", () => {
  it("reads project fields and x-total counts for branches/tags/MRs", async () => {
    const fetch = vi.fn(async (input: string | URL) => {
      const u = String(input);
      if (u.includes("/repository/branches")) return countResponse(3);
      if (u.includes("/repository/tags")) return countResponse(5);
      if (u.includes("/merge_requests")) return countResponse(2);
      return projectResponse(makeGitlabProject());
    });

    const raw = await extract({ fetch, now: new Date() });

    expect(raw.branches_count).toBe(3);
    expect(raw.tags_count).toBe(5);
    expect(raw.open_merge_requests).toBe(2);
    expect(raw.project.id).toBe(42);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("throws AUTH_INVALID when GitLab returns 401 on the project call", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    await expect(extract({ fetch, now: new Date() })).rejects.toMatchObject({
      code: "AUTH_INVALID",
      retryable: false,
    });
  });

  it("throws SCHEMA_MISMATCH when x-total is absent from a count endpoint", async () => {
    const fetch = vi.fn(async (input: string | URL) => {
      const u = String(input);
      if (u.endsWith("?statistics=true&license=false")) {
        return projectResponse(makeGitlabProject());
      }
      // Count endpoints respond with no x-total header — simulates GitLab's
      // behaviour for very large collections.
      return new Response("[]", { headers: { "content-type": "application/json" } });
    });
    await expect(extract({ fetch, now: new Date() })).rejects.toMatchObject({
      code: "SCHEMA_MISMATCH",
    });
  });
});
