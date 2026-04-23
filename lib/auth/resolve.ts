import type { AuthSpec, AuthenticatedFetch } from "@/lib/auth/types";
import { bearerFetch } from "@/lib/auth/bearer";
import { oauth2Fetch } from "@/lib/auth/oauth2";

export async function resolveAuth(spec: AuthSpec): Promise<AuthenticatedFetch> {
  switch (spec.kind) {
    case "bearer":
      return bearerFetch(spec);
    case "oauth2":
      return oauth2Fetch(spec);
  }
}
