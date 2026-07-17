import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ScanStore } from "../gateway/scan-store.mjs";

function bundle(sessionId) {
  const element = {
    id: "wall-1",
    category: "wall",
    confidence: "high",
    dimensions: [3, 2.4, 0.08],
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.2, 0, 1],
  };
  return {
    schemaVersion: 1,
    sessionId,
    deviceName: "Test iPhone",
    capturedAt: new Date(0).toISOString(),
    rooms: [{ id: "room-1", name: "Living room", walls: [element], doors: [], windows: [], openings: [], floors: [], objects: [] }],
  };
}

test("creates a private handoff, validates its token, and persists the completed scan", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "haven-scans-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ScanStore(directory);
  await store.initialize();

  const session = await store.createSession({ serverUrl: "http://10.0.0.40:8080", callbackUrl: "http://10.0.0.40:8080/" });
  assert.equal(session.status, "waiting");
  const link = new URL(session.deepLink);
  const token = link.searchParams.get("token");
  assert.ok(token);
  assert.equal(link.searchParams.get("session"), session.id);

  await assert.rejects(() => store.completeSession(session.id, "wrong", bundle(session.id)), /invalid_scan_token/);
  await store.completeSession(session.id, token, bundle(session.id));
  assert.equal((await store.getSession(session.id)).status, "complete");
  assert.equal((await store.getScan(session.id)).rooms[0].name, "Living room");
  assert.equal((await store.getLatestCompleted()).id, session.id);
  await assert.rejects(() => store.completeSession(session.id, token, bundle(session.id)), /scan_already_complete/);
});

test("rejects callback URLs that leave the home server origin", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "haven-scans-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ScanStore(directory);
  await store.initialize();
  await assert.rejects(
    () => store.createSession({ serverUrl: "http://10.0.0.40:8080", callbackUrl: "https://example.com/" }),
    /callback_origin_mismatch/,
  );
});
