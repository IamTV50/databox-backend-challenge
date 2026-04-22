export const CODE_STATUS: Record<string, number> = {
  UNKNOWN_SOURCE: 404,
  UNKNOWN_DATASET: 404,
  AUTH_INVALID: 401,
  UPSTREAM_4XX: 502,
  UPSTREAM_5XX: 503,
  RATE_LIMIT: 503,
  TIMEOUT: 503,
  SCHEMA_MISMATCH: 502,
  DATABOX_REJECTED: 502,
  DATABOX_UPSTREAM: 503,
  CONFIG_MISSING: 500,
};

export function statusFor(code: string): number {
  return CODE_STATUS[code] ?? 500;
}
