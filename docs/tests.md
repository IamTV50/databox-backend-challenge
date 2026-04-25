# Tests

Vitest-powered test suite for the ingestion service — 49 tests across 11 files, all offline. Most are unit tests; one file (`tests/pipeline.test.ts`) is an integration test that wires several real modules together behind a single mocked `fetch`.

## Running

```bash
npm test           # single run, CI-style
npm run test:watch # watch mode while developing
```

No network access, no credentials, no real Databox / GitHub / GitLab calls — the whole suite runs in ~850 ms.

## What each file covers

| File | Kind | What it pins down |
|---|---|---|
| `tests/github/transform.test.ts` | unit | `transform()` produces flat rows with `id`, `captured_at`, `schema_version`; booleans → `0/1`; `null` fields are omitted from the JSON payload |
| `tests/github/schema.test.ts` | unit | `rawSchema` accepts valid repos, strips unknown keys, rejects missing required fields; `rowSchema` accepts full and optional-omitted rows |
| `tests/github/extract.test.ts` | unit | Paginates via the `Link` header's `rel="next"`; 401 → `AUTH_INVALID`; 429 → `RATE_LIMIT` |
| `tests/gitlab/transform.test.ts` | unit | `transform()` emits exactly one row per ingestion (time-series snapshot); defaults `open_issues` and `commits` to 0 when the project payload omits them |
| `tests/gitlab/schema.test.ts` | unit | `rawSchema` accepts a valid project + counts payload, strips unknown project fields, rejects missing counts; `rowSchema` rejects missing metrics or missing `id` |
| `tests/gitlab/extract.test.ts` | unit | Reads counts from the `x-total` header on branches/tags/MR endpoints; 401 → `AUTH_INVALID`; missing `x-total` → `SCHEMA_MISMATCH` |
| `tests/http.test.ts` | unit | `fetchWithRetry` doesn't retry on 2xx, retries on 5xx until it gets 2xx, doesn't retry 4xx, returns the last response after max attempts |
| `tests/auth/bearer.test.ts` | unit | Attaches `Authorization: Bearer`, honors custom header name/prefix, surfaces `CONFIG_MISSING` when the token env var is unset |
| `tests/auth/oauth2.test.ts` | unit | Exchanges refresh token for an access token and attaches `Bearer`; caches the access token in-process; prefers the rotated refresh token over the env one; 400 → `AUTH_INVALID`; missing env → `CONFIG_MISSING` |
| `tests/databox/client.test.ts` | unit | `pushDataset` POSTs to `/v1/datasets/{id}/data` with `x-api-key` + `{records}`; chunks at 100 per call; 4xx → `DATABOX_REJECTED`; empty rows short-circuit |
| `tests/pipeline.test.ts` | integration | `runDataset` end-to-end for both `github/repos` and `gitlab/project-stats` (real auth resolver + real extract + real transform + real push, fetch mocked at the network boundary); `runSource` iterates all datasets; `UNKNOWN_SOURCE`/`UNKNOWN_DATASET` throw; OAuth token exchange failure surfaces as `AUTH_INVALID` |

## Mocking strategy

Everything is mocked at the **outermost IO boundary** — no test hits a real server.

- **`fetch`** is stubbed per-test with `vi.stubGlobal("fetch", ...)`. The pipeline test uses a URL-host dispatcher so a single mock handles GitHub (`api.github.com`), GitLab API (`gitlab.test`), the GitLab OAuth token endpoint (`gitlab.com/oauth/token`), and Databox (`api.databox.test`) in the same run.
- **`process.env`** is stubbed once globally in `tests/setup.ts` before any test file loads, so `loadConfig()` caches test-friendly values (`DATABOX_API_KEY=test-api-key`, etc.). Individual tests override with `vi.stubEnv` where needed.
- **Console** — `console.info`/`warn`/`error` are silenced in `tests/setup.ts` to keep test output clean. Individual tests can re-spy if they need to assert on log output.
- **OAuth token cache** — the in-process cache in `lib/auth/oauth2.ts` is reset between tests via `__resetOAuth2Cache()` so a token from one test can't leak into another.
- **Fixtures** — `tests/fixtures.ts` exports `makeRepo(overrides)` (GitHub) and `makeGitlabProject(overrides)` (GitLab).
- **Clock / randomness** — real `Date` and real `Math.random` are used. Backoff delays in `fetchWithRetry` are shortened to ~1 ms per attempt via the `baseDelayMs` option so the suite stays fast.

## What this approach buys

- Fast (~850 ms for 49 tests) and deterministic — no flakes from network or API rate limits.
- Works offline, no secrets needed in CI.
- Schema + transform tests catch the common class of bugs (upstream field rename, type drift) without needing a real GitHub or GitLab response.

## What the suite does *not* catch

- **Real provider contract drift.** GitHub, GitLab, or Databox changing their actual response shape is invisible here. `rawSchema` would catch it at runtime, but the test suite wouldn't.
- **OAuth token rotation in the wild.** The test doubles the rotation path but a real GitLab refresh is never exercised. In production the env `GITLAB_REFRESH_TOKEN` is invalidated after the first refresh — see [README → OAuth refresh-token rotation](../README.md#7-gitlab-oauth2-refresh-token-rotation).
- **Async Databox rejection.** The push is mocked as a 200-ack and the test stops there. Databox can 200-ack and then mark the ingestion `failed` minutes later. That path isn't exercised by any test and the pipeline doesn't poll for it yet — see [README → Tests are offline and basic](../README.md#6-tests-are-offline-and-basic) for the sketch of a test + feature pair.
- **Network-layer bugs** — DNS, TLS, connection resets, body-stream interruptions. The mock returns clean `Response` objects.
- **HTTP handler wiring.** The Next.js route files (`app/api/.../route.ts`) aren't tested directly; only the controller they call. A broken `params` destructure wouldn't be caught here — `next build` catches that separately.
- **`AbortSignal` / timeout behavior** in `fetchWithRetry` is not asserted (would need fake timers + careful orchestration; deferred until an actual timeout regression shows up).

## Adding tests for a new source or dataset

1. Transform test — pure function, mirror `tests/github/transform.test.ts`.
2. Schema test — happy path plus one required-field-missing case, both for `rawSchema` and `rowSchema`.
3. Extract test — pagination scheme + the error-code mapping (`AUTH_INVALID`, `RATE_LIMIT`, `SCHEMA_MISMATCH`, etc.).
4. Extend `tests/pipeline.test.ts` — add a describe block that mocks the new provider's host and calls `runDataset("<source>", "<dataset>")`.
5. Stub any new env vars in `tests/setup.ts` so `loadConfig()` is happy.
6. Keep fixtures in `tests/fixtures.ts` so other tests can reuse them.

See [`docs/adding-a-data-source.md`](adding-a-data-source.md) for the full source-level walkthrough.
