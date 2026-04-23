export type BearerSpec = {
  kind: "bearer";
  tokenEnvVar: string;
  header?: { name: string; prefix?: string };
};

export type OAuth2Spec = {
  kind: "oauth2";
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  refreshTokenEnvVar: string;
  tokenUrl: string;
};

export type AuthSpec = BearerSpec | OAuth2Spec;

export type AuthenticatedFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;
