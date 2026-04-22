import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { pushDataset } from "@/lib/databox/client";

function okResponse() {
  return new Response(
    JSON.stringify({ requestId: "r", status: "success", ingestionId: "i" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("pushDataset", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /v1/datasets/{id}/data with x-api-key and {records}", async () => {
    fetchMock.mockResolvedValue(okResponse());
    const rows = [{ a: 1 }, { a: 2 }];
    const result = await pushDataset("ds-123", rows);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.databox.test/v1/datasets/ds-123/data");
    const headers = new Headers(init.headers);
    expect(headers.get("x-api-key")).toBe("test-api-key");
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ records: rows });
    expect(result).toEqual({ chunks: 1, totalRows: 2 });
  });

  it("chunks rows at 100 per POST (101 rows → 2 chunks of 100 + 1)", async () => {
    fetchMock.mockResolvedValue(okResponse());
    const rows = Array.from({ length: 101 }, (_, i) => ({ i }));
    const result = await pushDataset("ds-123", rows);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(first.records).toHaveLength(100);
    expect(second.records).toHaveLength(1);
    expect(result).toEqual({ chunks: 2, totalRows: 101 });
  });

  it("throws DATABOX_REJECTED on a 4xx response", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ status: "error", errors: [{ message: "bad" }] }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(pushDataset("ds-123", [{ a: 1 }])).rejects.toMatchObject({
      code: "DATABOX_REJECTED",
      retryable: false,
    });
  });

  it("throws CONFIG_MISSING when dataset id is undefined", async () => {
    await expect(pushDataset(undefined, [{ a: 1 }])).rejects.toMatchObject({
      code: "CONFIG_MISSING",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("short-circuits with zero chunks when rows is empty", async () => {
    const result = await pushDataset("ds-123", []);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ chunks: 0, totalRows: 0 });
  });
});
