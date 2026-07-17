import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";
import { createClientId } from "../app/lib/client-id.ts";
import { loadLocalHouseModel, releaseLocalHouseModel } from "../app/lib/house-model.ts";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("uses randomUUID when the browser provides it", () => {
  const id = createClientId({ randomUUID: () => "native-id" });
  assert.equal(id, "native-id");
});

test("creates a UUID-shaped ID when randomUUID is unavailable", () => {
  const id = createClientId({
    getRandomValues(bytes) {
      bytes.fill(0x2a);
      return bytes;
    },
  });
  assert.match(id, UUID_V4_PATTERN);
});

test("creates a local fallback ID when Web Crypto is unavailable", () => {
  assert.match(createClientId(null), UUID_V4_PATTERN);
});

function createTriangleGlb() {
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 0, 1,
  ]);
  const document = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 0, 1] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 }],
    buffers: [{ byteLength: positions.byteLength }],
  };

  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(json.byteLength / 4) * 4;
  const binaryLength = Math.ceil(positions.byteLength / 4) * 4;
  const totalLength = 12 + 8 + jsonLength + 8 + binaryLength;
  const result = new ArrayBuffer(totalLength);
  const view = new DataView(result);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(result, 20, jsonLength).fill(0x20);
  new Uint8Array(result, 20, json.byteLength).set(json);
  const binaryHeader = 20 + jsonLength;
  view.setUint32(binaryHeader, binaryLength, true);
  view.setUint32(binaryHeader + 4, 0x004e4942, true);
  new Uint8Array(result, binaryHeader + 8, positions.byteLength).set(new Uint8Array(positions.buffer));
  return result;
}

test("validates, parses, and normalizes a local GLB", async () => {
  const file = new File([createTriangleGlb()], "test-house.glb", { type: "model/gltf-binary" });
  const { model } = await loadLocalHouseModel(file);
  assert.equal(model.triangleCount, 1);
  assert.ok(Number.isFinite(model.scale) && model.scale > 0);
  assert.deepEqual(model.position.length, 3);
  releaseLocalHouseModel(model);
});

test("rejects a renamed or invalid GLB before parsing", async () => {
  const file = new File([new Uint8Array(12)], "not-a-house.glb", { type: "model/gltf-binary" });
  await assert.rejects(loadLocalHouseModel(file), /valid GLB 2\.0/);
});
