import assert from "node:assert/strict";
import test from "node:test";
import { enrichEntityWithRegistry, normalizeHomeAssistantRegistry } from "../gateway/home-assistant-registry.mjs";

test("joins Home Assistant entities to devices and areas for commissioning", () => {
  const registry = normalizeHomeAssistantRegistry({
    areas: [{ area_id: "living_room", name: "Living room" }],
    devices: [{ id: "device-1", name: "Samsung TV", area_id: "living_room", manufacturer: "Samsung", model: "Frame" }],
    entityDisplay: {
      entity_categories: { 0: "config", 1: "diagnostic" },
      entities: [{ ei: "media_player.samsung_tv", di: "device-1", pl: "samsungtv", en: "Living TV" }],
    },
  });
  const enriched = enrichEntityWithRegistry({ entityId: "media_player.samsung_tv", name: "TV" }, registry);
  assert.deepEqual(enriched, {
    entityId: "media_player.samsung_tv",
    name: "Living TV",
    deviceId: "device-1",
    deviceName: "Samsung TV",
    areaId: "living_room",
    areaName: "Living room",
    platform: "samsungtv",
    manufacturer: "Samsung",
    model: "Frame",
  });
});

test("excludes hidden, diagnostic, and disabled registry entries", () => {
  const registry = normalizeHomeAssistantRegistry({
    devices: [{ id: "disabled", name: "Old device", disabled_by: "user" }],
    entityDisplay: {
      entity_categories: { 1: "diagnostic" },
      entities: [
        { ei: "sensor.hidden", hb: true },
        { ei: "sensor.diagnostic", ec: 1 },
        { ei: "switch.available" },
      ],
    },
  });
  assert.deepEqual(registry.devices, []);
  assert.deepEqual([...registry.entitiesById.keys()], ["switch.available"]);
});
