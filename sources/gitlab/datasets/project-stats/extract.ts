import { loadConfig } from "@/lib/config";
import { ingestError, type ExtractContext } from "@/lib/types";
import type { Raw } from "./schema";

export async function extract(ctx: ExtractContext): Promise<Raw> {
  const { GITLAB_PROJECT_URL } = loadConfig();
  const parsed = new URL(GITLAB_PROJECT_URL);
  const projectPath = parsed.pathname.replace(/^\/+|\/+$/g, "");
  const base = `${parsed.origin}/api/v4/projects/${encodeURIComponent(projectPath)}`;

  const projectRes = await ctx.fetch(`${base}?statistics=true&license=false`);
  if (!projectRes.ok) throw toUpstreamError("project", projectRes.status, await safeBody(projectRes));
  const project = await projectRes.json();

  const [branches_count, tags_count, open_merge_requests] = await Promise.all([
    countViaXTotal(ctx, `${base}/repository/branches?per_page=1`, "branches"),
    countViaXTotal(ctx, `${base}/repository/tags?per_page=1`, "tags"),
    countViaXTotal(ctx, `${base}/merge_requests?state=opened&per_page=1`, "merge_requests"),
  ]);

  return { project, branches_count, tags_count, open_merge_requests };
}

// GitLab returns the total row count in `x-total` for offset-paginated
// collections. It may be omitted for very large collections — if that
// happens we surface it as a schema mismatch rather than silently reporting 0.
async function countViaXTotal(
  ctx: ExtractContext,
  url: string,
  label: string,
): Promise<number> {
  const res = await ctx.fetch(url);
  if (!res.ok) throw toUpstreamError(label, res.status, await safeBody(res));
  const total = res.headers.get("x-total");
  if (total == null || total === "") {
    throw ingestError(
      "SCHEMA_MISMATCH",
      `GitLab ${label} response missing x-total header (collection may be too large for offset pagination)`,
      false,
    );
  }
  const parsed = Number(total);
  if (!Number.isFinite(parsed)) {
    throw ingestError("SCHEMA_MISMATCH", `GitLab ${label} x-total "${total}" is not a number`, false);
  }
  return parsed;
}

async function safeBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function toUpstreamError(label: string, status: number, body: string): Error {
  const snippet = body.slice(0, 200);
  if (status === 401 || status === 403) {
    return ingestError("AUTH_INVALID", `GitLab ${label} auth rejected (${status}): ${snippet}`, false);
  }
  if (status === 404) {
    return ingestError("UPSTREAM_4XX", `GitLab ${label} not found (${status}): ${snippet}`, false);
  }
  if (status === 429) {
    return ingestError("RATE_LIMIT", `GitLab ${label} rate limited (${status})`, true);
  }
  if (status >= 500) {
    return ingestError("UPSTREAM_5XX", `GitLab ${label} ${status}: ${snippet}`, true);
  }
  return ingestError("UPSTREAM_4XX", `GitLab ${label} ${status}: ${snippet}`, false);
}
