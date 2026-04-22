import { loadConfig } from "@/lib/config";
import { fetchWithRetry } from "@/lib/http";
import { ingestError } from "@/lib/types";

const CHUNK_SIZE = 100;

export interface PushResult {
  chunks: number;
  totalRows: number;
}

export async function pushDataset(
  datasetId: string | undefined,
  rows: Record<string, unknown>[],
): Promise<PushResult> {
  if (!datasetId) {
    throw ingestError("CONFIG_MISSING", "dataset id env var is not set", false);
  }

  const config = loadConfig();
  const base = config.DATABOX_BASE_URL.replace(/\/$/, "");
  const url = `${base}/v1/datasets/${encodeURIComponent(datasetId)}/data`;

  const chunks: Record<string, unknown>[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + CHUNK_SIZE));
  }
  if (chunks.length === 0) return { chunks: 0, totalRows: 0 };

  for (let idx = 0; idx < chunks.length; idx++) {
    const body = JSON.stringify({ records: chunks[idx] });
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-api-key": config.DATABOX_API_KEY,
      },
      body,
    });
    if (!res.ok) {
      let payload: unknown;
      try {
        payload = await res.json();
      } catch {
        payload = await res.text().catch(() => "");
      }
      console.error(`[databox] push.failed`, {
        chunkIndex: idx,
        totalChunks: chunks.length,
        status: res.status,
        payload,
      });
      const code = res.status >= 500 ? "DATABOX_UPSTREAM" : "DATABOX_REJECTED";
      throw ingestError(
        code,
        `Databox rejected chunk ${idx + 1}/${chunks.length}: HTTP ${res.status}`,
        code === "DATABOX_UPSTREAM",
      );
    }
  }

  return { chunks: chunks.length, totalRows: rows.length };
}
