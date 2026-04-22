import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { bearerFetch } from "@/lib/auth/bearer";

describe("bearerFetch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TEST_TOKEN", "secret-t0k3n");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("attaches Authorization: Bearer <token> by default", async () => {
    const f = bearerFetch({ kind: "bearer", tokenEnvVar: "TEST_TOKEN" });
    await f("https://api.example.test/data");
    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer secret-t0k3n");
  });

  it("supports a custom header name and prefix", async () => {
    const f = bearerFetch({
      kind: "bearer",
      tokenEnvVar: "TEST_TOKEN",
      header: { name: "x-api-key", prefix: "" },
    });
    await f("https://api.example.test/data");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("x-api-key")).toBe("secret-t0k3n");
    expect(headers.get("authorization")).toBeNull();
  });

  it("throws CONFIG_MISSING when the token env var is not set", async () => {
    vi.unstubAllEnvs();
    const f = bearerFetch({ kind: "bearer", tokenEnvVar: "TEST_TOKEN" });
    await expect(f("https://api.example.test/data")).rejects.toMatchObject({
      code: "CONFIG_MISSING",
      retryable: false,
    });
  });
});
