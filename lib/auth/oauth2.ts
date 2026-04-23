import type { AuthenticatedFetch, OAuth2Spec } from "@/lib/auth/types";
import { fetchWithRetry } from "@/lib/http";
import { ingestError } from "@/lib/types";

type CachedToken = { accessToken: string; refreshToken: string; expiresAt: number };

// Process-lifetime cache, keyed by tokenUrl+refreshTokenEnvVar so two oauth2
// sources never share a token.
const cache = new Map<string, CachedToken>();

// Refresh this many ms before actual expiry to avoid races at the boundary.
const EXPIRY_SKEW_MS = 30_000;

export function oauth2Fetch(spec: OAuth2Spec): AuthenticatedFetch {
  const cacheKey = `${spec.tokenUrl}|${spec.refreshTokenEnvVar}`;
  return async (input, init = {}) => {
    const token = await getAccessToken(spec, cacheKey);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetchWithRetry(input, { ...init, headers });
  };
}

async function getAccessToken(spec: OAuth2Spec, cacheKey: string): Promise<string> {
  const existing = cache.get(cacheKey);
  if (existing && existing.expiresAt - EXPIRY_SKEW_MS > Date.now()) {
    return existing.accessToken;
  }

  const clientId = process.env[spec.clientIdEnvVar];
  const clientSecret = process.env[spec.clientSecretEnvVar];
  // Prefer an in-memory rotated refresh token over the env var, since
  // GitLab invalidates the previous refresh token on each refresh.
  const refreshToken = existing?.refreshToken ?? process.env[spec.refreshTokenEnvVar];

  if (!clientId || !clientSecret || !refreshToken) {
    throw ingestError(
      "CONFIG_MISSING",
      `oauth2 requires ${spec.clientIdEnvVar}, ${spec.clientSecretEnvVar}, ${spec.refreshTokenEnvVar}`,
      false,
    );
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetchWithRetry(spec.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const snippet = text.slice(0, 200);
    if (res.status === 400 || res.status === 401) {
      throw ingestError(
        "AUTH_INVALID",
        `oauth2 refresh rejected (${res.status}): ${snippet}`,
        false,
      );
    }
    throw ingestError(
      res.status >= 500 ? "UPSTREAM_5XX" : "UPSTREAM_4XX",
      `oauth2 token endpoint ${res.status}: ${snippet}`,
      res.status >= 500,
    );
  }

  const payload = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!payload.access_token) {
    throw ingestError("AUTH_INVALID", "oauth2 response missing access_token", false);
  }

  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
  const entry: CachedToken = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  cache.set(cacheKey, entry);
  return entry.accessToken;
}

// Exposed for tests only.
export function __resetOAuth2Cache(): void {
  cache.clear();
}
