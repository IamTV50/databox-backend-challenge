import { z } from "zod";

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABOX_API_KEY: z.string().min(1),
  DATABOX_BASE_URL: z.string().min(1).default("https://api.databox.com"),

  GITHUB_TOKEN: z.string().min(1),
  GITHUB_ORG: z.string().min(1),
  GITHUB_REPOS_DATASET_ID: z.string().min(1),
});

export type Config = z.infer<typeof ConfigSchema>;

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("\n");
    console.error(`[config] invalid environment:\n${issues}`);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}
