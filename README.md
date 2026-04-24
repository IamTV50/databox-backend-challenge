# Databox backend assignment

Challenge spec: https://github.com/databox/engineering-challenge/blob/master/README.md

A small ingestion service that pulls data from third-party sources (GitHub, GitLab), shapes it into rows, and pushes those rows into Databox datasets. Built on Next.js 16 route handlers (no UI), TypeScript strict, Zod for schema validation, Vitest for tests.

## Table of contents

- [Overview](#overview)
- [Architecture](#architecture)
  - [Pipeline](#pipeline)
  - [Folder layout](#folder-layout)
  - [Source and dataset contract](#source-and-dataset-contract)
  - [Auth](#auth)
- [Running locally](#running-locally)
  - [Prerequisites](#prerequisites)
  - [Clone and install](#clone-and-install)
  - [Databox — API key and datasets](#databox--api-key-and-datasets)
  - [GitHub — personal access token](#github--personal-access-token)
  - [GitLab — OAuth2 application](#gitlab--oauth2-application)
  - [Finish wiring `.env`](#finish-wiring-env)
  - [Run the server and trigger an ingestion](#run-the-server-and-trigger-an-ingestion)
- [HTTP API](#http-api)
- [Testing](#testing)
- [Tradeoffs, known limitations, and paths to scale](#tradeoffs-known-limitations-and-paths-to-scale)
  - [1. Next.js for a service with no UI](#1-nextjs-for-a-service-with-no-ui)
  - [2. Databox datasets are created by hand](#2-databox-datasets-are-created-by-hand)
  - [3. GitHub is locked to one organization](#3-github-is-locked-to-one-organization)
  - [4. GitLab is locked to one project](#4-gitlab-is-locked-to-one-project)
  - [5. Auth covers only bearer and OAuth2](#5-auth-covers-only-bearer-and-oauth2)
  - [6. Tests are offline and basic](#6-tests-are-offline-and-basic)
  - [7. GitLab OAuth2 refresh-token rotation](#7-gitlab-oauth2-refresh-token-rotation)
  - [8. Ingestions run on demand only (no scheduler)](#8-ingestions-run-on-demand-only-no-scheduler)
- [Adding another data source (theoretical POC)](#adding-another-data-source-theoretical-poc)

## Overview

The service exposes a handful of `POST /api/ingest/...` endpoints. Each call runs a dataset end-to-end:

1. Resolve the source's auth into an `AuthenticatedFetch`.
2. **Extract** — hit the upstream API, paginate if needed.
3. **Validate** the raw payload with a Zod `rawSchema` (strips unknown fields, rejects drift).
4. **Transform** into Databox-ready rows.
5. **Validate** each row with `rowSchema`.
6. **Push** to Databox Ingestion API in chunks of 100.

Two sources are wired in:

- **`github/repos`** — lists every repo of a GitHub organization (paginated via the `Link` header). One row per repo.
- **`gitlab/project-stats`** — a time-series snapshot of a single GitLab project (stars, forks, branches, tags, commits, open MRs, open issues). One row per ingestion run — the `id` is the captured-at timestamp, so every call appends a new point to the chart.

## Architecture

### Pipeline

Every dataset is the same five-step pipeline, driven by `app/api/ingest/controller.ts`:

```
HTTP POST
    │
    ▼
  controller.runDataset(source, dataset)
    │
    ├─ resolveAuth(source.auth)       ── lib/auth/resolve.ts
    ├─ dataset.extract({ fetch, now }) ── sources/<s>/datasets/<d>/extract.ts
    ├─ dataset.rawSchema.parse(...)    ── sources/<s>/datasets/<d>/schema.ts
    ├─ dataset.transform(raw, { now }) ── sources/<s>/datasets/<d>/transform.ts
    ├─ dataset.rowSchema.safeParse(...) (per row)
    └─ pushDataset(datasetId, rows)    ── lib/databox/client.ts
```

Each step throws an `IngestError` with a stable `code` (e.g. `AUTH_INVALID`, `RATE_LIMIT`, `SCHEMA_MISMATCH`, `DATABOX_REJECTED`). The controller catches, logs a structured line, and returns a discriminated `IngestionResult`. Route handlers map the error code to an HTTP status via `lib/constants.ts`.

### Folder layout

```
app/
  api/
    health/route.ts                   GET  /api/health
    sources/route.ts                  GET  /api/sources
    ingest/
      controller.ts                   runDataset / runSource
      [source]/route.ts               POST /api/ingest/:source
      [source]/[dataset]/route.ts     POST /api/ingest/:source/:dataset
lib/
  auth/
    types.ts        AuthSpec discriminated union (bearer | oauth2)
    bearer.ts       Static bearer-token fetch wrapper
    oauth2.ts       refresh_token → access_token exchange + in-memory cache
    resolve.ts      AuthSpec → AuthenticatedFetch
  databox/client.ts   pushDataset(...) — chunked POST to /v1/datasets/:id/data
  config.ts         Zod-validated env loader
  constants.ts      Error code → HTTP status map
  http.ts           fetchWithRetry (exponential backoff on 5xx)
  registry.ts       { github, gitlab } source registry
  types.ts          DataSource / Dataset / IngestionResult / ingestError
sources/
  github/
    index.ts
    datasets/repos/{schema,extract,transform,index}.ts
  gitlab/
    index.ts
    datasets/project-stats/{schema,extract,transform,index}.ts
scripts/
  oauth-bootstrap.mjs   One-shot CLI to obtain a GitLab refresh token
tests/                  Vitest suite — see docs/tests.md
docs/
  tests.md
```

### Source and dataset contract

A data source is a named bundle of one auth spec and N datasets (`lib/types.ts`):

```ts
interface DataSource {
  name: string;
  auth: AuthSpec;
  datasets: Record<string, Dataset>;
}

interface Dataset<TRaw, TRow> {
  name: string;
  datasetIdEnvVar: string;              // env var that holds the Databox dataset id
  rawSchema: z.ZodType<TRaw>;           // shape we fetched
  rowSchema: z.ZodType<TRow>;           // shape we'll push
  extract(ctx: ExtractContext): Promise<TRaw>;
  transform(raw: TRaw, ctx: { now: Date }): TRow[];
}
```

Sources are added by importing them into `lib/registry.ts`. The controller treats them uniformly.

### Auth

`AuthSpec` is a discriminated union with two variants today:

```ts
type BearerSpec = { kind: "bearer"; tokenEnvVar: string; header?: { name: string; prefix?: string } };
type OAuth2Spec = { kind: "oauth2"; clientIdEnvVar: string; clientSecretEnvVar: string; refreshTokenEnvVar: string; tokenUrl: string };
```

`resolveAuth(spec)` returns an `AuthenticatedFetch` — a drop-in replacement for `fetch` that already sets the right Authorization header. Extract functions never touch credentials directly; they just call `ctx.fetch(url)`. Adding a third auth kind means adding a case to the union, a factory in `lib/auth/`, and a branch in `resolve.ts`.

## Running locally

### Prerequisites

- **Node 20.6+** — required for `node --env-file=.env` which the OAuth bootstrap script relies on.
- A Databox account, a GitHub account, and a GitLab.com account.

### Clone and install

```bash
git clone <this-repo>
cd databox-backend-challenge
npm install
cp .env.template .env
```

Keep `.env` open — the next steps fill it in.

### Databox — API key and datasets

1. **API key.** In Databox go to **Profile → Password & Security → API key**, generate one, and paste it into `.env`:

   ```
   DATABOX_API_KEY=...
   ```

2. **Confirm the key and grab your `accountId`.** The response body contains it — keep it for step 3.

   ```bash
   curl -i -X GET https://api.databox.com/v1/accounts \
     -H 'x-api-key: YOUR_API_KEY_HERE'
   ```

3. **Create a data source.** This is the container the two datasets will hang off. Keep the `id` from the response for step 4.

   ```bash
   curl -i -X POST https://api.databox.com/v1/data-sources \
     -H 'Content-Type: application/json' \
     -H 'x-api-key: YOUR_API_KEY_HERE' \
     -d '{
       "accountId": ACCOUNTID_FROM_STEP_2,
       "title": "my-datasource",
       "timezone": "UTC"
     }'
   ```

4. **Create the two datasets.** Both use `primaryKeys: ["id"]`, which is what lets the ingestion layer upsert rows instead of rejecting them.

   **GitHub dataset** — one row per repository; `id` is the numeric GitHub repo id so re-runs upsert the same rows:

   ```bash
   curl -i -X POST https://api.databox.com/v1/datasets \
     -H 'Content-Type: application/json' \
     -H 'x-api-key: YOUR_API_KEY_HERE' \
     -d '{
       "title": "dataset-github",
       "dataSourceId": DATASOURCEID_FROM_STEP_3,
       "primaryKeys": ["id"]
     }'
   ```

   **GitLab dataset** — one row per ingestion; `id` is the ISO `captured_at` timestamp so every run becomes a new time-series point:

   ```bash
   curl -i -X POST https://api.databox.com/v1/datasets \
     -H 'Content-Type: application/json' \
     -H 'x-api-key: YOUR_API_KEY_HERE' \
     -d '{
       "title": "dataset-gitlab",
       "dataSourceId": DATASOURCEID_FROM_STEP_3,
       "primaryKeys": ["id"]
     }'
   ```

   Each dataset response includes an `id` — paste those into `.env`:

   ```
   GITHUB_REPOS_DATASET_ID=...
   GITLAB_PROJECT_STATS_DATASET_ID=...
   ```

### GitHub — personal access token

1. Go to https://github.com/settings/tokens and generate a **classic** personal access token.
2. Scopes: `read:org` (to list org repos) and `public_repo` — or `repo` if you want private repos of the org included.
3. Paste the token and the organization login into `.env`:

   ```
   GITHUB_TOKEN=ghp_...
   GITHUB_ORG=databox
   ```

### GitLab — OAuth2 application

Unlike GitHub's long-lived PAT, GitLab uses a short-lived access token + refresh token pair. First-time setup has four steps:

1. **Create the OAuth application.** Go to https://gitlab.com/-/profile/applications and create an application with:
   - **Redirect URI:** `http://127.0.0.1:4567/callback` (the bootstrap script listens on this exact URL)
   - **Scopes:** `read_api` — this is enough, do not tick `api`.

   GitLab then shows an **Application ID** and a **Secret** — copy both.

2. **Fill the non-secret env vars in `.env`:**

   ```
   GITLAB_CLIENT_ID=<Application ID from step 1>
   GITLAB_CLIENT_SECRET=<Secret from step 1>
   GITLAB_REDIRECT_URI=http://127.0.0.1:4567/callback
   GITLAB_PROJECT_URL=https://gitlab.com/fdroid/fdroidclient
   ```

   `GITLAB_PROJECT_URL` is the full URL of the project you want to track. Nested groups work too (e.g. `https://gitlab.com/group/subgroup/project`).

3. **Run the bootstrap CLI to obtain the refresh token:**

   ```bash
   npm run oauth:gitlab
   ```

   The script spins up a local listener on `127.0.0.1:4567`, opens the authorize URL in your browser, you approve, and it prints a line like:

   ```
   GITLAB_REFRESH_TOKEN=abc123...
   ```

   Paste that value into `.env`.

4. **Re-run step 3 before every fresh process start.** GitLab rotates the refresh token on every refresh, and I intentionally don't rewrite `.env` from the server — see [§7](#7-gitlab-oauth2-refresh-token-rotation) for why and what a production fix looks like.

### Finish wiring `.env`

At this point `.env` should have every required var filled in. `lib/config.ts` validates them at startup via Zod and exits 1 on the first missing one, so you'll know immediately if something is off.

### Run the server and trigger an ingestion

```bash
npm run dev      # http://localhost:3000
```

Trigger ingestions with `curl`:

```bash
# Sanity checks
curl http://localhost:3000/api/health
curl http://localhost:3000/api/sources

# Run a single dataset
curl -X POST http://localhost:3000/api/ingest/github/repos
curl -X POST http://localhost:3000/api/ingest/gitlab/project-stats

# Run every dataset of a source
curl -X POST http://localhost:3000/api/ingest/github
```

Structured logs (`[github/repos] ingest.start`, `extract.ok`, `transform.ok`, `load.ok`, `ingest.done`) stream to stdout with a per-run `runId`.

## HTTP API

| Method | Path | Purpose | Success status | Error statuses |
|---|---|---|---|---|
| `GET`  | `/api/health` | Liveness + registered sources + uptime | `200` | — |
| `GET`  | `/api/sources` | List registered sources, their auth kind, and datasets | `200` | — |
| `POST` | `/api/ingest/:source/:dataset` | Run one dataset | `200` | `401`, `404`, `500`, `502`, `503` |
| `POST` | `/api/ingest/:source` | Run every dataset of a source | `200` all-ok, `207` partial | `404`, `500` |

Error codes are defined in `lib/constants.ts`. The multi-dataset endpoint always returns `{ results: IngestionResult[], allOk: boolean }`; per-dataset failures do not short-circuit the batch.

## Testing

Vitest, 49 tests across 11 files, fully offline — `fetch` is mocked at the network boundary, env is stubbed in `tests/setup.ts`. Run with `npm test` (single run) or `npm run test:watch`.

See [`docs/tests.md`](docs/tests.md) for the per-file coverage matrix, the mocking strategy, and what the suite deliberately does **not** cover.

## Tradeoffs, known limitations, and paths to scale

Notes on shortcuts, not-yet-implemented paths, and non-production-ready bits, each paired with a sketch of what a production-grade fix would look like.

### 1. Next.js for a service with no UI

**What's done now.** The service has zero UI — it's a pure HTTP backend that lives entirely in `app/api/**/route.ts`. I still chose Next.js 16 because it's the stack I'm most comfortable shipping quickly.

**Why that's not ideal.** Next.js pulls in React, a build step, and a runtime optimized for rendering pages. None of it is used here. Cold-start time, image size, and the mental model (route handlers, App Router conventions, async `params`) all carry cost that a pure server doesn't need.

**Basic path to scale.** A plain Fastify or NestJS service would be a better fit — same route structure, no React, smaller image. The pipeline code (`app/api/ingest/controller.ts`, `lib/**`, `sources/**`) has no Next.js dependency and would move across unchanged; only the four `route.ts` files would be rewritten as Fastify routes.

### 2. Databox datasets are created by hand

**What's done now.** Every new `Dataset` needs a matching Databox dataset created out-of-band with the `curl` commands in [§Databox setup](#databox--api-key-and-datasets). The service assumes the id is already in `.env` and fails fast if it isn't.

**Why that's not ideal.** The dataset's `fields` are effectively a copy of the `rowSchema` that lives next to the code. Two sources of truth drift — someone adds a field to `rowSchema`, forgets the `curl`, and ingestions silently stop sending that column.

**Basic path to scale.** Generate the dataset definition from the Zod `rowSchema` and run an idempotent "ensure dataset exists" step on service start (or as a one-shot `npm run datasets:sync`). `z.toJSONSchema(rowSchema)` (Zod 4) gives the field list; mapping Zod types to Databox field types (`ZodNumber` → `number`, `ZodString` with an ISO-date refinement → `date`, etc.) covers the common cases. Store the resulting dataset id by alias instead of by env var so new datasets don't require an env change.

### 3. GitHub is locked to one organization

**What's done now.** `GITHUB_ORG` is a single string; `sources/github/datasets/repos/extract.ts` hits `/orgs/:org/repos`. Supporting a second org means restarting the process with a different env value.

**Basic path to scale.** Move the target list out of env and into a small config file checked into the repo — e.g. `sources/github/targets.json`:

```json
{ "orgs": ["databox", "vercel"] }
```

The extract loops the list, tags each row with an `org` column so the Databox dataset can filter by it, and the rest of the pipeline (schema, transform, push) is unchanged. A longer-term version would move that list into the same Postgres the OAuth token store lives in, so the set of tracked orgs is editable at runtime without a redeploy.

### 4. GitLab is locked to one project

**What's done now.** `GITLAB_PROJECT_URL` is a single URL and `project-stats/extract.ts` parses it once. The ingestion emits exactly one row per run for that one project.

**Basic path to scale.** Same shape as §3 — a `sources/gitlab/targets.json` with an array of project URLs, loop inside extract, tag each row with `project_id` / `project_path` (already present), done. Databox charts the same metrics cross-project via a group-by. For many projects (hundreds) the `Promise.all` over three count endpoints needs a concurrency cap — trivial with something like `p-limit`.

### 5. Auth covers only bearer and OAuth2

**What's done now.** `AuthSpec` is a discriminated union of `BearerSpec` and `OAuth2Spec`. Anything else (HMAC-signed requests like AWS SigV4, mTLS, Basic with a rotating password, Databox's `x-api-key` header if I ever put it behind the same abstraction) is not expressible.

**Why that's fine for now.** The two variants cover ~90 % of data-integration auth. The shape is built to extend: add a new `kind` to the union in `lib/auth/types.ts`, a factory in `lib/auth/<kind>.ts`, a case in `lib/auth/resolve.ts`, and a test file. Sources and datasets need no changes — they only see `ctx.fetch`.

**Basic path to scale.** The same structure holds to a dozen auth kinds. Beyond that, resolvers want their own folder (`lib/auth/<kind>/index.ts`), shared test helpers, and a contract test applied to every resolver ("attaches auth", "surfaces CONFIG_MISSING when env is unset", "surfaces AUTH_INVALID on 401").

### 6. Tests are offline and basic

**What's done now.** 49 Vitest cases covering the happy path and a handful of error codes per component. The entire suite is **offline** — `fetch` is stubbed at the network boundary, env is stubbed in `tests/setup.ts`, no credentials required. Full per-file coverage matrix and mocking strategy live in [`docs/tests.md`](docs/tests.md).

**What's not covered.** Real upstream contract drift, async Databox rejections (`200 OK` on push, then marked `failed` minutes later), network-layer faults, timeouts, and the Next.js route handlers themselves. See [`docs/tests.md`](docs/tests.md#what-the-suite-does-not-catch) for the full list.

**Concrete missing edge case.** Async Databox rejection is the one that would most plausibly bite a real deployment. A test for it would:

1. Mock the `POST /v1/datasets/:id/data` call to return `200` (success).
2. Add a short poll loop in the pipeline against `GET /v1/datasets/:id/ingestions/:ingestionId` and mock that to return `{ status: "failed", errors: [...] }`.
3. Assert the pipeline returns `success: false` with a new `DATABOX_ASYNC_REJECTED` code.

The poll itself isn't implemented yet — the pipeline trusts the `200` and stops — so this is "test + production feature" rather than "test alone".

**Basic path to scale.** Add a single opt-in integration test file (`tests/integration/live.test.ts`) gated by `RUN_LIVE=1`, hitting real sandbox accounts. Keep it out of CI default; run it nightly.

### 7. GitLab OAuth2 refresh-token rotation

**What's done now.** `lib/auth/oauth2.ts` caches the access token (and the most recent refresh token) in a process-local `Map` for the lifetime of the Node process. When the access token is within 30 s of expiry I refresh it; if GitLab rotates the refresh token — which it does by default — the new value lives in memory only. `.env` still holds whatever value was pasted there after the last `npm run oauth:gitlab` run.

**What the operator sees.** The first ingestion after a process start works: the refresh token in `.env` is still valid, it gets exchanged, GitLab returns a rotated one, and that rotated value is used for subsequent in-process refreshes. The **second** process start hits `invalid_grant` because the refresh token in `.env` was consumed by the previous process and GitLab has already invalidated it.

**Current workaround.** Re-run the bootstrap before each fresh process start:

```bash
npm run oauth:gitlab
# paste the printed GITLAB_REFRESH_TOKEN= line into .env
```

**Why I didn't write `.env` back at runtime.** A request handler silently mutating the same file that `loadConfig()` reads at startup is a hidden side effect — it couples the HTTP path to the filesystem, makes `.env` non-deterministic across restarts, and loses its value the moment the service runs on more than one replica or in a read-only container filesystem.

**Basic path to scale.** Move the rotating secret out of `.env` and into the database the service should already have for ingestion runs, errors, and idempotency state. A small Postgres table is enough:

```sql
CREATE TABLE oauth_tokens (
  source         TEXT PRIMARY KEY,       -- e.g. 'gitlab'
  refresh_token  TEXT NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

1. **Seed once.** The OAuth bootstrap CLI writes the initial refresh token into this row instead of printing it for manual copy. `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` stay in `.env` — they're long-lived app credentials, not rotating state.

2. **Refresh behind a row-level lock.** Before exchanging, take `SELECT refresh_token FROM oauth_tokens WHERE source = 'gitlab' FOR UPDATE` inside a short transaction. Inside the lock: re-read (in case another worker just rotated it), call GitLab's token endpoint, `UPDATE` the row with the new refresh token, commit. This makes the N-replica case safe — GitLab never rejects one worker's refresh because another worker already consumed it. Redis is a lighter alternative if the service wants to avoid Postgres: one key for the token plus a `SET NX PX 10000` lock key.

3. **Keep the in-memory access-token cache.** Access tokens can still be cached per process for their full TTL minus skew; only the refresh step crosses the network and touches shared state.

The contract of `oauth2Fetch` doesn't need to change — swap the backing store behind a small `TokenStore` interface (`get()`, `compareAndSwap()`) with two implementations: an env-backed one for local dev and the Postgres/Redis one for production. Tests stay cheap because the interface is trivial to fake.

### 8. Ingestions run on demand only (no scheduler)

**What's done now.** Every ingestion is triggered by a `POST /api/ingest/...` call. If nobody calls, nothing updates — the Databox dashboards go stale. The challenge spec asks for scheduled ingestion, and that part is not wired in.

**Basic path to scale.** Run a scheduler **in the same service**. The simplest version is a small in-process loop started from Next.js's `instrumentation.ts` hook:

```ts
// instrumentation.ts (pseudo)
export async function register() {
  if (process.env.NODE_ENV !== "production") return;
  setInterval(() => {
    fetch("http://127.0.0.1:3000/api/ingest/github").catch(() => {});
    fetch("http://127.0.0.1:3000/api/ingest/gitlab").catch(() => {});
  }, 60 * 60 * 1000); // hourly
}
```

For cron-expression scheduling (`0 */6 * * *` style) swap the `setInterval` for a tiny library like `node-cron` or `croner`. Either way the trigger still hits the same HTTP endpoints — no duplicated logic, no extra service.

**Why co-locate the scheduler with the API rather than splitting it out.**

- **Single deployable.** One process, one image, one set of credentials. No second service to monitor, no message queue to run. Matches the scale the challenge targets.
- **Same observability.** Scheduled runs produce the same `[source/dataset] ingest.start / ingest.done` structured logs as manual runs; nothing extra to wire up.
- **Still triggerable manually.** The HTTP endpoints stay the same, so a human or an external cron can kick off a run for debugging without disturbing the schedule.

**When to split it out.** Once there are multiple replicas (the `setInterval` fires on every replica → duplicate ingestion), the scheduler moves out — either to a single "leader" replica elected via the Postgres OAuth table (`SELECT … FOR UPDATE`) or to a dedicated cron runner (Kubernetes `CronJob`, GitHub Actions scheduled workflow, or a platform-native scheduler like Vercel Cron) that hits the same HTTP endpoints. The ingestion code doesn't change — only the trigger does.

## Adding another data source (theoretical POC)

A step-by-step walkthrough (with a worked example) for wiring a third source into the pipeline lives in [`docs/adding-a-data-source.md`](docs/adding-a-data-source.md).

---

*Documentation in this repo was written with the help of AI and the [documentation-writer skill](https://skills.sh/github/awesome-copilot/documentation-writer).*
