import type { AutomationAction } from "./automation-provider";
import { createClientId } from "./client-id.ts";
import type { HomeDevice } from "./home-data";

export type RuntimeProviderStatus = "demo" | "connecting" | "online" | "stale" | "offline";

export type GatewayEntity = {
  entityId: string;
  domain: string;
  name?: string;
  deviceClass?: string;
  state: string;
  availability: "available" | "unavailable" | "unknown";
  attributes: Record<string, unknown>;
};

function displayName(entity: GatewayEntity) {
  const candidates = [entity.name, entity.attributes.friendly_name];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return entity.entityId
    .split(".")
    .at(-1)!
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function deviceKind(entity: GatewayEntity): HomeDevice["kind"] | null {
  if (entity.domain === "light") return "light";
  if (entity.domain === "climate") return "climate";
  if (entity.domain === "lock") return "lock";
  if (entity.domain === "camera") return "camera";
  if (entity.domain === "cover") return "shade";
  if (entity.domain === "sensor") return "sensor";
  if (entity.domain === "binary_sensor") {
    if (entity.deviceClass === "motion" || entity.deviceClass === "occupancy") return "motion";
    return "sensor";
  }
  return null;
}

/** Convert every supported Home Assistant entity into a placeable Haven device. */
export function gatewayEntityToDevice(entity: GatewayEntity): HomeDevice | null {
  const kind = deviceKind(entity);
  if (!kind) return null;
  const available = entity.availability === "available";
  const rawBrightness = Number(entity.attributes.brightness);
  const brightness = Number.isFinite(rawBrightness) ? Math.round((rawBrightness / 255) * 100) : null;
  const rawPosition = Number(entity.attributes.current_position);
  const position = Number.isFinite(rawPosition) ? rawPosition : null;
  const active =
    kind === "light"
      ? entity.state === "on"
      : kind === "motion"
        ? entity.state === "on"
        : kind === "shade"
          ? entity.state === "open" || (position ?? 0) > 0
          : kind === "climate"
            ? entity.state !== "off"
            : kind === "camera"
              ? available
              : false;

  const state =
    kind === "light"
      ? active ? "On" : "Off"
      : kind === "motion"
        ? active ? "Movement" : "Clear"
        : kind === "shade"
          ? active ? "Open" : "Closed"
          : kind === "camera"
            ? available ? "Live" : "Offline"
            : entity.state;
  const detail =
    kind === "light" && active && brightness !== null
      ? `${brightness}%`
      : kind === "shade" && position !== null
        ? `${position}% open`
        : kind === "motion"
          ? active ? "Movement just detected" : "No current movement"
          : entity.entityId;

  return {
    id: entity.entityId,
    entityId: entity.entityId,
    name: displayName(entity),
    room: "Unassigned",
    kind,
    state,
    detail,
    active,
    available,
  };
}

type BootstrapResponse = {
  providerStatus: RuntimeProviderStatus;
  entities: GatewayEntity[];
};

export const usesLocalGateway = process.env.NEXT_PUBLIC_AUTOMATION_SOURCE === "gateway";

export async function loadGatewaySnapshot(): Promise<BootstrapResponse> {
  const response = await fetch("/api/v1/bootstrap", {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`gateway_${response.status}`);
  return response.json();
}

export async function sendGatewayAction(
  entityId: string,
  action: AutomationAction,
  parameters?: Record<string, unknown>,
) {
  const response = await fetch("/api/v1/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: createClientId(),
      target: { entityId },
      action,
      parameters,
    }),
  });
  const result = (await response.json()) as { status?: "accepted" | "failed"; error?: string };
  if (!response.ok || result.status !== "accepted") {
    throw new Error(result.error || `gateway_${response.status}`);
  }
  return result;
}

export function subscribeToGateway(
  onMessage: (message: Record<string, unknown>) => void,
  onOffline: () => void,
) {
  const events = new EventSource("/api/v1/events");
  events.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      // Keep the stream alive when a single event is malformed.
    }
  };
  events.onerror = onOffline;
  return () => events.close();
}

export function mergeGatewayEntity(devices: HomeDevice[], entity: GatewayEntity) {
  let matched = false;
  const next = devices.map((device) => {
    if (device.entityId !== entity.entityId) return device;
    matched = true;

    const available = entity.availability === "available";
    if (device.kind === "light") {
      const active = entity.state === "on";
      const rawBrightness = Number(entity.attributes.brightness);
      const brightness = Number.isFinite(rawBrightness) ? Math.round((rawBrightness / 255) * 100) : null;
      return {
        ...device,
        active,
        available,
        state: active ? "On" : "Off",
        detail: active && brightness !== null ? `${brightness}% · warm` : active ? "On" : "Off",
      };
    }
    if (device.kind === "climate") {
      const temperature = Number(entity.attributes.temperature);
      return {
        ...device,
        active: entity.state !== "off",
        available,
        state: Number.isFinite(temperature) ? `${temperature}°` : entity.state,
        detail: Number.isFinite(temperature) ? `Set to ${temperature}°` : entity.state,
      };
    }
    if (device.kind === "shade") {
      const position = Number(entity.attributes.current_position);
      const active = entity.state === "open" || position > 0;
      return {
        ...device,
        active,
        available,
        state: active ? "Open" : "Closed",
        detail: Number.isFinite(position) ? `${position}% open` : entity.state,
      };
    }
    if (entity.domain === "binary_sensor") {
      const active = entity.state === "on";
      if (device.kind === "motion") {
        return {
          ...device,
          entityId: entity.entityId,
          active,
          available,
          state: active ? "Movement" : "Clear",
          detail: active ? "Movement just detected" : "No current movement",
        };
      }
      return {
        ...device,
        active,
        available,
        state: active ? "Open" : "Closed",
        detail: active ? "Opened just now" : "Closed",
      };
    }
    return { ...device, available, state: entity.state };
  });
  if (matched) return next;
  const discovered = gatewayEntityToDevice(entity);
  return discovered ? [...next, discovered] : next;
}
