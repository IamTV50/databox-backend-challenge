import crypto from "node:crypto";
import { resolveAuth } from "@/lib/auth/resolve";
import { pushDataset } from "@/lib/databox/client";
import { sourceRegistry } from "@/lib/registry";
import { ingestError, type IngestionResult } from "@/lib/types";

export async function runDataset(
  sourceName: string,
  datasetName: string,
): Promise<IngestionResult> {
  const source = sourceRegistry[sourceName];
  if (!source) {
    throw ingestError("UNKNOWN_SOURCE", `source "${sourceName}" not registered`, false);
  }
  const dataset = source.datasets[datasetName];
  if (!dataset) {
    throw ingestError(
      "UNKNOWN_DATASET",
      `source "${sourceName}" has no dataset "${datasetName}"`,
      false,
    );
  }

  const runId = crypto.randomUUID();
  const started = Date.now();
  const tag = `[${source.name}/${dataset.name}]`;
  console.info(`${tag} ingest.start`, { runId });

  try {
    const authedFetch = await resolveAuth(source.auth);
    console.info(`${tag} auth.resolved`, { runId, authKind: source.auth.kind });

    const tExtract = Date.now();
    const rawUnknown = await dataset.extract({ fetch: authedFetch, now: new Date() });
    const raw = dataset.rawSchema.parse(rawUnknown);
    console.info(`${tag} extract.ok`, { runId, ms: Date.now() - tExtract });

    const rows = dataset.transform(raw, { now: new Date() });
    rows.forEach((row, i) => {
      const parsed = dataset.rowSchema.safeParse(row);
      if (!parsed.success) {
        throw ingestError(
          "SCHEMA_MISMATCH",
          `row ${i} failed rowSchema: ${parsed.error.issues.map((x) => x.message).join("; ")}`,
          false,
          parsed.error,
        );
      }
    });
    const columns =
      rows.length > 0 && typeof rows[0] === "object" && rows[0] !== null
        ? Object.keys(rows[0] as object).length
        : 0;
    console.info(`${tag} transform.ok`, { runId, rows: rows.length, columns });

    const datasetId = process.env[dataset.datasetIdEnvVar];
    const tLoad = Date.now();
    const pushResult = await pushDataset(datasetId, rows as Record<string, unknown>[]);
    console.info(`${tag} load.ok`, {
      runId,
      ms: Date.now() - tLoad,
      datasetId,
      rows: pushResult.totalRows,
      chunks: pushResult.chunks,
    });

    const durationMs = Date.now() - started;
    console.info(`${tag} ingest.done`, { runId, success: true, totalMs: durationMs });
    return {
      runId,
      source: source.name,
      dataset: dataset.name,
      success: true,
      rows: pushResult.totalRows,
      columns,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - started;
    const e = err as { code?: string; message?: string; retryable?: boolean };
    const code = e.code ?? "UNKNOWN";
    const message = e.message ?? "unknown error";
    const retryable = e.retryable ?? false;
    console.error(`${tag} ingest.failed`, { runId, code, message });
    return {
      runId,
      source: source.name,
      dataset: dataset.name,
      success: false,
      durationMs,
      error: { code, message, retryable },
    };
  }
}

export async function runSource(sourceName: string): Promise<IngestionResult[]> {
  const source = sourceRegistry[sourceName];
  if (!source) {
    throw ingestError("UNKNOWN_SOURCE", `source "${sourceName}" not registered`, false);
  }
  const results: IngestionResult[] = [];
  for (const dataset of Object.values(source.datasets)) {
    results.push(await runDataset(sourceName, dataset.name));
  }
  return results;
}
