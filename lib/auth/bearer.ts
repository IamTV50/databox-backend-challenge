import type { AuthenticatedFetch, BearerSpec } from "@/lib/auth/types";
import { fetchWithRetry } from "@/lib/http";
import { ingestError } from "@/lib/types";

export function bearerFetch(spec: BearerSpec): AuthenticatedFetch {
  return async (input, init = {}) => {
    const token = process.env[spec.tokenEnvVar];
    if (!token) {
      throw ingestError(
        "CONFIG_MISSING",
        `bearer token env var "${spec.tokenEnvVar}" is not set`,
        false,
      );
    }
    const headerName = spec.header?.name ?? "Authorization";
    const prefix = spec.header?.prefix ?? "Bearer ";
    const headers = new Headers(init.headers);
    headers.set(headerName, `${prefix}${token}`);
    return fetchWithRetry(input, { ...init, headers });
  };
}
