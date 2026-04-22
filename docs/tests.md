# Tests

Vitest-powered test suite for the Databox ingestion service. Most tests are unit tests; one file (`tests/pipeline.test.ts`) is an integration test that wires several real modules together behind a single mocked `fetch`.

## Running

```bash
npm test           # single run, CI-style
npm run test:watch # watch mode while developing
```

No network access, no credentials, no real Databox or GitHub calls — the whole suite runs offline.

## What each file covers

| File | Kind | What it pins down |
|---|---|---|
| `tests/github/transform.test.ts` | unit | `transform()` produces flat rows with `id`, `captured_at`, `schema_version`; booleans → `0/1`; `null` fields are omitted from the JSON payload |
| `tests/github/schema.test.ts` | unit | `rawSchema` accepts valid repos, strips unknown keys, rejects missing required fields; `rowSchema` accepts full and optional-omitted rows |
| `tests/github/extract.test.ts` | unit | Paginates via the `Link` header's `rel="next"`; 401 → `AUTH_INVALID`; 429 → `RATE_LIMIT` |
| `tests/http.test.ts` | unit | `fetchWithRetry` doesn't retry on 2xx, retries on 5xx until it gets 2xx, doesn't retry 4xx, returns the last response after max attempts |
| `tests/auth/bearer.test.ts` | unit | Attaches `Authorization: Bearer`, honors custom header name/prefix, surfaces `CONFIG_MISSING` when the token env var is unset |
| `tests/databox/client.test.ts` | unit | `pushDataset` POSTs to `/v1/datasets/{id}/data` with `x-api-key` + `{records}`; chunks at 100 per call; 4xx → `DATABOX_REJECTED`; empty rows short-circuit |
| `tests/pipeline.test.ts` | integration | `runDataset` end-to-end (real auth resolver + real extract + real transform + real push, fetch mocked at the network boundary); `runSource` iterates all datasets; `UNKNOWN_SOURCE`/`UNKNOWN_DATASET` throw |

## Mocking strategy

Everything is mocked at the **outermost IO boundary** — we never hit a real server.

- **`fetch`** is stubbed per-test with `vi.stubGlobal("fetch", ...)`. The pipeline test uses a URL-host dispatcher so a single mock handles both GitHub (`api.github.com`) and Databox (`api.databox.test`) in the same run.
- **`process.env`** is stubbed once globally in `tests/setup.ts` before any test file loads, so `loadConfig()` caches test-friendly values (`DATABOX_API_KEY=test-api-key`, etc.). Individual tests can override with `vi.stubEnv` where they need to.
- **Console** — `console.info`/`warn`/`error` are silenced in `tests/setup.ts` to keep test output clean. Individual tests can re-spy if they need to assert on log output.
- **Fixtures** — `tests/fixtures.ts` exports `makeRepo(overrides)`, a valid GitHub repo factory used by the extract, transform, and pipeline tests.
- **Clock / randomness** — real `Date` and real `Math.random` are used. Backoff delays in `fetchWithRetry` are shortened to ~1ms per attempt via the `baseDelayMs` option so the suite stays fast.

## Tradeoffs of this approach

**Pros:**

- Fast (~500ms for 31 tests) and deterministic — no flakes from network or API rate limits.
- Works offline, no secrets needed in CI.
- Schema + transform tests catch the common class of bugs (upstream field rename, type drift) without needing a real GitHub response.

**Cons — what these tests *do not* catch:**

- **Real provider contract drift.** GitHub or Databox changing their actual response shape is invisible here. Our `rawSchema` would catch it at runtime, but the test suite wouldn't.
- **Async Databox rejection.** We mock the push as a 200-ack and stop there. In reality Databox can 200-ack then mark the ingestion `failed` asynchronously. That path is not exercised by any test.
- **Network-layer bugs** — DNS, TLS, connection resets, body-stream interruptions. The mock returns clean `Response` objects.
- **HTTP handler wiring.** The Next.js route files (`app/api/.../route.ts`) aren't tested; only the controller they call. A broken `params` destructure wouldn't be caught here — `next build` catches that separately.
- **`AbortSignal` / timeout behavior** in `fetchWithRetry` is not asserted (would need fake timers + careful orchestration; deferred until we actually see a timeout regression).

## Adding a test for a new source or dataset

1. Add a transform test — pure function, just like `tests/github/transform.test.ts`.
2. Add a schema test — cover the happy path and one required-field-missing case.
3. Extend `tests/pipeline.test.ts` — add a describe block that mocks the new provider's host and calls `runDataset("new-source", "new-dataset")`.

Keep fixtures in `tests/fixtures.ts` so other tests can reuse them.
