export type AuthSpec = {
  kind: "bearer";
  tokenEnvVar: string;
  header?: { name: string; prefix?: string };
};

export type AuthenticatedFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;
