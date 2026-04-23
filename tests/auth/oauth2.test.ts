import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { oauth2Fetch, __resetOAuth2Cache } from "@/lib/auth/oauth2";

const SPEC = {
  kind: "oauth2",
  clientIdEnvVar: "TEST_CLIENT_ID",
  clientSecretEnvVar: "TEST_CLIENT_SECRET",
  refreshTokenEnvVar: "TEST_REFRESH_TOKEN",
  tokenUrl: "https://oauth.example.test/token",
} as const;

describe("oauth2Fetch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetOAuth2Cache();
    vi.stubEnv("TEST_CLIENT_ID", "cid");
    vi.stubEnv("TEST_CLIENT_SECRET", "csecret");
    vi.stubEnv("TEST_REFRESH_TOKEN", "r0");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("exchanges refresh_token for an access_token and attaches it as Bearer", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "at-1", refresh_token: "r1", expires_in: 3600 }), {
        headers: { "content-type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValueOnce(new Response("ok"));

    const f = oauth2Fetch(SPEC);
    await f("https://api.example.test/me");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const tokenCall = fetchMock.mock.calls[0];
    expect(String(tokenCall[0])).toBe(SPEC.tokenUrl);
    const body = tokenCall[1].body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("r0");

    const apiCall = fetchMock.mock.calls[1];
    const headers = new Headers(apiCall[1].headers);
    expect(headers.get("authorization")).toBe("Bearer at-1");
  });

  it("reuses the cached access token on subsequent calls within the expiry window", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "at-1", expires_in: 3600 }), {
        headers: { "content-type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValue(new Response("ok"));

    const f = oauth2Fetch(SPEC);
    await f("https://api.example.test/a");
    await f("https://api.example.test/b");

    // Exactly one token exchange, plus two API calls = 3 total.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses the rotated refresh_token on the next refresh instead of the env one", async () => {
    // First exchange returns a rotated refresh token and a short expiry.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "at-1", refresh_token: "r1", expires_in: 0 }), {
        headers: { "content-type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValueOnce(new Response("ok"));
    // Second exchange must use r1, not r0 from env.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "at-2", refresh_token: "r2", expires_in: 3600 }), {
        headers: { "content-type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValueOnce(new Response("ok"));

    const f = oauth2Fetch(SPEC);
    await f("https://api.example.test/a");
    await f("https://api.example.test/b");

    const secondExchangeBody = fetchMock.mock.calls[2][1].body as URLSearchParams;
    expect(secondExchangeBody.get("refresh_token")).toBe("r1");
  });

  it("throws AUTH_INVALID when the token endpoint responds 400", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    );
    const f = oauth2Fetch(SPEC);
    await expect(f("https://api.example.test/a")).rejects.toMatchObject({
      code: "AUTH_INVALID",
      retryable: false,
    });
  });

  it("throws CONFIG_MISSING when any required env var is unset", async () => {
    vi.unstubAllEnvs();
    const f = oauth2Fetch(SPEC);
    await expect(f("https://api.example.test/a")).rejects.toMatchObject({
      code: "CONFIG_MISSING",
      retryable: false,
    });
  });
});
