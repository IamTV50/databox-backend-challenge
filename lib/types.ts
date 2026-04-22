import type { z } from "zod";
import type { AuthSpec, AuthenticatedFetch } from "@/lib/auth/types";

export interface ExtractContext {
  fetch: AuthenticatedFetch;
  now: Date;
}

export interface Dataset<TRaw = unknown, TRow = unknown> {
  name: string;
  datasetIdEnvVar: string;
  rawSchema: z.ZodType<TRaw>;
  rowSchema: z.ZodType<TRow>;
  extract(ctx: ExtractContext): Promise<TRaw>;
  transform(raw: TRaw, ctx: { now: Date }): TRow[];
}

export interface DataSource {
  name: string;
  auth: AuthSpec;
  datasets: Record<string, Dataset>;
}

export type IngestionResult =
  | {
      runId: string;
      source: string;
      dataset: string;
      success: true;
      rows: number;
      columns: number;
      durationMs: number;
    }
  | {
      runId: string;
      source: string;
      dataset: string;
      success: false;
      durationMs: number;
      error: { code: string; message: string; retryable: boolean };
    };

export interface IngestError extends Error {
  code: string;
  retryable: boolean;
}

export function ingestError(
  code: string,
  message: string,
  retryable: boolean,
  cause?: unknown,
): IngestError {
  const err = new Error(message, cause !== undefined ? { cause } : undefined) as IngestError;
  err.code = code;
  err.retryable = retryable;
  return err;
}
