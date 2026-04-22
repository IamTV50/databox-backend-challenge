import { runSource } from "@/lib/pipeline";

const CODE_STATUS: Record<string, number> = {
  UNKNOWN_SOURCE: 404,
  UNKNOWN_DATASET: 404,
  CONFIG_MISSING: 500,
};

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
    const status = CODE_STATUS[code] ?? 500;
    return Response.json(
      { error: { code, message: e.message ?? "unknown" } },
      { status },
    );
  }
}
