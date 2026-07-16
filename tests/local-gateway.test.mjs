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
  ];

  for (const [input, expectedKind] of cases) {
    assert.equal(gatewayEntityToDevice(input)?.kind, expectedKind, input.entityId);
  }
});

test("omits unsupported Home Assistant domains", () => {
  assert.equal(
    gatewayEntityToDevice(entity({ entityId: "switch.coffee_machine", domain: "switch" })),
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
    entity({ entityId: "switch.coffee_machine", domain: "switch" }),
  );

  assert.deepEqual(afterSecond.map((device) => device.entityId), [
    "binary_sensor.hall_motion",
    "binary_sensor.kitchen_motion",
  ]);
  assert.deepEqual(afterUnsupported, afterSecond);
});

