import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mutationIsTrusted } from "../gateway/request-trust.mjs";

function request(headers) {
  return { headers };
}

test("trusts the phone commissioning origin when Caddy preserves port 8080", () => {
  assert.equal(mutationIsTrusted(request({
    "content-type": "application/json; charset=utf-8",
    "x-haven-proxy-key": "proxy-secret",
    "x-forwarded-host": "10.0.0.40:8080",
    origin: "http://10.0.0.40:8080",
  }), { mode: "live", proxyKey: "proxy-secret" }), true);
});

test("rejects the port-stripped host that caused phone scans to fail", () => {
  assert.equal(mutationIsTrusted(request({
    "content-type": "application/json",
    "x-haven-proxy-key": "proxy-secret",
    "x-forwarded-host": "10.0.0.40",
    origin: "http://10.0.0.40:8080",
  }), { mode: "live", proxyKey: "proxy-secret" }), false);
});

test("still requires the live proxy key and same-origin host", () => {
  const base = {
    "content-type": "application/json",
    "x-forwarded-host": "haven.home.arpa",
    origin: "https://haven.home.arpa",
  };
  assert.equal(mutationIsTrusted(request(base), { mode: "live", proxyKey: "proxy-secret" }), false);
  assert.equal(mutationIsTrusted(request({ ...base, "x-haven-proxy-key": "wrong" }), { mode: "live", proxyKey: "proxy-secret" }), false);
  assert.equal(mutationIsTrusted(request({ ...base, "x-haven-proxy-key": "proxy-secret" }), { mode: "live", proxyKey: "proxy-secret" }), true);
});

test("Caddy forwards the original host and port to the gateway", async () => {
  const caddyfile = await readFile(new URL("../Caddyfile", import.meta.url), "utf8");
  assert.match(caddyfile, /header_up X-Forwarded-Host \{hostport\}/);
});

test("deployment reloads Caddy after pulling proxy configuration", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
  assert.match(workflow, /caddy validate --config \/etc\/caddy\/Caddyfile/);
  assert.match(workflow, /docker compose restart caddy/);
});
