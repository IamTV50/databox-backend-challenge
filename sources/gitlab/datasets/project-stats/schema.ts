import { z } from "zod";

// Raw shape returned by GET /api/v4/projects/:id?statistics=true.
// We only validate the fields we actually read; extra fields are stripped.
const Project = z.object({
  id: z.number(),
  name: z.string(),
  path_with_namespace: z.string(),
  web_url: z.string(),
  star_count: z.number(),
  forks_count: z.number(),
  open_issues_count: z.number().optional(),
  statistics: z
    .object({
      commit_count: z.number(),
    })
    .optional(),
});

export const rawSchema = z.object({
  project: Project,
  branches_count: z.number(),
  tags_count: z.number(),
  open_merge_requests: z.number(),
});

// One row per ingestion — this is a time-series snapshot of a single project.
// Databox dashboards chart these numbers over captured_at.
//
// `id` doubles as the Databox primary key. For a time-series dataset every
// ingestion must produce a new row, so we use captured_at (ISO timestamp) as
// the id — unique per run, and idempotent if the exact same snapshot is ever
// replayed.
export const rowSchema = z.object({
  id: z.string(),
  project_id: z.number(),
  project_path: z.string(),
  web_url: z.string(),
  stars: z.number(),
  forks: z.number(),
  open_issues: z.number(),
  open_merge_requests: z.number(),
  branches: z.number(),
  tags: z.number(),
  commits: z.number(),
  captured_at: z.string(),
  schema_version: z.string(),
});

export type Raw = z.infer<typeof rawSchema>;
export type Row = z.infer<typeof rowSchema>;
