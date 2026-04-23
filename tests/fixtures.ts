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

type GitlabProject = {
  id: number;
  name: string;
  path_with_namespace: string;
  web_url: string;
  star_count: number;
  forks_count: number;
  open_issues_count?: number;
  statistics?: { commit_count: number };
};

export function makeGitlabProject(overrides: Partial<GitlabProject> = {}): GitlabProject {
  return {
    id: 42,
    name: "demo",
    path_with_namespace: "acme/demo",
    web_url: "https://gitlab.test/acme/demo",
    star_count: 7,
    forks_count: 1,
    open_issues_count: 4,
    statistics: { commit_count: 123 },
    ...overrides,
  };
}
