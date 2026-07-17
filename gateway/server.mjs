import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mutationIsTrusted } from "./request-trust.mjs";
import { ScanStore } from "./scan-store.mjs";
import {
  emptyHomeAssistantRegistry,
  enrichEntityWithRegistry,
  normalizeHomeAssistantRegistry,
} from "./home-assistant-registry.mjs";

const port = Number(process.env.PORT || 8787);
const mode = process.env.AUTOMATION_MODE || "demo";
if (!["demo", "live"].includes(mode)) throw new Error("AUTOMATION_MODE must be demo or live");
const supervisorToken = process.env.SUPERVISOR_TOKEN || "";
const haUrl = (
  process.env.HA_URL || (supervisorToken ? "http://supervisor/core" : "http://host.docker.internal:8123")
).replace(/\/$/, "");
const haToken = process.env.HA_TOKEN || readSecret(process.env.HA_TOKEN_FILE) || supervisorToken;
const proxyKey = process.env.HAVEN_PROXY_KEY || readSecret(process.env.HAVEN_PROXY_KEY_FILE);
const allowSensitiveActions = process.env.ALLOW_SENSITIVE_ACTIONS === "true";
const scanStore = new ScanStore(process.env.SCAN_STORAGE_DIR || "/tmp/haven-scans");
await scanStore.initialize();

const subscribers = new Set();
const commandResults = new Map();
const activeAlerts = new Map();
const eventBuffer = [];
let sequence = 0;

function readSecret(path) {
  if (!path) return "";
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function emit(type, payload) {
  const event = { type, seq: ++sequence, ...payload };
  const message = JSON.stringify(event);
  eventBuffer.push(event);
  if (eventBuffer.length > 100) eventBuffer.shift();
  for (const response of subscribers) response.write(`id: ${event.seq}\ndata: ${message}\n\n`);
}

function readBody(request, maximumBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maximumBytes) {
        reject(new Error("request_too_large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    request.on("error", reject);
  });
}

function numberBetween(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error("invalid_parameters");
  return number;
}

function normalizeEntity(entity) {
  const domain = entity.entity_id.split(".")[0];
  return {
    entityId: entity.entity_id,
    domain,
    name: entity.attributes?.friendly_name || entity.entity_id,
    deviceClass: entity.attributes?.device_class,
    state: entity.state,
    unit: entity.attributes?.unit_of_measurement,
    availability: entity.state === "unavailable" ? "unavailable" : "available",
    capabilities: capabilitiesFor(domain, entity.attributes || {}),
    revision: Date.parse(entity.last_updated || entity.last_changed || new Date().toISOString()),
    changedAt: entity.last_changed || new Date().toISOString(),
    attributes: entity.attributes || {},
  };
}

function capabilitiesFor(domain, attributes) {
  const base = {
    light: ["turnOn", "turnOff", "toggle", "setBrightness"],
    climate: ["setTemperature"],
    cover: ["open", "close", "setPosition"],
    lock: ["lock", "unlock"],
    alarm_control_panel: ["armHome", "armAway", "disarm"],
  }[domain] || [];
  if (domain === "light" && attributes.supported_color_modes?.length) return [...base, "setColor"];
  return base;
}

const demoStates = new Map(
  [
    ["light.living_room", "on", { friendly_name: "Living room", brightness: 184 }],
    ["light.kitchen_pendants", "on", { friendly_name: "Kitchen pendants", brightness: 148 }],
    ["climate.main_floor", "heat", { friendly_name: "Main climate", current_temperature: 71, temperature: 72 }],
    ["binary_sensor.front_door", "off", { friendly_name: "Front door", device_class: "door" }],
    ["lock.front_door", "locked", { friendly_name: "Front door lock" }],
    ["camera.entry", "streaming", { friendly_name: "Entry camera" }],
    ["binary_sensor.entry_motion", "off", { friendly_name: "Entry motion", device_class: "motion" }],
    ["light.office_desk", "off", { friendly_name: "Desk light", brightness: 0 }],
    ["cover.primary_bedroom", "closed", { friendly_name: "Bedroom shade", current_position: 0 }],
    ["sensor.living_air_quality", "512", { friendly_name: "Air quality", unit_of_measurement: "ppm" }],
  ].map(([entityId, state, attributes]) => [
    entityId,
    normalizeEntity({
      entity_id: entityId,
      state,
      attributes,
      last_changed: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    }),
  ]),
);

class DemoProvider {
  status = "demo";

  async bootstrap() {
    return {
      schemaVersion: 1,
      providerStatus: this.status,
      provider: { name: "Demo home", version: "deterministic" },
      entities: [...demoStates.values()],
      securityAlerts: [],
      serverTime: new Date().toISOString(),
      snapshotRevision: Date.now(),
    };
  }

  async execute(request) {
    const entity = demoStates.get(request.target?.entityId);
    if (!entity) return { status: "failed", error: "entity_not_found" };
    if (["unlock", "disarm", "open"].includes(request.action)) {
      return { status: "failed", error: "safety_action_disabled_in_demo" };
    }
    if (["turnOn", "turnOff", "toggle"].includes(request.action)) {
      const current = entity.state === "on";
      const next = request.action === "toggle" ? !current : request.action === "turnOn";
      entity.state = next ? "on" : "off";
      entity.changedAt = new Date().toISOString();
      entity.revision = Date.now();
      emit("state.patch", { entity });
      return { status: "accepted" };
    }
    if (request.action === "close" && entity.domain === "cover") {
      entity.state = "closed";
      entity.attributes.current_position = 0;
      entity.changedAt = new Date().toISOString();
      entity.revision = Date.now();
      emit("state.patch", { entity });
      return { status: "accepted" };
    }
    return { status: "failed", error: "unsupported_action" };
  }
}

class HomeAssistantProvider {
  status = "offline";
  entities = new Map();
  socket = null;
  commandId = 1;
  reconnectTimer = null;
  reconnectAttempts = 0;
  pendingCommands = new Map();
  registry = emptyHomeAssistantRegistry();

  headers() {
    return { Authorization: `Bearer ${haToken}`, "Content-Type": "application/json" };
  }

  async api(path, options = {}) {
    const response = await fetch(`${haUrl}${path}`, { ...options, headers: { ...this.headers(), ...(options.headers || {}) } });
    if (!response.ok) throw new Error(`home_assistant_${response.status}`);
    return response.json();
  }

  async connect() {
    if (!haToken) throw new Error("missing_home_assistant_token");
    const [config, states] = await Promise.all([this.api("/api/config"), this.api("/api/states")]);
    this.entities = new Map(states.map((state) => {
      const normalized = normalizeEntity(state);
      return [normalized.entityId, normalized];
    }));
    this.config = config;
    await this.connectWebSocket();
    this.status = "online";
    this.reconnectAttempts = 0;
    emit("provider.status", { status: this.status });
  }

  connectWebSocket() {
    if (this.socket && this.socket.readyState < 2) this.socket.close();
    const socketUrl = new URL(haUrl);
    socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
    socketUrl.pathname = "/api/websocket";
    const socket = new WebSocket(socketUrl);
    this.socket = socket;

    return new Promise((resolve, reject) => {
      let settled = false;
      socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "auth_required") {
        socket.send(JSON.stringify({ type: "auth", access_token: haToken }));
      } else if (message.type === "auth_ok") {
        this.loadRegistries(socket).finally(() => {
          if (socket.readyState !== 1) {
            if (!settled) {
              settled = true;
              reject(new Error("home_assistant_socket_closed"));
            }
            return;
          }
          socket.send(JSON.stringify({ id: this.commandId++, type: "subscribe_events", event_type: "state_changed" }));
          settled = true;
          resolve();
        });
      } else if (message.type === "result") {
        const pending = this.pendingCommands.get(message.id);
        if (pending) {
          this.pendingCommands.delete(message.id);
          clearTimeout(pending.timeout);
          if (message.success) pending.resolve(message.result);
          else pending.reject(new Error(message.error?.code || "home_assistant_command_failed"));
        }
      } else if (message.type === "event" && message.event?.event_type === "state_changed") {
        this.handleStateChanged(message.event.data);
      } else if (message.type === "auth_invalid") {
        this.status = "offline";
        emit("provider.status", { status: this.status });
        settled = true;
        reject(new Error("home_assistant_auth_invalid"));
        socket.close();
      }
      });

      socket.addEventListener("close", () => {
        if (this.socket !== socket) return;
        if (!settled) {
          settled = true;
          reject(new Error("home_assistant_socket_closed"));
        } else {
          this.scheduleReconnect();
        }
      });
      socket.addEventListener("error", () => socket.close());
    });
  }

  async loadRegistries(socket) {
    const [areas, devices, entityDisplay] = await Promise.allSettled([
      this.sendCommand(socket, "config/area_registry/list"),
      this.sendCommand(socket, "config/device_registry/list"),
      this.sendCommand(socket, "config/entity_registry/list_for_display"),
    ]);
    this.registry = normalizeHomeAssistantRegistry({
      areas: areas.status === "fulfilled" ? areas.value : [],
      devices: devices.status === "fulfilled" ? devices.value : [],
      entityDisplay: entityDisplay.status === "fulfilled" ? entityDisplay.value : {},
    });
  }

  sendCommand(socket, type) {
    const id = this.commandId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error("home_assistant_command_timeout"));
      }, 8_000);
      this.pendingCommands.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, type }));
    });
  }

  handleStateChanged(data) {
    if (!data?.new_state) return;
    const previous = this.entities.get(data.entity_id);
    const entity = enrichEntityWithRegistry(normalizeEntity(data.new_state), this.registry);
    this.entities.set(entity.entityId, entity);
    emit("state.patch", { entity });

    const isOpening =
      entity.domain === "binary_sensor" &&
      ["door", "window", "opening"].includes(entity.deviceClass) &&
      entity.state === "on" &&
      previous?.state !== "on";
    const isMotion =
      entity.domain === "binary_sensor" &&
      entity.deviceClass === "motion" &&
      entity.state === "on" &&
      previous?.state !== "on";
    if (isMotion) {
      emit("motion.detected", {
        entityId: entity.entityId,
        occurredAt: new Date().toISOString(),
      });
    }
    if (isOpening) {
      const alert = {
        id: randomUUID(),
        entityId: entity.entityId,
        kind: "intrusion",
        severity: "warning",
        status: "active",
        occurredAt: new Date().toISOString(),
        title: `${entity.name} opened`,
        message: "An exterior opening changed state.",
      };
      activeAlerts.set(entity.entityId, alert);
      emit("security.alert", { alert });
    } else if (
      entity.domain === "binary_sensor" &&
      ["door", "window", "opening"].includes(entity.deviceClass) &&
      entity.state === "off" &&
      activeAlerts.has(entity.entityId)
    ) {
      const alert = activeAlerts.get(entity.entityId);
      activeAlerts.delete(entity.entityId);
      emit("security.cleared", { alertId: alert.id, entityId: entity.entityId });
    }
  }

  scheduleReconnect() {
    this.status = "offline";
    emit("provider.status", { status: this.status });
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(60_000, 2_000 * 2 ** this.reconnectAttempts) + Math.round(Math.random() * 1000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => this.connect().catch(() => this.scheduleReconnect()), delay);
  }

  async bootstrap() {
    return {
      schemaVersion: 1,
      providerStatus: this.status,
      provider: { name: this.config?.location_name || "Home Assistant", version: this.config?.version },
      entities: [...this.entities.values()].map((entity) => enrichEntityWithRegistry(entity, this.registry)),
      areas: this.registry.areas,
      devices: this.registry.devices,
      securityAlerts: [...activeAlerts.values()],
      serverTime: new Date().toISOString(),
      snapshotRevision: Date.now(),
    };
  }

  async execute(request) {
    if (this.status !== "online") return { status: "failed", error: "provider_offline" };
    const entityId = request.target?.entityId;
    const domain = entityId?.split(".")[0];
    const action = serviceFor(request.action, domain);
    if (!entityId || !action) return { status: "failed", error: "unsupported_action" };
    if (!this.entities.has(entityId)) return { status: "failed", error: "entity_not_found" };
    if (["unlock", "disarm", "open", "setPosition"].includes(request.action) && !allowSensitiveActions) {
      return { status: "failed", error: "sensitive_action_disabled" };
    }

    const body = { entity_id: entityId };
    if (request.action === "setBrightness") body.brightness_pct = numberBetween(request.parameters?.brightness, 0, 100);
    if (request.action === "setTemperature") body.temperature = numberBetween(request.parameters?.temperature, -20, 120);
    if (request.action === "setPosition") body.position = numberBetween(request.parameters?.position, 0, 100);
    await this.api(`/api/services/${action.domain}/${action.service}`, { method: "POST", body: JSON.stringify(body) });
    return { status: "accepted" };
  }
}

function serviceFor(action, domain) {
  const powerDomains = new Set(["light", "switch", "fan", "media_player", "input_boolean"]);
  if (["turnOn", "turnOff", "toggle"].includes(action)) {
    if (!powerDomains.has(domain)) return null;
    return {
      domain,
      service: { turnOn: "turn_on", turnOff: "turn_off", toggle: "toggle" }[action],
    };
  }

  const services = {
    setBrightness: ["light", "turn_on"],
    setTemperature: ["climate", "set_temperature"],
    open: ["cover", "open_cover"],
    close: ["cover", "close_cover"],
    setPosition: ["cover", "set_cover_position"],
    lock: ["lock", "lock"],
    unlock: ["lock", "unlock"],
    armHome: ["alarm_control_panel", "alarm_arm_home"],
    armAway: ["alarm_control_panel", "alarm_arm_away"],
    disarm: ["alarm_control_panel", "alarm_disarm"],
  };
  const pair = services[action];
  if (!pair || pair[0] !== domain) return null;
  return { domain: pair[0], service: pair[1] };
}

const provider = mode === "demo" ? new DemoProvider() : new HomeAssistantProvider();

if (mode !== "demo") {
  provider.connect().catch((error) => {
    console.error(`[haven-gateway] Home Assistant connection failed: ${error.message}`);
    provider.scheduleReconnect();
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/v1/health") {
    return sendJson(response, 200, {
      ok: true,
      mode,
      providerStatus: provider.status,
      sensitiveActionsEnabled: allowSensitiveActions,
    });
  }
  if (request.method === "GET" && url.pathname === "/api/v1/bootstrap") {
    return sendJson(response, 200, await provider.bootstrap());
  }
  if (request.method === "GET" && url.pathname === "/api/v1/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const lastEventId = Number(request.headers["last-event-id"] || 0);
    if (lastEventId > 0) {
      const firstBufferedId = eventBuffer[0]?.seq || sequence + 1;
      if (lastEventId < firstBufferedId - 1) {
        response.write(`id: ${sequence}\ndata: ${JSON.stringify({ type: "resync.required", seq: sequence })}\n\n`);
      } else {
        for (const event of eventBuffer.filter((item) => item.seq > lastEventId)) {
          response.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
        }
      }
    } else {
      response.write(`id: ${sequence}\ndata: ${JSON.stringify({ type: "provider.status", seq: sequence, status: provider.status })}\n\n`);
    }
    subscribers.add(response);
    const heartbeat = setInterval(() => response.write(": keepalive\n\n"), 15_000);
    request.on("close", () => {
      clearInterval(heartbeat);
      subscribers.delete(response);
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/v1/actions") {
    try {
      if (!mutationIsTrusted(request, { mode, proxyKey })) return sendJson(response, 403, { error: "untrusted_request" });
      const action = await readBody(request);
      if (!action.requestId || !action.target || !action.action) return sendJson(response, 400, { error: "invalid_action" });
      if (commandResults.has(action.requestId)) return sendJson(response, 200, commandResults.get(action.requestId));
      const result = await provider.execute(action);
      commandResults.set(action.requestId, result);
      if (commandResults.size > 1000) commandResults.delete(commandResults.keys().next().value);
      emit("command.result", { requestId: action.requestId, ...result });
      return sendJson(response, result.status === "accepted" ? 202 : 409, result);
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/v1/scans") {
    try {
      if (!mutationIsTrusted(request, { mode, proxyKey })) return sendJson(response, 403, { error: "untrusted_request" });
      const body = await readBody(request);
      const session = await scanStore.createSession(body);
      return sendJson(response, 201, session);
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }
  if (request.method === "GET" && url.pathname === "/api/v1/scans/latest") {
    const session = await scanStore.getLatestCompleted();
    if (!session) return sendJson(response, 404, { error: "scan_not_found" });
    const scan = await scanStore.getScan(session.id);
    return sendJson(response, 200, { ...session, scan });
  }
  const assignmentMatch = url.pathname.match(/^\/api\/v1\/scans\/([0-9a-f-]{36})\/assignments$/i);
  if (assignmentMatch && request.method === "PUT") {
    try {
      if (!mutationIsTrusted(request, { mode, proxyKey })) return sendJson(response, 403, { error: "untrusted_request" });
      const body = await readBody(request);
      const scan = await scanStore.updateAssignment(assignmentMatch[1], body.smartObjectId, body.entityId || null);
      return sendJson(response, 200, scan);
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }
  const scanMatch = url.pathname.match(/^\/api\/v1\/scans\/([0-9a-f-]{36})$/i);
  if (scanMatch && request.method === "GET") {
    try {
      const session = await scanStore.getSession(scanMatch[1]);
      if (!session) return sendJson(response, 404, { error: "scan_not_found" });
      if (session.status !== "complete") return sendJson(response, 200, session);
      const scan = await scanStore.getScan(scanMatch[1]);
      return sendJson(response, 200, { ...session, scan });
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }
  if (scanMatch && request.method === "PUT") {
    try {
      const authorization = request.headers.authorization || "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      const scan = await readBody(request, 5 * 1024 * 1024);
      const session = await scanStore.completeSession(scanMatch[1], token, scan);
      emit("scan.completed", { scanId: session.id, receivedAt: session.receivedAt });
      return sendJson(response, 200, session);
    } catch (error) {
      const status = error.message === "scan_not_found" ? 404
        : ["invalid_scan_token", "scan_expired"].includes(error.message) ? 403
          : error.message === "scan_already_complete" ? 409
          : error.message === "request_too_large" ? 413
            : 400;
      return sendJson(response, status, { error: error.message });
    }
  }
  return sendJson(response, 404, { error: "not_found" });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[haven-gateway] listening on :${port} in ${mode} mode`);
});
