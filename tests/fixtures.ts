import type { Repo } from "@/sources/github/datasets/repos/schema";

export function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 1,
    name: "foo",
    full_name: "testorg/foo",
    html_url: "https://github.com/testorg/foo",
    private: false,
    archived: false,
    stargazers_count: 10,
    forks_count: 2,
    open_issues_count: 3,
    pushed_at: "2025-12-30T00:00:00Z",
    default_branch: "main",
    ...overrides,
  };
}
