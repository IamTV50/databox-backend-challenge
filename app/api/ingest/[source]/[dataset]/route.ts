import { runDataset } from "@/lib/pipeline";

const CODE_STATUS: Record<string, number> = {
  UNKNOWN_SOURCE: 404,
  UNKNOWN_DATASET: 404,
  AUTH_INVALID: 401,
  UPSTREAM_4XX: 502,
  UPSTREAM_5XX: 503,
  RATE_LIMIT: 503,
  TIMEOUT: 503,
  SCHEMA_MISMATCH: 502,
  DATABOX_REJECTED: 502,
  DATABOX_UPSTREAM: 503,
  CONFIG_MISSING: 500,
};

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ source: string; dataset: string }> },
) {
  const { source, dataset } = await ctx.params;
  try {
    const result = await runDataset(source, dataset);
    const status = result.success ? 200 : CODE_STATUS[result.error.code] ?? 500;
    return Response.json(result, { status });
  } catch (err) {
    const e = err as { code?: string; message?: string; retryable?: boolean };
    const code = e.code ?? "UNKNOWN";
    const status = CODE_STATUS[code] ?? 500;
    return Response.json(
      {
        error: {
          code,
          message: e.message ?? "unknown",
          retryable: e.retryable ?? false,
        },
      },
      { status },
    );
  }
}
