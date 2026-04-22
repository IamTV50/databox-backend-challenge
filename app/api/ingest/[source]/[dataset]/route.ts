import { runDataset } from "@/app/api/ingest/controller";
import { statusFor } from "@/lib/constants";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ source: string; dataset: string }> },
) {
  const { source, dataset } = await ctx.params;
  try {
    const result = await runDataset(source, dataset);
    const status = result.success ? 200 : statusFor(result.error.code);
    return Response.json(result, { status });
  } catch (err) {
    const e = err as { code?: string; message?: string; retryable?: boolean };
    const code = e.code ?? "UNKNOWN";
    return Response.json(
      {
        error: {
          code,
          message: e.message ?? "unknown",
          retryable: e.retryable ?? false,
        },
      },
      { status: statusFor(code) },
    );
  }
}
