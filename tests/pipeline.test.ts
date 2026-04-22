import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runDataset, runSource } from "@/app/api/ingest/controller";
import { makeRepo } from "./fixtures";

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
  databox?: (args: FetchArgs) => Promise<Response>;
}) {
  const mock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    if (url.host === "api.github.com" && handlers.github) {
      return handlers.github([input, init]);
    }
    if (url.host === "api.databox.test" && handlers.databox) {
      return handlers.databox([input, init]);
    }
    throw new Error(`no fetch mock for ${url.host}`);
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
