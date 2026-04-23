#!/usr/bin/env node
// One-shot CLI to obtain a GitLab OAuth2 refresh token using the
// authorization_code flow. Prints the refresh token for the user to paste
// into .env as GITLAB_REFRESH_TOKEN.
//
// Usage:
//   node --env-file=.env scripts/oauth-bootstrap.mjs
//
// Requires in .env: GITLAB_CLIENT_ID, GITLAB_CLIENT_SECRET, GITLAB_REDIRECT_URI.
// Optional: GITLAB_BASE_URL (defaults to https://gitlab.com).
//
// The script spins up a local HTTP listener on the host:port parsed from
// GITLAB_REDIRECT_URI, opens the authorize URL, exchanges the returned code
// for tokens, prints them, and exits.

import http from "node:http";
import crypto from "node:crypto";
import { URL } from "node:url";

const REQUIRED = ["GITLAB_CLIENT_ID", "GITLAB_CLIENT_SECRET", "GITLAB_REDIRECT_URI"];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing env vars: ${missing.join(", ")}`);
  console.error("Tip: run with `node --env-file=.env scripts/oauth-bootstrap.mjs`");
  process.exit(1);
}

const clientId = process.env.GITLAB_CLIENT_ID;
const clientSecret = process.env.GITLAB_CLIENT_SECRET;
const redirectUri = process.env.GITLAB_REDIRECT_URI;
const base = (process.env.GITLAB_BASE_URL ?? "https://gitlab.com").replace(/\/$/, "");
const scope = "read_api";

let redirect;
try {
  redirect = new URL(redirectUri);
} catch {
  console.error(`GITLAB_REDIRECT_URI is not a valid URL: ${redirectUri}`);
  process.exit(1);
}
if (redirect.hostname !== "127.0.0.1" && redirect.hostname !== "localhost") {
  console.error(`GITLAB_REDIRECT_URI host must be 127.0.0.1 or localhost, got ${redirect.hostname}`);
  process.exit(1);
}

const state = crypto.randomBytes(16).toString("hex");
const authorizeUrl = new URL(`${base}/oauth/authorize`);
authorizeUrl.searchParams.set("client_id", clientId);
authorizeUrl.searchParams.set("redirect_uri", redirectUri);
authorizeUrl.searchParams.set("response_type", "code");
authorizeUrl.searchParams.set("state", state);
authorizeUrl.searchParams.set("scope", scope);

const port = Number(redirect.port || 80);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (url.pathname !== redirect.pathname) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }

  const err = url.searchParams.get("error");
  if (err) {
    writeHtml(res, 400, `<h1>Authorization failed</h1><pre>${escapeHtml(err)}</pre>`);
    console.error(`authorization failed: ${err}`);
    shutdown(1);
    return;
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  if (!code || returnedState !== state) {
    writeHtml(res, 400, `<h1>Invalid callback</h1>`);
    console.error("invalid callback: missing code or state mismatch");
    shutdown(1);
    return;
  }

  try {
    const tokens = await exchange(code);
    writeHtml(res, 200, `<h1>Done — you can close this tab.</h1>`);
    console.info("\nPaste this into your .env:\n");
    console.info(`GITLAB_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    console.info("(access_token is short-lived; the service refreshes it at runtime.)");
    shutdown(0);
  } catch (e) {
    writeHtml(res, 500, `<h1>Token exchange failed</h1><pre>${escapeHtml(String(e))}</pre>`);
    console.error("token exchange failed:", e);
    shutdown(1);
  }
});

server.listen(port, redirect.hostname, () => {
  console.info(`Listening on ${redirectUri}`);
  console.info("Open this URL in your browser to authorize:\n");
  console.info(authorizeUrl.toString());
  console.info("");
});

async function exchange(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });
  const res = await fetch(`${base}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function writeHtml(res, status, body) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8">${body}`);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function shutdown(code) {
  server.close(() => process.exit(code));
}
