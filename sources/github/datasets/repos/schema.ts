import { z } from "zod";

const RepoRaw = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  html_url: z.string(),
  private: z.boolean(),
  archived: z.boolean(),
  stargazers_count: z.number(),
  forks_count: z.number(),
  open_issues_count: z.number(),
  pushed_at: z.string().nullable(),
  default_branch: z.string().nullable(),
});

export const rawSchema = z.array(RepoRaw);

// Databox Ingestion API rejects null values and booleans asynchronously
// (200-ack, then marked "failed"). Nullable string fields are omitted when null,
// and booleans are stored as 0/1 so they're sum-able in metrics.
export const rowSchema = z.object({
  id: z.number(),
  full_name: z.string(),
  name: z.string(),
  html_url: z.string(),
  stars: z.number(),
  forks: z.number(),
  open_issues: z.number(),
  pushed_at: z.string().optional(),
  default_branch: z.string().optional(),
  is_private: z.number(),
  is_archived: z.number(),
  captured_at: z.string(),
  schema_version: z.string(),
});

export type Repo = z.infer<typeof RepoRaw>;
export type Row = z.infer<typeof rowSchema>;
