# Adding another data source (theoretical POC)

A walkthrough for wiring a new source into the pipeline. Uses an imagined **Bitbucket** source with a **`repos`** dataset as the running example. Nothing about the controller, auth resolver, Databox client, or HTTP layer needs to change — the existing abstractions are built to take new entries.

Pick the auth kind up front: Bitbucket offers both an **app password / token** (bearer-style) and an **OAuth2** flow. Both are already covered by `lib/auth/`. The example below uses the token variant — create one at **Bitbucket → Personal settings → App passwords** (or the equivalent "API token" screen) with a read-only scope.

## Summary of what to touch

| File | New / change | Why |
|---|---|---|
| `sources/bitbucket/datasets/repos/schema.ts`    | new    | Define `rawSchema` (what the API returns) and `rowSchema` (what we push). |
| `sources/bitbucket/datasets/repos/extract.ts`   | new    | Fetch + paginate; throw typed `IngestError`s on HTTP failure. |
| `sources/bitbucket/datasets/repos/transform.ts` | new    | Map `TRaw[]` → `TRow[]`. Pure, synchronous. |
| `sources/bitbucket/datasets/repos/index.ts`     | new    | Bundle the four pieces into a `Dataset`. |
| `sources/bitbucket/index.ts`                    | new    | Bundle datasets + auth into a `DataSource`. |
| `lib/registry.ts`                               | change | Register the source. |
| `lib/config.ts`                                 | change | Add required env vars to the Zod schema. |
| `.env.template`                                 | change | Document the new env vars. |
| `tests/bitbucket/**` + `tests/pipeline.test.ts` + `tests/setup.ts` | new / change | Add tests — see `docs/tests.md`. |
| `README.md` → [Databox setup](../README.md#databox--api-key-and-datasets) | change | Create the Bitbucket dataset the same way as the two existing ones. |

Required Databox dataset creation (one-off `curl` per new dataset) is unchanged — see the `curl` examples in the README. The dataset's primary key column must match whatever `rowSchema.id` produces (a number for per-entity rows, an ISO timestamp for time-series rows).

## Step by step

### 1. Define the schemas (`sources/bitbucket/datasets/repos/schema.ts`)

Two Zod schemas per dataset:

- `rawSchema` pins the subset of upstream fields we actually read. Extra fields are stripped automatically. The goal is to fail loud on upstream contract drift.
- `rowSchema` describes the Databox row. It doubles as the source of truth for the dataset's columns.

```ts
import { z } from "zod";

const RepoRaw = z.object({
  uuid: z.string(),
  name: z.string(),
  full_name: z.string(),
  links: z.object({ html: z.object({ href: z.string() }) }),
  size: z.number(),
  is_private: z.boolean(),
});

export const rawSchema = z.object({
  values: z.array(RepoRaw),
  next: z.string().optional(), // cursor for the next page
});

export const rowSchema = z.object({
  id: z.string(),               // Bitbucket uuid
  name: z.string(),
  full_name: z.string(),
  html_url: z.string(),
  size_kb: z.number(),
  is_private: z.number(),       // 0/1 — Databox sums booleans as numbers
  captured_at: z.string(),
  schema_version: z.string(),
});

export type Raw = z.infer<typeof rawSchema>;
export type Row = z.infer<typeof rowSchema>;
```

### 2. Extract (`extract.ts`)

Receives an `ExtractContext` — `ctx.fetch` is already authenticated, `ctx.now` is the run timestamp. Paginate with whatever scheme the API uses (`Link` header, `?cursor=`, `x-total` header, etc.) and convert HTTP failures into typed errors with `ingestError(code, message, retryable)`.

```ts
import { loadConfig } from "@/lib/config";
import { ingestError, type ExtractContext } from "@/lib/types";
import type { Raw } from "./schema";

export async function extract(ctx: ExtractContext): Promise<Raw["values"]> {
  const { BITBUCKET_WORKSPACE } = loadConfig();
  const all: Raw["values"] = [];
  let url: string | null =
    `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}?pagelen=100`;

  while (url) {
    const res: Response = await ctx.fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw toUpstreamError(res.status, body);
    }
    const page = (await res.json()) as Raw;
    all.push(...page.values);
    url = page.next ?? null;
  }
  return all;
}

function toUpstreamError(status: number, body: string): Error {
  const snippet = body.slice(0, 200);
  if (status === 401 || status === 403) return ingestError("AUTH_INVALID", `Bitbucket ${status}: ${snippet}`, false);
  if (status === 429)                    return ingestError("RATE_LIMIT", `Bitbucket ${status}`, true);
  if (status >= 500)                     return ingestError("UPSTREAM_5XX", `Bitbucket ${status}: ${snippet}`, true);
  return ingestError("UPSTREAM_4XX", `Bitbucket ${status}: ${snippet}`, false);
}
```

Standard codes (`AUTH_INVALID`, `RATE_LIMIT`, `UPSTREAM_4XX`, `UPSTREAM_5XX`, `SCHEMA_MISMATCH`) already have HTTP status mappings in `lib/constants.ts`. Adding a new code is one line there.

### 3. Transform (`transform.ts`)

Pure function, synchronous, no IO. Produce one row per entity (for listing datasets) or exactly one row per run (for time-series snapshots — use `ctx.now` as the `id`).

```ts
import type { Raw, Row } from "./schema";

const SCHEMA_VERSION = "1";

export function transform(raw: Raw["values"], ctx: { now: Date }): Row[] {
  const capturedAt = ctx.now.toISOString();
  return raw.map((r) => ({
    id: r.uuid,
    name: r.name,
    full_name: r.full_name,
    html_url: r.links.html.href,
    size_kb: r.size,
    is_private: r.is_private ? 1 : 0,
    captured_at: capturedAt,
    schema_version: SCHEMA_VERSION,
  }));
}
```

### 4. Bundle the dataset (`index.ts`)

```ts
import type { Dataset } from "@/lib/types";
import { rawSchema, rowSchema, type Raw, type Row } from "./schema";
import { extract } from "./extract";
import { transform } from "./transform";

export const reposDataset: Dataset<Raw["values"], Row> = {
  name: "repos",
  datasetIdEnvVar: "BITBUCKET_REPOS_DATASET_ID",
  rawSchema: rawSchema.shape.values, // or refactor rawSchema to be the values array directly
  rowSchema,
  extract,
  transform,
};
```

### 5. Bundle the source (`sources/bitbucket/index.ts`)

Pick the auth kind. Bitbucket supports app passwords (bearer-ish) and OAuth2; both are already covered.

```ts
import type { DataSource } from "@/lib/types";
import { reposDataset } from "./datasets/repos";

export const bitbucketSource: DataSource = {
  name: "bitbucket",
  auth: {
    kind: "bearer",
    tokenEnvVar: "BITBUCKET_TOKEN",
    header: { name: "Authorization", prefix: "Bearer" },
  },
  datasets: {
    [reposDataset.name]: reposDataset,
  },
};
```

If Bitbucket needed an auth kind that doesn't exist yet (e.g. HMAC signing), the extension point is in `lib/auth/`:

1. Add the new variant to the `AuthSpec` union in `lib/auth/types.ts`.
2. Add a factory (`lib/auth/hmac.ts`) that returns an `AuthenticatedFetch`.
3. Add a `case` for it in `lib/auth/resolve.ts`.

No source or dataset code changes.

### 6. Register the source (`lib/registry.ts`)

```ts
import { bitbucketSource } from "@/sources/bitbucket";

export const sourceRegistry: Record<string, DataSource> = {
  [githubSource.name]: githubSource,
  [gitlabSource.name]: gitlabSource,
  [bitbucketSource.name]: bitbucketSource,
};
```

### 7. Declare env vars (`lib/config.ts`)

```ts
BITBUCKET_TOKEN: z.string().min(1),
BITBUCKET_WORKSPACE: z.string().min(1),
BITBUCKET_REPOS_DATASET_ID: z.string().min(1),
```

And mirror them in `.env.template` as one-liners. Keep long-form setup instructions in the README.

### 8. Tests

Add tests. Follow the per-file shape described in [`docs/tests.md`](tests.md).

### 9. Create the Databox dataset

Using the `curl` commands from the [README Databox section](../README.md#databox--api-key-and-datasets) — one more `POST /v1/datasets` against the same `dataSourceId`, with `primaryKeys: ["id"]`. Paste the returned dataset id into `.env` as `BITBUCKET_REPOS_DATASET_ID`.

## Verification

```bash
npm run lint
npm test
npm run dev
curl -X POST http://localhost:3000/api/ingest/bitbucket/repos
curl http://localhost:3000/api/sources   # should list bitbucket
```

The service is now pulling Bitbucket repos into Databox on demand. Everything the pipeline does to it — auth resolution, schema validation, chunked push, structured logging, error-code mapping — came for free from the existing abstractions.
