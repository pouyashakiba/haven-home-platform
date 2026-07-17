import assert from "node:assert/strict";
import test from "node:test";
import { gatewayEntityToDevice, mergeGatewayEntity } from "../app/lib/local-gateway.ts";

function entity(overrides = {}) {
  return {
    entityId: "light.kitchen_pendants",
    domain: "light",
    state: "off",
    availability: "available",
    attributes: {},
    ...overrides,
  };
}

test("maps explicit, friendly, and entity-id display names", () => {
  assert.equal(gatewayEntityToDevice(entity({ name: "  Kitchen pendants  " })).name, "Kitchen pendants");
  assert.equal(
    gatewayEntityToDevice(entity({ name: "  ", attributes: { friendly_name: "Island lights" } })).name,
    "Island lights",
  );
  assert.equal(
    gatewayEntityToDevice(entity({ entityId: "light.guest_room_lamp" })).name,
    "Guest Room Lamp",
  );
});

test("maps supported Home Assistant domains and device classes to Haven kinds", () => {
  const cases = [
    [entity(), "light"],
    [entity({ entityId: "camera.entry", domain: "camera", state: "streaming" }), "camera"],
    [entity({ entityId: "binary_sensor.hall_motion", domain: "binary_sensor", deviceClass: "motion" }), "motion"],
    [entity({ entityId: "binary_sensor.office_occupancy", domain: "binary_sensor", deviceClass: "occupancy" }), "motion"],
    [entity({ entityId: "cover.bedroom", domain: "cover", state: "closed" }), "shade"],
    [entity({ entityId: "sensor.air_quality", domain: "sensor", state: "good" }), "sensor"],
    [entity({ entityId: "media_player.living_tv", domain: "media_player", state: "playing" }), "media"],
    [entity({ entityId: "switch.wall_dimmer", domain: "switch", state: "on" }), "switch"],
    [entity({ entityId: "alarm_control_panel.house", domain: "alarm_control_panel", state: "disarmed" }), "keypad"],
    [entity({ entityId: "fan.bedroom", domain: "fan", state: "off" }), "fan"],
  ];

  for (const [input, expectedKind] of cases) {
    assert.equal(gatewayEntityToDevice(input)?.kind, expectedKind, input.entityId);
  }
});

test("omits unsupported Home Assistant domains", () => {
  assert.equal(
    gatewayEntityToDevice(entity({ entityId: "automation.good_morning", domain: "automation" })),
    null,
  );
});

test("merges an exact entity update without replacing commissioning metadata", () => {
  const configured = {
    id: "anchor-kitchen-light",
    entityId: "light.kitchen_pendants",
    name: "Island",
    room: "Kitchen",
    kind: "light",
    state: "Off",
    detail: "Off",
    active: false,
    available: true,
  };
  const result = mergeGatewayEntity(
    [configured],
    entity({ state: "on", attributes: { brightness: 128 } }),
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].id, configured.id);
  assert.equal(result[0].name, configured.name);
  assert.equal(result[0].room, configured.room);
  assert.equal(result[0].active, true);
  assert.equal(result[0].state, "On");
  assert.match(result[0].detail, /50%/);
});

test("appends each newly discovered supported entity and ignores unsupported ones", () => {
  const firstMotion = entity({
    entityId: "binary_sensor.hall_motion",
    domain: "binary_sensor",
    deviceClass: "motion",
  });
  const secondMotion = entity({
    entityId: "binary_sensor.kitchen_motion",
    domain: "binary_sensor",
    deviceClass: "motion",
  });

  const afterFirst = mergeGatewayEntity([], firstMotion);
  const afterSecond = mergeGatewayEntity(afterFirst, secondMotion);
  const afterUnsupported = mergeGatewayEntity(
    afterSecond,
    entity({ entityId: "automation.coffee_machine", domain: "automation" }),
  );

  assert.deepEqual(afterSecond.map((device) => device.entityId), [
    "binary_sensor.hall_motion",
    "binary_sensor.kitchen_motion",
  ]);
  assert.deepEqual(afterUnsupported, afterSecond);
});

test("uses Home Assistant area and hardware metadata in discovered devices", () => {
  const result = gatewayEntityToDevice(entity({
    entityId: "media_player.living_tv",
    domain: "media_player",
    state: "playing",
    areaId: "living_room",
    areaName: "Living room",
    deviceId: "device-1",
    platform: "samsungtv",
    manufacturer: "Samsung",
    model: "Frame",
  }));
  assert.equal(result.room, "Living room");
  assert.equal(result.kind, "media");
  assert.equal(result.deviceId, "device-1");
  assert.match(result.detail, /Samsung · Frame/);
});
