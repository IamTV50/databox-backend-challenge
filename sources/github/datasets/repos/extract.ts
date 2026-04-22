import { loadConfig } from "@/lib/config";
import { ingestError, type ExtractContext } from "@/lib/types";
import type { Repo } from "./schema";

const GITHUB_API = "https://api.github.com";

export async function extract(ctx: ExtractContext): Promise<Repo[]> {
  const { GITHUB_ORG } = loadConfig();
  const all: Repo[] = [];
  let url: string | null = `${GITHUB_API}/orgs/${encodeURIComponent(GITHUB_ORG)}/repos?type=all&per_page=100`;

  while (url) {
    const res: Response = await ctx.fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw toUpstreamError(res.status, body);
    }

    const page = (await res.json()) as Repo[];
    all.push(...page);
    url = nextLink(res.headers.get("link"));
  }

  return all;
}

function toUpstreamError(status: number, body: string): Error {
  const snippet = body.slice(0, 200);
  if (status === 401 || status === 403) {
    return ingestError("AUTH_INVALID", `GitHub auth rejected (${status}): ${snippet}`, false);
  }
  if (status === 429) {
    return ingestError("RATE_LIMIT", `GitHub rate limited (${status})`, true);
  }
  if (status >= 500) {
    return ingestError("UPSTREAM_5XX", `GitHub ${status}: ${snippet}`, true);
  }
  return ingestError("UPSTREAM_4XX", `GitHub ${status}: ${snippet}`, false);
}

function nextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match && match[2] === "next") return match[1];
  }
  return null;
}
