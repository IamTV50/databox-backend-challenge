import { describe, it, expect, vi } from "vitest";
import { extract } from "@/sources/github/datasets/repos/extract";
import { makeRepo } from "../fixtures";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

describe("github/repos extract", () => {
  it("fetches a single page and returns the repo list", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse([makeRepo()]));
    const result = await extract({ fetch, now: new Date() });
    expect(result).toHaveLength(1);
    expect(fetch).toHaveBeenCalledOnce();
    const [url] = fetch.mock.calls[0];
    expect(String(url)).toContain("/orgs/testorg/repos");
  });

  it("follows the Link header's rel=next across pages", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([makeRepo({ id: 1 })], {
          headers: {
            link: '<https://api.github.com/orgs/testorg/repos?page=2>; rel="next", <https://api.github.com/orgs/testorg/repos?page=2>; rel="last"',
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse([makeRepo({ id: 2 })]));
    const result = await extract({ fetch, now: new Date() });
    expect(result.map((r) => r.id)).toEqual([1, 2]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws AUTH_INVALID on 401", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    await expect(extract({ fetch, now: new Date() })).rejects.toMatchObject({
      code: "AUTH_INVALID",
      retryable: false,
    });
  });

  it("throws RATE_LIMIT on 429", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    await expect(extract({ fetch, now: new Date() })).rejects.toMatchObject({
      code: "RATE_LIMIT",
      retryable: true,
    });
  });
});
