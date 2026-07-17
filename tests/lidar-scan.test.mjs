import assert from "node:assert/strict";
import test from "node:test";
import { countScanElements, smartObjectSuggestions } from "../app/lib/lidar-scan.ts";

const element = (id, category) => ({
  id,
  category,
  confidence: "high",
  dimensions: [1, 1, 1],
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
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
