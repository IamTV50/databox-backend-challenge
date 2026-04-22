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

export const rowSchema = z.object({
  full_name: z.string(),
  name: z.string(),
  html_url: z.string(),
  stars: z.number(),
  forks: z.number(),
  open_issues: z.number(),
  pushed_at: z.string().nullable(),
  default_branch: z.string().nullable(),
  is_private: z.boolean(),
  is_archived: z.boolean(),
  captured_at: z.string(),
  schema_version: z.string(),
});

export type Repo = z.infer<typeof RepoRaw>;
export type Row = z.infer<typeof rowSchema>;
