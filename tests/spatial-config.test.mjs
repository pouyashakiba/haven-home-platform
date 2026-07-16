import assert from "node:assert/strict";
import test from "node:test";
import {
  createSpatialStorageKey,
  findRoomForPosition,
  normalizeRoomName,
  pointInRoomXZ,
  polygonAreaXZ,
  roomCentroid,
} from "../app/lib/spatial-config.ts";

const livingRoom = {
  id: "living",
  name: "Living Room",
  color: "#70e0be",
  points: [
    [0, 0, 0],
    [4, 0, 0],
    [4, 0, 3],
    [0, 0, 3],
  ],
};

test("normalizes room names for reliable matching", () => {
  assert.equal(normalizeRoomName("  Living\t ROOM  "), "living room");
  assert.equal(normalizeRoomName("ＦＯＹＥＲ"), "foyer");
  assert.equal(normalizeRoomName("\n\t"), "");
});

test("calculates X/Z polygon area independent of winding", () => {
  assert.equal(polygonAreaXZ(livingRoom.points), 12);
  assert.equal(polygonAreaXZ([...livingRoom.points].reverse()), 12);
  assert.equal(polygonAreaXZ([[0, 0, 0], [1, 0, 1]]), 0);
});

test("includes room edges and vertices while excluding outside points", () => {
  assert.equal(pointInRoomXZ([2, 9, 1], livingRoom), true, "Y does not affect floor-plan membership");
  assert.equal(pointInRoomXZ([4, 0, 1.5], livingRoom), true, "edge is included");
  assert.equal(pointInRoomXZ([0, 0, 0], livingRoom), true, "vertex is included");
  assert.equal(pointInRoomXZ([4.01, 0, 1.5], livingRoom), false);
});

test("handles concave rooms and finds the first containing room", () => {
  const concaveRoom = {
    id: "hall",
    name: "Hall",
    color: "#8892a0",
    points: [
      [5, 0, 0],
      [8, 0, 0],
      [8, 0, 1],
      [6, 0, 1],
      [6, 0, 3],
      [5, 0, 3],
    ],
  };

  assert.equal(pointInRoomXZ([5.5, 0, 2.5], concaveRoom), true);
  assert.equal(pointInRoomXZ([7, 0, 2], concaveRoom), false, "point is inside the concavity cutout");
  assert.equal(findRoomForPosition([5.5, 0, 2.5], [livingRoom, concaveRoom]), concaveRoom);
  assert.equal(findRoomForPosition([20, 0, 20], [livingRoom, concaveRoom]), undefined);
});

test("calculates the polygon centroid and preserves the floor height", () => {
  const elevated = { ...livingRoom, points: livingRoom.points.map(([x, , z]) => [x, 2, z]) };
  assert.deepEqual(roomCentroid(elevated), [2, 2, 1.5]);
  assert.deepEqual(
    roomCentroid({ ...livingRoom, points: [[0, 1, 0], [2, 1, 0]] }),
    [1, 1, 0],
    "degenerate rooms use their mean point",
  );
  assert.deepEqual(roomCentroid({ ...livingRoom, points: [] }), [0, 0, 0]);
});

test("creates a stable browser-local key from model metadata", () => {
  const model = { name: " Oakwood  House ", totalBytes: 24_800_000, triangleCount: 287_451 };
  const expected = "haven:spatial:v1:oakwood%20house:24800000:287451";
  assert.equal(createSpatialStorageKey(model), expected);
  assert.equal(createSpatialStorageKey({ ...model, name: "oakwood house" }), expected);
  assert.notEqual(createSpatialStorageKey({ ...model, triangleCount: 287_452 }), expected);
  assert.notEqual(createSpatialStorageKey({ ...model, totalBytes: 24_800_001 }), expected);
});

