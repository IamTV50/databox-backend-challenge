# Tradeoffs

Notes on shortcuts, not-yet-implemented paths, and non-production-ready bits of the current code, each paired with a sketch of what a production-grade fix would look like.

## GitLab OAuth2 refresh token rotation

**What is done now.** `lib/auth/oauth2.ts` caches the access token (and the most recent refresh token) in a process-local `Map` for the lifetime of the Node process. When the access token is within 30 s of expiry I refresh it; if GitLab rotates the refresh token — which it does by default — the new value lives in memory only. `.env` still holds whatever value was pasted there after the last `npm run oauth:gitlab` run.

**What the operator sees.** The first ingestion after a process start works: the refresh token in `.env` is still valid, it gets exchanged, GitLab returns a rotated one, and that rotated value is used for subsequent in-process refreshes. The **second** process start hits `invalid_grant` because the refresh token in `.env` was consumed by the previous process and GitLab has already invalidated it.

**Current workaround.** Re-run the bootstrap before each fresh process start:

```bash
npm run oauth:gitlab
# paste the printed GITLAB_REFRESH_TOKEN= line into .env
```

**Why I didn't write `.env` back at runtime.** A request handler silently mutating the same file that `loadConfig()` reads at startup is a hidden side effect — it couples the HTTP path to the filesystem, makes `.env` non-deterministic across restarts, and loses its value the moment the service runs on more than one replica or in a read-only container filesystem.

### A basic production-ready approach

Move the rotating secret out of `.env` and into the database the service should already have for ingestion runs, errors, and idempotency state. A small Postgres table is enough:

```sql
CREATE TABLE oauth_tokens (
  source         TEXT PRIMARY KEY,        -- e.g. 'gitlab'
  refresh_token  TEXT NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

1. **Seed once.** The OAuth bootstrap CLI writes the initial refresh token into this row instead of printing it for manual copy. `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` stay in `.env` — they're long-lived app credentials, not rotating state.

2. **Refresh behind a row-level lock.** Before exchanging, take `SELECT refresh_token FROM oauth_tokens WHERE source = 'gitlab' FOR UPDATE` inside a short transaction. Inside the lock: re-read (in case another worker just rotated it), call GitLab's token endpoint, `UPDATE` the row with the new refresh token, commit. This makes the N-replica case safe — GitLab never rejects one worker's refresh because another worker already consumed it. Redis is a lighter alternative if the service wants to avoid Postgres: one key for the token plus a `SET NX PX 10000` lock key.

3. **Keep the in-memory access-token cache.** Access tokens can still be cached per process for their full TTL minus the skew; only the refresh step crosses the network and touches shared state.

The contract of `oauth2Fetch` doesn't need to change — swap the backing store behind a small `TokenStore` interface (`get()`, `compareAndSwap()`) with two implementations: an env-backed one for local dev and the Postgres/Redis one for production. Tests stay cheap because the interface is trivial to fake.
