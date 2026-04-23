import { z } from "zod";

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABOX_API_KEY: z.string().min(1),
  DATABOX_BASE_URL: z.string().min(1).default("https://api.databox.com"),

  GITHUB_TOKEN: z.string().min(1),
  GITHUB_ORG: z.string().min(1),
  GITHUB_REPOS_DATASET_ID: z.string().min(1),

  GITLAB_PROJECT_URL: z
    .string()
    .min(1)
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.pathname.replace(/^\/+|\/+$/g, "").length > 0;
      } catch {
        return false;
      }
    }, "must be a full project URL, e.g. https://gitlab.com/fdroid/fdroidclient"),
  GITLAB_CLIENT_ID: z.string().min(1),
  GITLAB_CLIENT_SECRET: z.string().min(1),
  GITLAB_REFRESH_TOKEN: z.string().min(1),
  GITLAB_REDIRECT_URI: z.string().min(1),
  GITLAB_PROJECT_STATS_DATASET_ID: z.string().min(1),
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
