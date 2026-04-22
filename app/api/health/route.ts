import { sourceRegistry } from "@/lib/registry";

export async function GET() {
  return Response.json({
    status: "ok",
    sources: Object.keys(sourceRegistry),
    uptimeMs: Math.round(process.uptime() * 1000),
  });
}
