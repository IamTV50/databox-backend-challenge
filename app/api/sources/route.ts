import { sourceRegistry } from "@/lib/registry";

export async function GET() {
  const data = Object.values(sourceRegistry).map((s) => ({
    name: s.name,
    authKind: s.auth.kind,
    datasets: Object.values(s.datasets).map((d) => ({
      name: d.name,
      datasetIdEnvVar: d.datasetIdEnvVar,
    })),
  }));
  return Response.json(data);
}
