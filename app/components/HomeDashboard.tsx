"use client";

import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Armchair,
  BellRing,
  Blinds,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  CloudSun,
  Eye,
  House,
  LayoutGrid,
  Layers3,
  Lightbulb,
  LockKeyhole,
  MapPin,
  Minus,
  MoonStar,
  MoreHorizontal,
  Plus,
  Power,
  Radio,
  RotateCcw,
  ScanLine,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Upload,
  UserRoundCheck,
  Wifi,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CommissioningPanel, type CommissioningMode } from "./CommissioningPanel";
import { createClientId } from "../lib/client-id.ts";
import { demoDevices, roomSummary, type DeviceKind, type HomeDevice } from "../lib/home-data";
import {
  formatModelSize,
  formatTriangleCount,
  loadLocalHouseModel,
  releaseLocalHouseModel,
  type LocalHouseModel,
} from "../lib/house-model";
import {
  loadGatewaySnapshot,
  mergeGatewayEntity,
  sendGatewayAction,
  subscribeToGateway,
  usesLocalGateway,
  type GatewayEntity,
  type RuntimeProviderStatus,
} from "../lib/local-gateway";
import {
  countScanElements,
  createLidarScanSession,
  loadLatestLidarScan,
  loadLidarScanSession,
  smartObjectSuggestions,
  type HavenScanBundle,
  type ScanSession,
} from "../lib/lidar-scan";
import {
  createSpatialStorageKey,
  findRoomForPosition,
  normalizeRoomName,
  polygonAreaXZ,
  type DeviceAnchor,
  type SpatialRoom,
  type Vec3,
} from "../lib/spatial-config";

const HouseScene = dynamic(() => import("./HouseScene"), {
  ssr: false,
  loading: () => (
    <div className="scene-loading" role="status">
      <div className="scene-loading-orbit" />
      <span>Preparing your home</span>
    </div>
  ),
});

type NavId = "Home" | "Rooms" | "Climate" | "Security" | "Energy" | "Settings";
type DeviceFilter = "All" | "Lights" | "Climate" | "Security";
type ModeId = "Home" | "Away" | "Sleep" | "Guest";
type RoomBrowserItem = { id: string; name: string; value: string; active: number };

const navigation: Array<{ id: NavId; icon: typeof House }> = [
  { id: "Home", icon: House },
  { id: "Rooms", icon: LayoutGrid },
  { id: "Climate", icon: Thermometer },
  { id: "Security", icon: ShieldCheck },
  { id: "Energy", icon: Zap },
];

const mobileNavigation: Array<{ id: NavId; icon: typeof House; label: string }> = [
  { id: "Home", icon: House, label: "Home" },
  { id: "Rooms", icon: LayoutGrid, label: "Rooms" },
  { id: "Climate", icon: Thermometer, label: "Climate" },
  { id: "Security", icon: ShieldCheck, label: "Security" },
  { id: "Settings", icon: Settings, label: "Setup" },
];

const modes: Array<{ id: ModeId; icon: typeof House; note: string }> = [
  { id: "Home", icon: House, note: "Comfort and security" },
  { id: "Away", icon: ShieldCheck, note: "Arm and conserve" },
  { id: "Sleep", icon: MoonStar, note: "Quiet the house" },
  { id: "Guest", icon: UserRoundCheck, note: "Welcome lighting" },
];

const filterKinds: Record<DeviceFilter, DeviceKind[] | null> = {
  All: null,
  Lights: ["light"],
  Climate: ["climate", "sensor"],
  Security: ["lock", "camera", "motion"],
};

const spatialRoomColors = ["#70e0be", "#62c3ff", "#ffc857", "#a78bfa", "#ff8f70", "#8ad36f"];

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every((part) => typeof part === "number" && Number.isFinite(part));
}

function readSpatialMap(raw: string | null): { rooms: SpatialRoom[]; anchors: DeviceAnchor[] } {
  if (!raw) return { rooms: [], anchors: [] };
  try {
    const parsed = JSON.parse(raw) as { schemaVersion?: unknown; rooms?: unknown; anchors?: unknown };
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.rooms) || !Array.isArray(parsed.anchors)) {
      return { rooms: [], anchors: [] };
    }
    const rooms = parsed.rooms.filter((room): room is SpatialRoom => {
      if (!room || typeof room !== "object") return false;
      const candidate = room as Partial<SpatialRoom>;
      return typeof candidate.id === "string"
        && typeof candidate.name === "string"
        && typeof candidate.color === "string"
        && Array.isArray(candidate.points)
        && candidate.points.length >= 3
        && candidate.points.every(isVec3);
    });
    const anchors = parsed.anchors.filter((anchor): anchor is DeviceAnchor => {
      if (!anchor || typeof anchor !== "object") return false;
      const candidate = anchor as Partial<DeviceAnchor>;
      return typeof candidate.deviceId === "string"
        && typeof candidate.roomId === "string"
        && isVec3(candidate.position);
    });
    return { rooms, anchors };
  } catch {
    return { rooms: [], anchors: [] };
  }
}

function DeviceGlyph({ kind, size = 19 }: { kind: DeviceKind; size?: number }) {
  const Icon =
    kind === "light"
      ? Lightbulb
      : kind === "climate"
        ? Thermometer
        : kind === "lock"
          ? LockKeyhole
          : kind === "camera"
            ? Camera
            : kind === "motion"
              ? ScanLine
            : kind === "shade"
              ? Blinds
              : Wind;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}

function formatTime(date: Date | null) {
  if (!date) return "--:--";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDate(date: Date | null) {
  if (!date) return "Tuesday, July 14";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function HomeDashboard() {
  const [now, setNow] = useState<Date | null>(null);
  const [devices, setDevices] = useState<HomeDevice[]>(demoDevices);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<NavId>("Home");
  const [activeMode, setActiveMode] = useState<ModeId>("Home");
  const [filter, setFilter] = useState<DeviceFilter>("All");
  const [browserMode, setBrowserMode] = useState<"Devices" | "Rooms">("Devices");
  const [query, setQuery] = useState("");
  const [alertActive, setAlertActive] = useState(false);
  const [targetTemp, setTargetTemp] = useState(72);
  const [toast, setToast] = useState<string | null>(null);
  const [motionPulse, setMotionPulse] = useState(0);
  const [houseModel, setHouseModel] = useState<LocalHouseModel | null>(null);
  const [showImportedModel, setShowImportedModel] = useState(false);
  const [modelImporting, setModelImporting] = useState(false);
  const [modelImportError, setModelImportError] = useState<string | null>(null);
  const [lidarScan, setLidarScan] = useState<HavenScanBundle | null>(null);
  const [showLidarScan, setShowLidarScan] = useState(false);
  const [scanSession, setScanSession] = useState<ScanSession | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [spatialRooms, setSpatialRooms] = useState<SpatialRoom[]>([]);
  const [deviceAnchors, setDeviceAnchors] = useState<DeviceAnchor[]>([]);
  const [commissioningMode, setCommissioningMode] = useState<CommissioningMode>({ kind: "idle" });
  const [commissioningOpen, setCommissioningOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [spatialStorageReady, setSpatialStorageReady] = useState(false);
  const modelImportRequest = useRef(0);
  const sidePanelRef = useRef<HTMLElement | null>(null);
  const [providerStatus, setProviderStatus] = useState<RuntimeProviderStatus>(
    usesLocalGateway ? "connecting" : "demo",
  );

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const scanId = url.searchParams.get("scan");
    if (!scanId) {
      if (usesLocalGateway) {
        loadLatestLidarScan().then((session) => {
          if (session?.status === "complete" && session.scan) {
            setScanSession(session);
            setLidarScan(session.scan);
            setShowLidarScan(true);
          }
        }).catch(() => undefined);
      }
      return;
    }
    let active = true;
    setScanLoading(true);
    loadLidarScanSession(scanId)
      .then((session) => {
        if (!active) return;
        setScanSession(session);
        if (session.status === "complete" && session.scan) {
          setLidarScan(session.scan);
          setShowLidarScan(true);
          setShowImportedModel(false);
          setActiveNav("Home");
          setToast(`${session.scan.rooms.length} rooms received from Haven Scanner`);
        } else {
          setScanError(session.status === "expired" ? "This scan link expired. Start a new scan." : "The phone is still finishing this scan.");
        }
      })
      .catch((error) => active && setScanError(error instanceof Error ? error.message : "The scan could not be loaded."))
      .finally(() => active && setScanLoading(false));
    url.searchParams.delete("scan");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (scanSession?.status !== "waiting") return;
    const timer = window.setInterval(() => {
      loadLidarScanSession(scanSession.id).then((session) => {
        setScanSession(session);
        if (session.status === "complete" && session.scan) {
          setLidarScan(session.scan);
          setShowLidarScan(true);
          setShowImportedModel(false);
          setScanError(null);
          setToast(`${session.scan.rooms.length} rooms received from Haven Scanner`);
        }
      }).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [scanSession?.id, scanSession?.status]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => () => releaseLocalHouseModel(houseModel), [houseModel]);
  useEffect(() => () => {
    modelImportRequest.current += 1;
  }, []);

  useEffect(() => {
    setCommissioningMode({ kind: "idle" });
    setCommissioningOpen(false);
    setNewRoomName("");
    if (!houseModel) {
      setSpatialRooms([]);
      setDeviceAnchors([]);
      setSpatialStorageReady(false);
      return;
    }
    let storedMap: string | null = null;
    try {
      storedMap = window.localStorage.getItem(createSpatialStorageKey(houseModel));
    } catch {
      // Continue with an in-memory map when tablet storage is unavailable.
    }
    const restored = readSpatialMap(storedMap);
    setSpatialRooms(restored.rooms);
    setDeviceAnchors(restored.anchors);
    setSpatialStorageReady(true);
  }, [houseModel]);

  useEffect(() => {
    if (!houseModel || !spatialStorageReady) return;
    try {
      window.localStorage.setItem(
        createSpatialStorageKey(houseModel),
        JSON.stringify({ schemaVersion: 1, rooms: spatialRooms, anchors: deviceAnchors }),
      );
    } catch {
      // Private browsing or tablet storage policy can disable persistence; setup still works for this session.
    }
  }, [houseModel, spatialStorageReady, spatialRooms, deviceAnchors]);

  useEffect(() => {
    if (!usesLocalGateway) return;
    let active = true;

    loadGatewaySnapshot()
      .then((snapshot) => {
        if (!active) return;
        setProviderStatus(snapshot.providerStatus);
        setDevices(() => snapshot.entities.reduce(
          (next, entity) => mergeGatewayEntity(next, entity),
          snapshot.providerStatus === "demo" ? demoDevices : [],
        ));
      })
      .catch(() => active && setProviderStatus("offline"));

    const unsubscribe = subscribeToGateway(
      (message) => {
        if (!active) return;
        if (message.type === "provider.status" && typeof message.status === "string") {
          setProviderStatus(message.status as RuntimeProviderStatus);
        }
        if (message.type === "state.patch" && message.entity) {
          setDevices((current) => mergeGatewayEntity(current, message.entity as GatewayEntity));
        }
        if (message.type === "security.alert") {
          const alert = message.alert as { entityId?: string } | undefined;
          if (alert?.entityId === "binary_sensor.front_door") {
            setSelectedId("front-door");
            setAlertActive(true);
          }
        }
        if (message.type === "motion.detected") {
          setMotionPulse((current) => current + 1);
        }
      },
      () => active && setProviderStatus("offline"),
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const mappedDevices = useMemo(() => devices.map((device) => {
    const anchor = deviceAnchors.find((candidate) => candidate.deviceId === device.id);
    const room = anchor ? spatialRooms.find((candidate) => candidate.id === anchor.roomId) : null;
    return room ? { ...device, room: room.name } : device;
  }), [devices, deviceAnchors, spatialRooms]);

  const selectedDevice = mappedDevices.find((device) => device.id === selectedId) ?? null;

  const displayedRooms = useMemo<RoomBrowserItem[]>(() => {
    if (!showImportedModel || !houseModel || spatialRooms.length === 0) {
      return roomSummary.map((room) => ({
        ...room,
        id: room.name.toLowerCase().split(" ")[0],
      }));
    }
    return spatialRooms.map((room) => {
      const roomDevices = mappedDevices.filter((device) => device.room === room.name);
      return {
        id: room.id,
        name: room.name,
        value: `${roomDevices.length} linked`,
        active: roomDevices.filter((device) => device.active).length,
      };
    });
  }, [showImportedModel, houseModel, spatialRooms, mappedDevices]);

  const filteredDevices = useMemo(() => {
    const kinds = filterKinds[filter];
    return mappedDevices.filter((device) => {
      const matchesFilter = !kinds || kinds.includes(device.kind);
      const text = `${device.name} ${device.room} ${device.state}`.toLowerCase();
      return matchesFilter && text.includes(query.trim().toLowerCase());
    });
  }, [mappedDevices, filter, query]);

  function chooseNavigation(id: NavId) {
    setCommissioningOpen(false);
    setCommissioningMode({ kind: "idle" });
    setActiveNav(id);
    setSelectedId(null);
    if (id === "Rooms") setBrowserMode("Rooms");
    if (id === "Home") {
      setBrowserMode("Devices");
      setFilter("All");
    }
    if (id === "Climate") {
      setBrowserMode("Devices");
      setFilter("Climate");
    }
    if (id === "Security") {
      setBrowserMode("Devices");
      setFilter("Security");
    }
    if (id !== "Home" && window.matchMedia("(max-width: 760px)").matches) {
      window.requestAnimationFrame(() => {
        const panel = sidePanelRef.current;
        if (!panel) return;
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        panel.focus({ preventScroll: true });
      });
    }
  }

  function chooseMode(mode: ModeId) {
    setActiveMode(mode);
    setToast(`${mode} mode is ready`);
  }

  function selectFromScene(id: string) {
    if (id === "home") {
      setSelectedId(null);
      return;
    }
    setSelectedId(id);
  }

  async function toggleDevice(id: string) {
    const previous = devices;
    const device = devices.find((item) => item.id === id);
    if (!device || !device.available) return;
    setDevices((current) =>
      current.map((device) => {
        if (device.id !== id) return device;
        if (device.kind === "light") {
          const nextActive = !device.active;
          return {
            ...device,
            active: nextActive,
            state: nextActive ? "On" : "Off",
            detail: nextActive ? "72% · warm" : "Off just now",
          };
        }
        if (device.kind === "shade") {
          const nextActive = !device.active;
          return {
            ...device,
            active: nextActive,
            state: nextActive ? "Open" : "Closed",
            detail: nextActive ? "100% open" : "0% open",
          };
        }
        return device;
      }),
    );
    if (usesLocalGateway) {
      const action =
        device.kind === "shade"
          ? device.active
            ? "close"
            : "open"
          : device.active
            ? "turnOff"
            : "turnOn";
      try {
        await sendGatewayAction(device.entityId, action);
      } catch (error) {
        setDevices(previous);
        const reason = error instanceof Error ? error.message.replaceAll("_", " ") : "command failed";
        setToast(`Could not update ${device.name}: ${reason}`);
      }
    }
  }

  function triggerDoorAlert() {
    setDevices((current) =>
      current.map((device) =>
        device.id === "front-door"
          ? { ...device, state: "Open", detail: "Opened just now", active: true }
          : device,
      ),
    );
    setSelectedId("front-door");
    setAlertActive(true);
  }

  function triggerMotionPreview() {
    setMotionPulse((current) => current + 1);
    setDevices((current) =>
      current.map((device) =>
        device.id === "entry-motion"
          ? { ...device, active: true, state: "Movement", detail: "Movement just detected" }
          : device,
      ),
    );
    window.setTimeout(() => {
      setDevices((current) =>
        current.map((device) =>
          device.id === "entry-motion"
            ? { ...device, active: false, state: "Clear", detail: "Movement a moment ago" }
            : device,
        ),
      );
    }, 2200);
  }

  async function importHouseModel(files: FileList | null) {
    if (!files?.length) return;
    const requestId = ++modelImportRequest.current;
    setModelImporting(true);
    setModelImportError(null);
    try {
      const result = await loadLocalHouseModel(files[0]);
      if (requestId !== modelImportRequest.current) {
        releaseLocalHouseModel(result.model);
        return;
      }
      setHouseModel(result.model);
      setShowImportedModel(true);
      setShowLidarScan(false);
      setSelectedId(null);
      setActiveNav("Home");
      setToast(result.warning ?? `${result.model.name} is ready in the 3D view`);
    } catch (error) {
      if (requestId !== modelImportRequest.current) return;
      const message = error instanceof Error ? error.message : "The model could not be opened.";
      setModelImportError(message);
      setToast(message);
    } finally {
      if (requestId === modelImportRequest.current) setModelImporting(false);
    }
  }

  async function startLidarScan() {
    if (!usesLocalGateway) {
      setScanError("LiDAR handoff needs the local Haven gateway.");
      setActiveNav("Settings");
      return;
    }
    setScanLoading(true);
    setScanError(null);
    try {
      const session = await createLidarScanSession();
      setScanSession(session);
      if (!session.deepLink) throw new Error("The scanner link was not created.");
      window.location.assign(session.deepLink);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The scanner could not be opened.";
      setScanError(message);
      setToast(message);
      setActiveNav("Settings");
    } finally {
      setScanLoading(false);
    }
  }

  function openCommissioning() {
    if (!houseModel) return;
    setShowImportedModel(true);
    setActiveNav("Settings");
    setSelectedId(null);
    setCommissioningMode({ kind: "idle" });
    setCommissioningOpen(true);
  }

  function toggleHouseModel() {
    if (showImportedModel) {
      setShowImportedModel(false);
      setCommissioningOpen(false);
      setCommissioningMode({ kind: "idle" });
      return;
    }
    setShowImportedModel(true);
    setShowLidarScan(false);
  }

  function startRoomDrawing() {
    const name = newRoomName.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (spatialRooms.some((room) => normalizeRoomName(room.name) === normalizeRoomName(name))) {
      setToast(`${name} is already mapped`);
      return;
    }
    setShowImportedModel(true);
    setCommissioningMode({ kind: "room", roomName: name, points: [] });
  }

  function undoRoomPoint() {
    setCommissioningMode((current) => current.kind === "room"
      ? { ...current, points: current.points.slice(0, -1) }
      : current);
  }

  function finishRoomDrawing() {
    if (commissioningMode.kind !== "room" || commissioningMode.points.length < 3) return;
    if (polygonAreaXZ(commissioningMode.points) < 0.12) {
      setToast("Those points are too close together. Outline the room corners again.");
      return;
    }
    const room: SpatialRoom = {
      id: `room-${createClientId()}`,
      name: commissioningMode.roomName,
      color: spatialRoomColors[spatialRooms.length % spatialRoomColors.length],
      points: commissioningMode.points,
    };
    setSpatialRooms((current) => [...current, room]);
    setCommissioningMode({ kind: "idle" });
    setNewRoomName("");
    setToast(`${room.name} mapped`);
  }

  function cancelCommissioningAction() {
    setCommissioningMode({ kind: "idle" });
  }

  function deleteSpatialRoom(roomId: string) {
    const room = spatialRooms.find((candidate) => candidate.id === roomId);
    setSpatialRooms((current) => current.filter((candidate) => candidate.id !== roomId));
    setDeviceAnchors((current) => current.map((anchor) => anchor.roomId === roomId ? { ...anchor, roomId: "" } : anchor));
    if (room) setToast(`${room.name} removed; device positions were kept`);
  }

  function startDevicePlacement(deviceId: string) {
    if (spatialRooms.length === 0) {
      setToast("Map at least one room before placing devices");
      return;
    }
    setShowImportedModel(true);
    setSelectedId(null);
    setCommissioningMode({ kind: "device", deviceId });
  }

  function removeDeviceAnchor(deviceId: string) {
    const device = mappedDevices.find((candidate) => candidate.id === deviceId);
    setDeviceAnchors((current) => current.filter((anchor) => anchor.deviceId !== deviceId));
    if (device) setToast(`${device.name} removed from the map`);
  }

  function handleCommissionPoint(point: Vec3) {
    if (commissioningMode.kind === "room") {
      const previous = commissioningMode.points.at(-1);
      if (previous && Math.hypot(point[0] - previous[0], point[2] - previous[2]) < 0.06) return;
      setCommissioningMode({ ...commissioningMode, points: [...commissioningMode.points, point] });
      return;
    }
    if (commissioningMode.kind !== "device") return;
    const room = findRoomForPosition(point, spatialRooms);
    const deviceId = commissioningMode.deviceId;
    setDeviceAnchors((current) => [
      ...current.filter((anchor) => anchor.deviceId !== deviceId),
      { deviceId, position: point, roomId: room?.id ?? "" },
    ]);
    setCommissioningMode({ kind: "idle" });
    setSelectedId(deviceId);
    const device = mappedDevices.find((candidate) => candidate.id === deviceId);
    setToast(`${device?.name ?? "Device"} placed${room ? ` in ${room.name}` : " outside a mapped room"}`);
  }

  function finishCommissioning() {
    setCommissioningMode({ kind: "idle" });
    setCommissioningOpen(false);
    setActiveNav("Home");
    setSelectedId(null);
    setToast("Map setup saved on this tablet");
  }

  function removeHouseModel() {
    setShowImportedModel(false);
    setCommissioningOpen(false);
    setCommissioningMode({ kind: "idle" });
    setHouseModel(null);
    setToast("Returned to the demo house");
  }

  function acknowledgeAlert() {
    setAlertActive(false);
    setToast("Front-door alert acknowledged");
  }

  function securePerimeter() {
    setDevices((current) =>
      current.map((device) =>
        device.id === "front-door"
          ? { ...device, state: "Locked", detail: "Closed · just now", active: false }
          : device,
      ),
    );
    setAlertActive(false);
    setSelectedId(null);
    setToast("Perimeter is secure");
  }

  return (
    <main className={`app-shell ${alertActive ? "is-alerting" : ""}`}>
      <aside className="nav-rail" aria-label="Primary navigation">
        <button className="brand-mark" aria-label="Haven home" onClick={() => chooseNavigation("Home")}>
          <span className="brand-roof" />
          <span className="brand-dot" />
        </button>

        <nav className="nav-items">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                className={`nav-item ${active ? "is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => chooseNavigation(item.id)}
              >
                <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
                <span>{item.id}</span>
              </button>
            );
          })}
        </nav>

        <div className="nav-bottom">
          <button
            className={`nav-item ${activeNav === "Settings" ? "is-active" : ""}`}
            onClick={() => chooseNavigation("Settings")}
          >
            <Settings size={21} strokeWidth={1.8} aria-hidden="true" />
            <span>Setup</span>
          </button>
          <button className="avatar-button" aria-label="Open household profile">
            AR
            <span className="presence-dot" />
          </button>
        </div>
      </aside>

      <section className="main-stage">
        <header className="home-header">
          <div>
            <p className="eyebrow">{formatDate(now)}</p>
            <h1>Good evening, Alex</h1>
          </div>
          <div className="header-status">
            <div className="weather-chip">
              <CloudSun size={20} aria-hidden="true" />
              <span><strong>74°</strong> Clear</span>
            </div>
            <div className={`connection-chip status-${providerStatus}`} title="Local automation connection">
              <span className="status-beacon" />
              <span>
                <strong>
                  {providerStatus === "demo"
                    ? "Demo home"
                    : providerStatus === "online"
                      ? "Home connected"
                      : providerStatus === "connecting"
                        ? "Connecting home"
                        : providerStatus === "stale"
                          ? "Sync delayed"
                          : "Home offline"}
                </strong>
                {providerStatus === "demo"
                  ? "Local preview"
                  : providerStatus === "online"
                    ? "Home Assistant"
                    : providerStatus === "connecting"
                      ? "Local gateway"
                      : "Check gateway"}
              </span>
            </div>
            <time className="header-time" dateTime={now?.toISOString()}>{formatTime(now)}</time>
          </div>
        </header>

        {alertActive && (
          <div className="security-banner" role="alert" aria-live="assertive">
            <div className="security-banner-icon"><ShieldAlert size={22} /></div>
            <div>
              <strong>Front door opened</strong>
              <span>Entry · detected just now</span>
            </div>
            <button onClick={() => setSelectedId("front-door")}>Return to alert</button>
          </div>
        )}

        <section className="house-card" aria-label="Interactive 3D home">
          <div className="scene-topbar">
            <div>
              <span className="scene-kicker">{showLidarScan && lidarScan ? "RoomPlan LiDAR scan" : showImportedModel && houseModel ? houseModel.name : "Oakwood House"}</span>
              <h2>{showLidarScan && lidarScan ? `${lidarScan.rooms.length} detected rooms` : showImportedModel && houseModel ? "Imported scan" : selectedDevice ? selectedDevice.room : selectedId ? "Room focus" : "Whole home"}</h2>
            </div>
            <div className="scene-actions">
              <button className="scene-action scan-home-action" onClick={startLidarScan} disabled={scanLoading}>
                <ScanLine size={18} />
                <span>{scanLoading ? "Opening…" : "Scan home"}</span>
              </button>
              {lidarScan && (
                <button className={`scene-action ${showLidarScan ? "is-active" : ""}`} onClick={() => {
                  setShowLidarScan((current) => !current);
                  setShowImportedModel(false);
                }}>
                  <Layers3 size={18} />
                  <span>{showLidarScan ? "Demo" : "LiDAR"}</span>
                </button>
              )}
              {houseModel && (
                <button className="scene-action" onClick={toggleHouseModel}>
                  <House size={18} />
                  <span>{showImportedModel ? "Demo" : "My scan"}</span>
                </button>
              )}
              {showImportedModel && houseModel && (
                <button className={`scene-action ${commissioningOpen ? "is-active" : ""}`} onClick={openCommissioning}>
                  <MapPin size={18} />
                  <span>Map</span>
                </button>
              )}
              <button className="scene-action" onClick={() => setSelectedId(null)} aria-label="Reset 3D view">
                <RotateCcw size={18} />
                <span>Overview</span>
              </button>
              <button className="scene-action" aria-label="Choose a floor">
                <Layers3 size={18} />
                <span>Ground</span>
              </button>
              <button className="icon-button" aria-label="More house options">
                <MoreHorizontal size={20} />
              </button>
            </div>
          </div>

          <div className={`scene-viewport ${showImportedModel || showLidarScan ? "has-imported-model" : ""}`}>
            <HouseScene
              selectedId={selectedId}
              alertActive={alertActive}
              motionPulse={motionPulse}
              importedModel={showImportedModel ? houseModel : null}
              lidarScan={showLidarScan ? lidarScan : null}
              devices={mappedDevices}
              rooms={spatialRooms}
              deviceAnchors={deviceAnchors}
              commissioning={commissioningMode}
              onCommissionPoint={handleCommissionPoint}
              onSelect={selectFromScene}
            />
            <div className="scene-hint">
              <CircleDot size={15} aria-hidden="true" />
              Tap a room or device · drag to orbit · pinch to zoom
            </div>
            {showImportedModel && houseModel && (
              <div className="imported-model-note" role="status">
                <MapPin size={15} />
                <span>
                  {commissioningMode.kind === "room"
                    ? `Tap room corners · ${commissioningMode.points.length} points`
                    : commissioningMode.kind === "device"
                      ? "Tap the exact device location"
                      : `${spatialRooms.length} rooms · ${deviceAnchors.length} devices placed`}
                </span>
                {!commissioningOpen && <button onClick={openCommissioning}>Set up map</button>}
              </div>
            )}
            {showLidarScan && lidarScan && (
              <div className="scan-scene-note" role="status">
                <ScanLine size={15} />
                <span>{countScanElements(lidarScan)} surfaces &amp; objects · {smartObjectSuggestions(lidarScan).length} smart candidates</span>
              </div>
            )}
            <div className="home-vitals" aria-label="Whole-home summary">
              <div><span>Indoor</span><strong>72°</strong></div>
              <i />
              <div><span>Air</span><strong>Excellent</strong></div>
              <i />
              <div><span>Active</span><strong>{mappedDevices.filter((device) => device.active).length} devices</strong></div>
            </div>
          </div>

          <div className="mode-dock" aria-label="Household modes">
            {modes.map((mode) => {
              const Icon = mode.icon;
              const active = activeMode === mode.id;
              return (
                <button
                  key={mode.id}
                  className={`mode-button ${active ? "is-active" : ""}`}
                  onClick={() => chooseMode(mode.id)}
                  title={mode.note}
                  aria-pressed={active}
                >
                  <Icon size={18} />
                  <span>{mode.id}</span>
                </button>
              );
            })}
          </div>
        </section>
      </section>

      <aside
        ref={sidePanelRef}
        className={`side-panel ${alertActive ? "incident-mode" : ""}`}
        aria-label="Home controls"
        tabIndex={-1}
      >
        {alertActive ? (
          <IncidentPanel
            onAcknowledge={acknowledgeAlert}
            onSecure={securePerimeter}
            onClose={() => setAlertActive(false)}
          />
        ) : commissioningOpen && houseModel ? (
          <CommissioningPanel
            rooms={spatialRooms}
            anchors={deviceAnchors}
            devices={mappedDevices}
            mode={commissioningMode}
            newRoomName={newRoomName}
            onNewRoomName={setNewRoomName}
            onStartRoom={startRoomDrawing}
            onUndoRoomPoint={undoRoomPoint}
            onFinishRoom={finishRoomDrawing}
            onCancel={cancelCommissioningAction}
            onDeleteRoom={deleteSpatialRoom}
            onStartDevice={startDevicePlacement}
            onRemoveAnchor={removeDeviceAnchor}
            onDone={finishCommissioning}
          />
        ) : selectedDevice ? (
          <DeviceInspector
            device={selectedDevice}
            targetTemp={targetTemp}
            onTargetTemp={setTargetTemp}
            onBack={() => setSelectedId(null)}
            onToggle={() => toggleDevice(selectedDevice.id)}
          />
        ) : activeNav === "Energy" ? (
          <EnergyPanel />
        ) : activeNav === "Settings" ? (
          <SetupPanel
            providerStatus={providerStatus}
            houseModel={houseModel}
            showImportedModel={showImportedModel}
            modelImporting={modelImporting}
            modelImportError={modelImportError}
            onImportModel={importHouseModel}
            onShowModel={setShowImportedModel}
            onRemoveModel={removeHouseModel}
            roomCount={spatialRooms.length}
            anchorCount={deviceAnchors.length}
            onStartCommissioning={openCommissioning}
            lidarScan={lidarScan}
            showLidarScan={showLidarScan}
            scanSession={scanSession}
            scanLoading={scanLoading}
            scanError={scanError}
            onStartScan={startLidarScan}
            onShowLidarScan={setShowLidarScan}
          />
        ) : (
          <DeviceBrowser
            devices={filteredDevices}
            rooms={displayedRooms}
            browserMode={browserMode}
            filter={filter}
            query={query}
            activeNav={activeNav}
            onBrowserMode={setBrowserMode}
            onFilter={setFilter}
            onQuery={setQuery}
            onSelect={(device) => setSelectedId(device.id)}
            onSelectRoom={(room) => setSelectedId(room.id)}
            onToggle={toggleDevice}
            onTriggerAlert={triggerDoorAlert}
            onTriggerMotion={triggerMotionPreview}
          />
        )}
      </aside>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {mobileNavigation.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={activeNav === item.id ? "is-active" : ""}
              aria-current={activeNav === item.id ? "page" : undefined}
              onClick={() => chooseNavigation(item.id)}
            >
              <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </main>
  );
}

function DeviceBrowser({
  devices,
  rooms,
  browserMode,
  filter,
  query,
  activeNav,
  onBrowserMode,
  onFilter,
  onQuery,
  onSelect,
  onSelectRoom,
  onToggle,
  onTriggerAlert,
  onTriggerMotion,
}: {
  devices: HomeDevice[];
  rooms: RoomBrowserItem[];
  browserMode: "Devices" | "Rooms";
  filter: DeviceFilter;
  query: string;
  activeNav: NavId;
  onBrowserMode: (mode: "Devices" | "Rooms") => void;
  onFilter: (filter: DeviceFilter) => void;
  onQuery: (query: string) => void;
  onSelect: (device: HomeDevice) => void;
  onSelectRoom: (room: RoomBrowserItem) => void;
  onToggle: (id: string) => void;
  onTriggerAlert: () => void;
  onTriggerMotion: () => void;
}) {
  return (
    <>
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">{activeNav === "Security" ? "Perimeter secure" : "At a glance"}</span>
          <h2>{activeNav === "Security" ? "Security" : "Your home"}</h2>
        </div>
        <button className="icon-button" aria-label="Open notifications">
          <BellRing size={19} />
          <span className="notification-dot" />
        </button>
      </div>

      {activeNav === "Security" && (
        <div className="secure-summary">
          <ShieldCheck size={25} />
          <div><strong>All secure</strong><span>8 openings · 3 cameras</span></div>
          <span className="secure-check"><Check size={14} /></span>
        </div>
      )}

      <div className="segmented-control" role="tablist" aria-label="Browse home">
        {["Devices", "Rooms"].map((mode) => (
          <button
            key={mode}
            role="tab"
            aria-selected={browserMode === mode}
            className={browserMode === mode ? "is-active" : ""}
            onClick={() => onBrowserMode(mode as "Devices" | "Rooms")}
          >
            {mode}
          </button>
        ))}
      </div>

      <label className="search-field">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">Search devices and rooms</span>
        <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search your home" />
        {query && <button onClick={() => onQuery("")} aria-label="Clear search"><X size={16} /></button>}
      </label>

      {browserMode === "Devices" ? (
        <>
          <div className="filter-row" aria-label="Device filters">
            {(["All", "Lights", "Climate", "Security"] as DeviceFilter[]).map((item) => (
              <button key={item} className={filter === item ? "is-active" : ""} onClick={() => onFilter(item)}>{item}</button>
            ))}
          </div>
          <div className="device-list">
            {devices.map((device) => (
              <div className="device-row" key={device.id}>
                <button className="device-select" onClick={() => onSelect(device)}>
                  <span className={`device-icon kind-${device.kind} ${device.active ? "is-active" : ""}`}>
                    <DeviceGlyph kind={device.kind} />
                  </span>
                  <span className="device-copy">
                    <strong>{device.name}</strong>
                    <small>{device.room} · {device.detail}</small>
                  </span>
                </button>
                {(device.kind === "light" || device.kind === "shade") ? (
                  <button
                    className={`quick-toggle ${device.active ? "is-on" : ""}`}
                    onClick={() => onToggle(device.id)}
                    aria-label={`${device.active ? "Turn off" : "Turn on"} ${device.name}`}
                    aria-pressed={device.active}
                  >
                    <span />
                  </button>
                ) : (
                  <button className="row-state" onClick={() => onSelect(device)}>
                    {device.state}<ChevronRight size={15} />
                  </button>
                )}
              </div>
            ))}
            {devices.length === 0 && <div className="empty-state">No matching devices</div>}
          </div>
        </>
      ) : (
        <div className="room-list">
          {rooms.map((room, index) => (
            <button key={room.id} onClick={() => onSelectRoom(room)}>
              <span className="room-orb" style={{ "--room-index": index } as React.CSSProperties}><Armchair size={19} /></span>
              <span><strong>{room.name}</strong><small>{room.active ? `${room.active} active` : "Quiet"}</small></span>
              <b>{room.value}</b>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      )}

      <button className="demo-alert-button" onClick={onTriggerAlert}>
        <AlertTriangle size={18} />
        <span><strong>Preview security response</strong><small>Simulate front door opening</small></span>
        <ChevronRight size={16} />
      </button>
      <button className="demo-motion-button" onClick={onTriggerMotion}>
        <ScanLine size={18} />
        <span><strong>Preview quiet movement</strong><small>No zoom or interruption</small></span>
        <ChevronRight size={16} />
      </button>
    </>
  );
}

function DeviceInspector({
  device,
  targetTemp,
  onTargetTemp,
  onBack,
  onToggle,
}: {
  device: HomeDevice;
  targetTemp: number;
  onTargetTemp: (value: number) => void;
  onBack: () => void;
  onToggle: () => void;
}) {
  const controllable = device.kind === "light" || device.kind === "shade";
  return (
    <div className="inspector">
      <button className="back-button" onClick={onBack}><ChevronLeft size={18} /> All devices</button>
      <div className="inspector-hero">
        <span className={`device-icon kind-${device.kind} is-active`}><DeviceGlyph kind={device.kind} size={25} /></span>
        <span className="availability"><i /> Available</span>
        <h2>{device.name}</h2>
        <p>{device.room} · Connected locally</p>
      </div>

      {device.kind === "climate" ? (
        <div className="thermostat-control">
          <span>Target temperature</span>
          <div className="temperature-stepper">
            <button onClick={() => onTargetTemp(Math.max(60, targetTemp - 1))} aria-label="Lower temperature"><Minus /></button>
            <strong>{targetTemp}<sup>°</sup></strong>
            <button onClick={() => onTargetTemp(Math.min(82, targetTemp + 1))} aria-label="Raise temperature"><Plus /></button>
          </div>
          <div className="climate-status"><Wind size={18} /><span>Heating gently · 34% output</span></div>
        </div>
      ) : device.kind === "camera" ? (
        <div className="camera-preview compact">
          <div className="camera-sky" />
          <div className="camera-ground" />
          <div className="camera-door" />
          <span className="live-badge"><i /> LIVE</span>
          <button><Eye size={17} /> Open live view</button>
        </div>
      ) : device.kind === "motion" || device.kind === "sensor" ? (
        <div className={`sensor-control ${device.active ? "is-active" : ""}`}>
          <span className="sensor-visual">
            {device.kind === "motion" ? <ScanLine size={30} /> : <Wind size={30} />}
          </span>
          <div>
            <strong>{device.state}</strong>
            <span>{device.detail}</span>
          </div>
          <small>{device.kind === "motion" ? "Ambient events never move the camera" : "Read-only environmental sensor"}</small>
        </div>
      ) : device.kind === "lock" ? (
        <div className="lock-control">
          <div className="lock-ring"><LockKeyhole size={34} /><span>{device.state}</span></div>
          <button className="primary-action"><LockKeyhole size={18} /> Lock door</button>
        </div>
      ) : (
        <div className="power-control">
          <button className={device.active ? "is-on" : ""} onClick={onToggle} aria-pressed={device.active}>
            <Power size={29} />
          </button>
          <div><strong>{device.state}</strong><span>{device.detail}</span></div>
        </div>
      )}

      {device.kind === "light" && (
        <div className="slider-card">
          <div><span>Brightness</span><strong>72%</strong></div>
          <input type="range" min="1" max="100" defaultValue="72" aria-label="Brightness" />
          <div className="light-presets">
            {["#ffcc88", "#ffe4bc", "#f7f3e8", "#b9d8ff"].map((color, index) => (
              <button key={color} style={{ background: color }} aria-label={`Light temperature preset ${index + 1}`} />
            ))}
          </div>
        </div>
      )}

      <div className="inspector-info">
        <div><span>Last changed</span><strong>2 minutes ago</strong></div>
        <div><span>Connection</span><strong>Excellent</strong></div>
        <div><span>Automation</span><strong>Evening comfort</strong></div>
      </div>
      {controllable && <button className="secondary-action" onClick={onToggle}>Toggle {device.name.toLowerCase()}</button>}
    </div>
  );
}

function IncidentPanel({ onAcknowledge, onSecure, onClose }: { onAcknowledge: () => void; onSecure: () => void; onClose: () => void }) {
  return (
    <div className="incident-panel">
      <div className="incident-header">
        <span className="danger-icon"><ShieldAlert size={22} /></span>
        <div><span>Security event</span><h2>Front door opened</h2></div>
        <button onClick={onClose} aria-label="Close incident panel"><X size={19} /></button>
      </div>
      <div className="incident-meta">
        <span><Radio size={15} /> Entry contact sensor</span>
        <time>Just now</time>
      </div>
      <div className="camera-preview">
        <div className="camera-sky" />
        <div className="camera-ground" />
        <div className="camera-wall" />
        <div className="camera-door open" />
        <span className="live-badge"><i /> LIVE · ENTRY</span>
        <button><Eye size={17} /> View camera</button>
      </div>
      <div className="incident-message">
        <AlertTriangle size={19} />
        <p>The entry opened while the home was in <strong>Home mode</strong>. No familiar arrival was detected.</p>
      </div>
      <button className="danger-action" onClick={onSecure}><LockKeyhole size={18} /> Secure perimeter</button>
      <button className="acknowledge-action" onClick={onAcknowledge}><Check size={18} /> Acknowledge alert</button>
      <div className="incident-timeline">
        <h3>Recent activity</h3>
        <div><i className="danger" /><span><strong>Door opened</strong><small>Entry · just now</small></span></div>
        <div><i /><span><strong>Motion detected</strong><small>Entry · 1 min ago</small></span></div>
        <div><i /><span><strong>Door locked</strong><small>Entry · 9:34 PM</small></span></div>
      </div>
    </div>
  );
}

function EnergyPanel() {
  return (
    <div className="feature-panel">
      <div className="panel-heading"><div><span className="panel-kicker">Live flow</span><h2>Energy</h2></div><span className="feature-icon"><Zap size={20} /></span></div>
      <div className="energy-hero"><span>Using now</span><strong>2.4 <small>kW</small></strong><em>18% below usual</em></div>
      <div className="energy-flow">
        <div><span className="energy-node solar"><Sparkles size={20} /></span><p><strong>3.8 kW</strong><small>Solar</small></p></div>
        <span className="flow-line"><i /></span>
        <div><span className="energy-node home"><House size={20} /></span><p><strong>2.4 kW</strong><small>Home</small></p></div>
        <span className="flow-line reverse"><i /></span>
        <div><span className="energy-node grid"><Zap size={20} /></span><p><strong>1.4 kW</strong><small>To grid</small></p></div>
      </div>
      <div className="metric-grid"><div><span>Today</span><strong>18.6 kWh</strong><small>−12% vs yesterday</small></div><div><span>Solar</span><strong>24.1 kWh</strong><small>76% self-powered</small></div></div>
      <div className="mini-chart" aria-label="Energy use over the day">{[28, 35, 31, 42, 54, 48, 68, 78, 64, 52, 46, 58].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
      <button className="secondary-action">Open energy details <ChevronRight size={17} /></button>
    </div>
  );
}

function SetupPanel({
  providerStatus,
  houseModel,
  showImportedModel,
  modelImporting,
  modelImportError,
  onImportModel,
  onShowModel,
  onRemoveModel,
  roomCount,
  anchorCount,
  onStartCommissioning,
  lidarScan,
  showLidarScan,
  scanSession,
  scanLoading,
  scanError,
  onStartScan,
  onShowLidarScan,
}: {
  providerStatus: RuntimeProviderStatus;
  houseModel: LocalHouseModel | null;
  showImportedModel: boolean;
  modelImporting: boolean;
  modelImportError: string | null;
  onImportModel: (files: FileList | null) => void;
  onShowModel: (show: boolean) => void;
  onRemoveModel: () => void;
  roomCount: number;
  anchorCount: number;
  onStartCommissioning: () => void;
  lidarScan: HavenScanBundle | null;
  showLidarScan: boolean;
  scanSession: ScanSession | null;
  scanLoading: boolean;
  scanError: string | null;
  onStartScan: () => void;
  onShowLidarScan: (show: boolean) => void;
}) {
  const live = providerStatus === "online";
  const suggestions = lidarScan ? smartObjectSuggestions(lidarScan) : [];
  return (
    <div className="feature-panel setup-panel">
      <div className="panel-heading"><div><span className="panel-kicker">Local-first</span><h2>System setup</h2></div><span className="feature-icon"><Settings size={20} /></span></div>
      <div className="gateway-card">
        <span className="gateway-visual"><Wifi size={26} /></span>
        <div><strong>Haven gateway</strong><small>{live ? "Home Assistant · local server" : providerStatus === "demo" ? "Demo provider · this tablet" : "Waiting for local server"}</small></div>
        <span className={`demo-pill ${live ? "is-live" : ""}`}>{live ? "LIVE" : providerStatus.toUpperCase()}</span>
      </div>

      <section className="lidar-scan-section" aria-labelledby="lidar-scan-title">
        <div className="lidar-scan-heading">
          <span className="lidar-scan-icon"><ScanLine size={21} /></span>
          <div><span>iPhone &amp; iPad Pro</span><h3 id="lidar-scan-title">Scan with LiDAR</h3></div>
          <span className="local-only-pill">ROOMPLAN</span>
        </div>
        <p>Open the focused Haven Scanner app, see every wall and object appear live, then return here automatically.</p>
        {lidarScan ? (
          <div className="scan-result-card">
            <div className="scan-result-metrics">
              <div><strong>{lidarScan.rooms.length}</strong><span>rooms</span></div>
              <div><strong>{countScanElements(lidarScan)}</strong><span>detections</span></div>
              <div><strong>{suggestions.length}</strong><span>smart candidates</span></div>
            </div>
            {suggestions.length > 0 && (
              <div className="smart-candidate-list" aria-label="Detected smart object candidates">
                {suggestions.slice(0, 4).map((suggestion) => (
                  <span key={suggestion.category}><Sparkles size={12} /> {suggestion.label} · {suggestion.count}</span>
                ))}
              </div>
            )}
            <div className="scan-result-actions">
              <button onClick={() => onShowLidarScan(!showLidarScan)}>{showLidarScan ? "Show demo" : "View floor plan"}</button>
              <button className="is-primary" onClick={onStartScan}>Scan again</button>
            </div>
          </div>
        ) : (
          <button type="button" className="lidar-scan-button" onClick={onStartScan} disabled={scanLoading}>
            <span><ScanLine size={20} /></span>
            <span><strong>{scanLoading ? "Preparing scanner…" : "Start LiDAR scan"}</strong><small>Opens Haven Scanner on this device</small></span>
            <ChevronRight size={18} />
          </button>
        )}
        {scanSession?.status === "waiting" && <p className="scan-status-note" role="status"><span /> Waiting for the phone to finish and upload…</p>}
        {scanError && <p className="model-import-error" role="alert">{scanError}</p>}
      </section>

      <section className="model-import-section" aria-labelledby="model-import-title">
        <div className="model-import-heading">
          <div><span>Quick scan test</span><h3 id="model-import-title">My 3D house</h3></div>
          <span className="local-only-pill">LOCAL</span>
        </div>
        {modelImporting ? (
          <div className="model-import-zone is-loading" role="status" aria-live="polite">
            <span className="model-import-spinner" />
            <strong>Preparing 3D scene</strong>
            <small>Validating, measuring, and centering the GLB locally</small>
          </div>
        ) : houseModel ? (
          <div className="imported-model-card">
            <span className="imported-model-icon"><House size={22} /></span>
            <div>
              <strong>{houseModel.name}</strong>
              <small>{formatModelSize(houseModel.totalBytes)} · {formatTriangleCount(houseModel.triangleCount)}</small>
            </div>
            <button onClick={() => onShowModel(!showImportedModel)}>{showImportedModel ? "Demo" : "View"}</button>
            <button className="remove-model" onClick={onRemoveModel} aria-label="Remove imported house model"><X size={16} /></button>
          </div>
        ) : (
          <label className="model-import-zone">
            <input
              type="file"
              accept=".glb,model/gltf-binary,application/octet-stream"
              onChange={(event) => {
                onImportModel(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
            <span><Upload size={22} /></span>
            <strong>Choose a house GLB</strong>
            <small>Single-file model · recommended below 25 MB</small>
          </label>
        )}
        {modelImportError && <p className="model-import-error" role="alert">{modelImportError}</p>}
        <p>Export from Polycam with Y-up. The scan is centered and scaled in your browser and is not uploaded to a cloud service.</p>
        {houseModel && (
          <button type="button" className="commissioning-launch-button" onClick={onStartCommissioning}>
            <span><MapPin size={18} /></span>
            <span><strong>Map rooms &amp; devices</strong><small>{roomCount} rooms · {anchorCount} devices placed</small></span>
            <ChevronRight size={17} />
          </button>
        )}
      </section>

      <div className="setup-steps">
        <div className="is-complete"><span><Check size={15} /></span><p><strong>Interface ready</strong><small>Tablet layout and spatial controls</small></p></div>
        <div className={live ? "is-complete" : ""}><span>{live ? <Check size={15} /> : 2}</span><p><strong>Connect Home Assistant</strong><small>Credential stays inside the gateway</small></p></div>
        <div className={lidarScan || houseModel ? "is-complete" : ""}><span>{lidarScan || houseModel ? <Check size={15} /> : 3}</span><p><strong>Capture the floor plan</strong><small>{lidarScan ? `${lidarScan.rooms.length} rooms from LiDAR` : "RoomPlan scan or Polycam GLB"}</small></p></div>
        <div className={anchorCount > 0 ? "is-complete" : ""}><span>{anchorCount > 0 ? <Check size={15} /> : 4}</span><p><strong>Map rooms &amp; devices</strong><small>{roomCount ? `${roomCount} rooms · ${anchorCount} placed` : "Draw boundaries, then tap exact device locations"}</small></p></div>
      </div>
      <a className="primary-action" href="http://homeassistant.local:8123" target="_blank" rel="noreferrer"><Radio size={18} /> {live ? "Open Home Assistant" : "Start Home Assistant setup"}</a>
      <p className="privacy-note"><ShieldCheck size={16} /> Home data stays on the local Linux server. Tablets receive a secure session, never the Home Assistant token.</p>
    </div>
  );
}
