import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchWithRetry } from "@/lib/http";

describe("fetchWithRetry", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the response on the first successful attempt without retrying", async () => {
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
    const res = await fetchWithRetry("https://example.test");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 503 and returns the eventual 200", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const res = await fetchWithRetry(
      "https://example.test",
      {},
      { baseDelayMs: 1 },
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry 4xx responses", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 400 }));
    const res = await fetchWithRetry(
      "https://example.test",
      {},
      { baseDelayMs: 1 },
    );
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the last response after exhausting attempts on persistent 5xx", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 503 }));
    const res = await fetchWithRetry(
      "https://example.test",
      {},
      { baseDelayMs: 1, maxAttempts: 3 },
    );
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
