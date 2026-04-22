import { runSource } from "@/app/api/ingest/controller";
import { statusFor } from "@/lib/constants";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ source: string }> },
) {
  const { source } = await ctx.params;
  try {
    const results = await runSource(source);
    const allOk = results.every((r) => r.success);
    return Response.json({ results, allOk }, { status: allOk ? 200 : 207 });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const code = e.code ?? "UNKNOWN";
    return Response.json(
      { error: { code, message: e.message ?? "unknown" } },
      { status: statusFor(code) },
    );
  }
}
