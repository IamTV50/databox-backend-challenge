import type { AuthSpec, AuthenticatedFetch } from "@/lib/auth/types";
import { bearerFetch } from "@/lib/auth/bearer";

export async function resolveAuth(spec: AuthSpec): Promise<AuthenticatedFetch> {
  switch (spec.kind) {
    case "bearer":
      return bearerFetch(spec);
  }
}
