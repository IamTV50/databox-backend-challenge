import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runDataset, runSource } from "@/app/api/ingest/controller";
import { __resetOAuth2Cache } from "@/lib/auth/oauth2";
import { makeRepo, makeGitlabProject } from "./fixtures";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

type FetchArgs = [string | URL, RequestInit | undefined];

/** Dispatches fetch calls by URL host to a happy/failing handler per target. */
function mockFetch(handlers: {
  github?: (args: FetchArgs) => Promise<Response>;
  gitlab?: (args: FetchArgs) => Promise<Response>;
  gitlabOauth?: (args: FetchArgs) => Promise<Response>;
  databox?: (args: FetchArgs) => Promise<Response>;
}) {
  const mock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    if (url.host === "api.github.com" && handlers.github) {
      return handlers.github([input, init]);
    }
    if (url.host === "gitlab.test" && url.pathname.startsWith("/api/") && handlers.gitlab) {
      return handlers.gitlab([input, init]);
    }
    if (url.host === "gitlab.com" && url.pathname === "/oauth/token" && handlers.gitlabOauth) {
      return handlers.gitlabOauth([input, init]);
    }
    if (url.host === "api.databox.test" && handlers.databox) {
      return handlers.databox([input, init]);
    }
    throw new Error(`no fetch mock for ${url.host}${url.pathname}`);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("controller: runDataset", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs github/repos end-to-end and returns success", async () => {
    const mock = mockFetch({
      github: async () => jsonResponse([makeRepo({ id: 1 }), makeRepo({ id: 2 })]),
      databox: async () =>
        jsonResponse({ requestId: "r", status: "success", ingestionId: "i" }),
    });

    const result = await runDataset("github", "repos");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.source).toBe("github");
      expect(result.dataset).toBe("repos");
      expect(result.rows).toBe(2);
      expect(result.columns).toBeGreaterThan(0);
    }
    // One call to GitHub (single page), one chunked push to Databox.
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("returns success=false with DATABOX_REJECTED when the push fails", async () => {
    mockFetch({
      github: async () => jsonResponse([makeRepo()]),
      databox: async () =>
        new Response(
          JSON.stringify({ status: "error", errors: [{ message: "bad" }] }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
    });

    const result = await runDataset("github", "repos");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("DATABOX_REJECTED");
    }
  });

  it("throws UNKNOWN_SOURCE for an unregistered source name", async () => {
    await expect(runDataset("not-a-source", "repos")).rejects.toMatchObject({
      code: "UNKNOWN_SOURCE",
    });
  });

  it("throws UNKNOWN_DATASET for a source without that dataset", async () => {
    await expect(runDataset("github", "not-a-dataset")).rejects.toMatchObject({
      code: "UNKNOWN_DATASET",
    });
  });
});

describe("controller: runSource", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("iterates every dataset in a source and returns one result per dataset", async () => {
    mockFetch({
      github: async () => jsonResponse([makeRepo()]),
      databox: async () =>
        jsonResponse({ requestId: "r", status: "success", ingestionId: "i" }),
    });

    const results = await runSource("github");
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("github");
    expect(results[0].dataset).toBe("repos");
    expect(results[0].success).toBe(true);
  });

  it("throws UNKNOWN_SOURCE for an unregistered source name", async () => {
    await expect(runSource("not-a-source")).rejects.toMatchObject({
      code: "UNKNOWN_SOURCE",
    });
  });
});

describe("controller: runDataset — gitlab/project-stats", () => {
  beforeEach(() => {
    __resetOAuth2Cache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exchanges the OAuth refresh token, fetches project + counts, and pushes one row", async () => {
    const mock = mockFetch({
      gitlabOauth: async () =>
        jsonResponse({ access_token: "at", refresh_token: "r1", expires_in: 3600 }),
      gitlab: async ([input]) => {
        const u = String(input);
        if (u.includes("/repository/branches")) {
          return new Response("[]", { headers: { "x-total": "3" } });
        }
        if (u.includes("/repository/tags")) {
          return new Response("[]", { headers: { "x-total": "5" } });
        }
        if (u.includes("/merge_requests")) {
          return new Response("[]", { headers: { "x-total": "2" } });
        }
        return jsonResponse(makeGitlabProject());
      },
      databox: async () =>
        jsonResponse({ requestId: "r", status: "success", ingestionId: "i" }),
    });

    const result = await runDataset("gitlab", "project-stats");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.rows).toBe(1);
    }

    // 1 oauth token + 4 gitlab (project + 3 counts) + 1 databox push = 6
    expect(mock).toHaveBeenCalledTimes(6);

    // Assert the Databox push body carries the expected metrics.
    const databoxCall = mock.mock.calls.find(([u]) => String(u).includes("api.databox.test"));
    const body = JSON.parse((databoxCall![1] as RequestInit).body as string);
    expect(body.records[0]).toMatchObject({
      project_id: 42,
      stars: 7,
      forks: 1,
      open_issues: 4,
      open_merge_requests: 2,
      branches: 3,
      tags: 5,
      commits: 123,
    });
  });

  it("returns AUTH_INVALID when the oauth token exchange fails", async () => {
    mockFetch({
      gitlabOauth: async () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    });
    const result = await runDataset("gitlab", "project-stats");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("AUTH_INVALID");
    }
  });
});
