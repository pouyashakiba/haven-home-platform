import assert from "node:assert/strict";
import test from "node:test";
import { countScanElements, scanSmartObjects, smartObjectSuggestions } from "../app/lib/lidar-scan.ts";

const element = (id, category) => ({
  id,
  category,
  confidence: "high",
  dimensions: [1, 1, 1],
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
});

test("prefers confirmed spatial smart objects and keeps their room", () => {
  const confirmed = structuredClone(scan);
  confirmed.rooms[0].smartObjects = [{
    ...element("smart-tv", "smart_tv"),
    label: "Smart TV",
    source: "roomplan",
    sourceElementId: "tv-1",
  }, {
    ...element("thermostat", "thermostat"),
    label: "Thermostat",
    source: "vision",
  }];
  assert.deepEqual(smartObjectSuggestions(confirmed), [
    { category: "smart_tv", count: 1, deviceKind: "media", label: "Smart TV" },
    { category: "thermostat", count: 1, deviceKind: "climate", label: "Thermostat" },
  ]);
  assert.equal(scanSmartObjects(confirmed)[0].roomName, "Living room");
  assert.equal(countScanElements(confirmed), 8);
});

const scan = {
  schemaVersion: 1,
  sessionId: "scan-id",
  deviceName: "iPhone",
  capturedAt: new Date(0).toISOString(),
  rooms: [{
    id: "living",
    name: "Living room",
    walls: [element("wall", "wall")],
    doors: [element("door", "door")],
    windows: [],
    openings: [],
    floors: [element("floor", "floor")],
    objects: [element("tv-1", "television"), element("tv-2", "television"), element("lamp", "lamp")],
  }],
};

test("counts all RoomPlan surfaces and objects", () => {
  assert.equal(countScanElements(scan), 6);
});

test("groups detected objects into useful smart-home candidates", () => {
  assert.deepEqual(smartObjectSuggestions(scan), [
    { category: "television", count: 2, deviceKind: "media", label: "Smart TV" },
    { category: "lamp", count: 1, deviceKind: "light", label: "Smart light" },
  ]);
});
