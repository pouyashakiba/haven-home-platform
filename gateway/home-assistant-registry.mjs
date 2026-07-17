export function emptyHomeAssistantRegistry() {
  return {
    areas: [],
    devices: [],
    areasById: new Map(),
    devicesById: new Map(),
    entitiesById: new Map(),
  };
}

export function normalizeHomeAssistantRegistry({ areas = [], devices = [], entityDisplay = {} } = {}) {
  const normalizedAreas = arrayValue(areas).map((area) => ({
    id: stringValue(area.area_id || area.id),
    name: stringValue(area.name) || "Unnamed area",
    floorId: optionalString(area.floor_id || area.floorId),
  })).filter((area) => area.id);

  const normalizedDevices = arrayValue(devices).map((device) => ({
    id: stringValue(device.id),
    name: stringValue(device.name_by_user || device.name) || "Unnamed device",
    areaId: optionalString(device.area_id || device.areaId),
    manufacturer: optionalString(device.manufacturer),
    model: optionalString(device.model),
    disabled: Boolean(device.disabled_by || device.disabledBy),
  })).filter((device) => device.id && !device.disabled);

  const displayEntities = Array.isArray(entityDisplay)
    ? entityDisplay
    : arrayValue(entityDisplay?.entities);
  const categoryNames = entityDisplay?.entity_categories || {};
  const normalizedEntities = displayEntities.map((entity) => ({
    entityId: stringValue(entity.ei || entity.entity_id || entity.entityId),
    deviceId: optionalString(entity.di || entity.device_id || entity.deviceId),
    areaId: optionalString(entity.ai || entity.area_id || entity.areaId),
    platform: optionalString(entity.pl || entity.platform),
    name: optionalString(entity.en || entity.name || entity.original_name),
    hidden: Boolean(entity.hb || entity.hidden_by || entity.hiddenBy),
    entityCategory: entity.ec == null ? optionalString(entity.entity_category) : optionalString(categoryNames[entity.ec]),
  })).filter((entity) => entity.entityId && !entity.hidden && entity.entityCategory !== "diagnostic");

  return {
    areas: normalizedAreas,
    devices: normalizedDevices,
    areasById: new Map(normalizedAreas.map((area) => [area.id, area])),
    devicesById: new Map(normalizedDevices.map((device) => [device.id, device])),
    entitiesById: new Map(normalizedEntities.map((entity) => [entity.entityId, entity])),
  };
}

export function enrichEntityWithRegistry(entity, registry = emptyHomeAssistantRegistry()) {
  const entry = registry.entitiesById.get(entity.entityId);
  const device = entry?.deviceId ? registry.devicesById.get(entry.deviceId) : undefined;
  const areaId = entry?.areaId || device?.areaId;
  const area = areaId ? registry.areasById.get(areaId) : undefined;
  return {
    ...entity,
    name: entry?.name || entity.name,
    deviceId: entry?.deviceId,
    deviceName: device?.name,
    areaId,
    areaName: area?.name,
    platform: entry?.platform,
    manufacturer: device?.manufacturer,
    model: device?.model,
  };
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value) {
  return stringValue(value) || undefined;
}
