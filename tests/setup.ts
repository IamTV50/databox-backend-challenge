import { vi } from "vitest";

// Stub env BEFORE any test file imports run so loadConfig() caches test values.
vi.stubEnv("DATABOX_API_KEY", "test-api-key");
vi.stubEnv("DATABOX_BASE_URL", "https://api.databox.test");
vi.stubEnv("GITHUB_TOKEN", "gh-test-token");
vi.stubEnv("GITHUB_ORG", "testorg");
vi.stubEnv("GITHUB_REPOS_DATASET_ID", "ds-test");
vi.stubEnv("GITLAB_PROJECT_URL", "https://gitlab.test/acme/demo");
vi.stubEnv("GITLAB_CLIENT_ID", "gl-client");
vi.stubEnv("GITLAB_CLIENT_SECRET", "gl-secret");
vi.stubEnv("GITLAB_REFRESH_TOKEN", "gl-refresh");
vi.stubEnv("GITLAB_REDIRECT_URI", "http://127.0.0.1:4567/callback");
vi.stubEnv("GITLAB_PROJECT_STATS_DATASET_ID", "ds-gitlab-test");

// Silence the pipeline's structured console output in tests. Individual tests
// can still spy via vi.spyOn(console, ...) when they need to assert on logs.
vi.spyOn(console, "info").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});
