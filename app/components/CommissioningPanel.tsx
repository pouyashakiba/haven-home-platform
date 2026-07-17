"use client";

import {
  Blinds,
  Camera,
  Check,
  ChevronRight,
  CircleDot,
  DoorClosed,
  Lightbulb,
  Map,
  MapPin,
  Plus,
  Radio,
  Speaker,
  ToggleLeft,
  RotateCcw,
  ShieldCheck,
  Thermometer,
  Trash2,
  Undo2,
  Wind,
  X,
} from "lucide-react";
import type { HomeDevice } from "../lib/home-data";
import type { DeviceAnchor, SpatialRoom, Vec3 } from "../lib/spatial-config";

export type CommissioningMode =
  | { kind: "idle" }
  | { kind: "room"; roomName: string; points: Vec3[] }
  | { kind: "device"; deviceId: string };

type CommissioningPanelProps = {
  rooms: SpatialRoom[];
  anchors: DeviceAnchor[];
  devices: HomeDevice[];
  mode: CommissioningMode;
  newRoomName: string;
  onNewRoomName: (name: string) => void;
  onStartRoom: () => void;
  onUndoRoomPoint: () => void;
  onFinishRoom: () => void;
  onCancel: () => void;
  onDeleteRoom: (roomId: string) => void;
  onStartDevice: (deviceId: string) => void;
  onRemoveAnchor: (deviceId: string) => void;
  onDone: () => void;
};

function DeviceIcon({ device }: { device: HomeDevice }) {
  const Icon =
    device.kind === "light"
      ? Lightbulb
      : device.kind === "camera"
        ? Camera
        : device.kind === "climate"
          ? Thermometer
          : device.kind === "lock"
            ? DoorClosed
            : device.kind === "motion"
              ? Radio
              : device.kind === "shade"
                ? Blinds
                : device.kind === "media"
                  ? Speaker
                  : device.kind === "switch"
                    ? ToggleLeft
                    : device.kind === "keypad"
                      ? ShieldCheck
                      : Wind;

  return <Icon size={19} strokeWidth={1.8} aria-hidden="true" />;
}

export function CommissioningPanel({
  rooms,
  anchors,
  devices,
  mode,
  newRoomName,
  onNewRoomName,
  onStartRoom,
  onUndoRoomPoint,
  onFinishRoom,
  onCancel,
  onDeleteRoom,
  onStartDevice,
  onRemoveAnchor,
  onDone,
}: CommissioningPanelProps) {
  const isIdle = mode.kind === "idle";
  const activeDevice =
    mode.kind === "device"
      ? devices.find((device) => device.id === mode.deviceId) ?? null
      : null;
  const placedDeviceIds = new Set(anchors.map((anchor) => anchor.deviceId));
  const canStartRoom = isIdle && newRoomName.trim().length > 0;
  const canFinishRoom = mode.kind === "room" && mode.points.length >= 3;

  return (
    <div className="commissioning-panel">
      <header className="commissioning-header">
        <span className="commissioning-header-icon">
          <Map size={21} aria-hidden="true" />
        </span>
        <div>
          <span className="commissioning-kicker">Installer workspace</span>
          <h2>Map setup</h2>
        </div>
        <span className="commissioning-mode-pill">SETUP</span>
      </header>

      <p className="commissioning-intro">
        Outline each room, then place every device at its real location in the 3D scan.
      </p>

      <section className="commissioning-section" aria-labelledby="commissioning-rooms-title">
        <div className="commissioning-section-heading">
          <div>
            <span>Step 1</span>
            <h3 id="commissioning-rooms-title">Rooms</h3>
          </div>
          <strong>{rooms.length}</strong>
        </div>

        {mode.kind === "room" ? (
          <div className="commissioning-active-card" aria-live="polite">
            <div className="commissioning-active-title">
              <span className="commissioning-pulse">
                <MapPin size={19} aria-hidden="true" />
              </span>
              <div>
                <small>Drawing room</small>
                <strong>{mode.roomName}</strong>
              </div>
              <span className="commissioning-point-count">
                {mode.points.length} {mode.points.length === 1 ? "point" : "points"}
              </span>
            </div>
            <p>Tap the room corners in order on the 3D model. Use at least three points.</p>
            <div className="commissioning-progress" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <i key={index} className={mode.points.length > index ? "is-complete" : ""} />
              ))}
            </div>
            <div className="commissioning-action-row">
              <button
                type="button"
                className="commissioning-quiet-button"
                onClick={onUndoRoomPoint}
                disabled={mode.points.length === 0}
              >
                <Undo2 size={17} aria-hidden="true" />
                Undo
              </button>
              <button
                type="button"
                className="commissioning-finish-button"
                onClick={onFinishRoom}
                disabled={!canFinishRoom}
              >
                <Check size={17} aria-hidden="true" />
                Finish room
              </button>
              <button
                type="button"
                className="commissioning-icon-button"
                onClick={onCancel}
                aria-label={`Cancel drawing ${mode.roomName}`}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {!canFinishRoom && (
              <small className="commissioning-helper" role="status">
                Add {3 - mode.points.length} more {3 - mode.points.length === 1 ? "point" : "points"} to finish.
              </small>
            )}
          </div>
        ) : (
          <div className="commissioning-room-form">
            <label htmlFor="commissioning-room-name">Room name</label>
            <div>
              <input
                id="commissioning-room-name"
                type="text"
                value={newRoomName}
                onChange={(event) => onNewRoomName(event.target.value)}
                placeholder="Example: Living room"
                autoComplete="off"
                disabled={!isIdle}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canStartRoom) onStartRoom();
                }}
              />
              <button type="button" onClick={onStartRoom} disabled={!canStartRoom}>
                <Plus size={18} aria-hidden="true" />
                Draw
              </button>
            </div>
            {!isIdle && <small>Finish or cancel the active placement first.</small>}
          </div>
        )}

        {rooms.length > 0 ? (
          <div className="commissioning-room-list" aria-label="Mapped rooms">
            {rooms.map((room) => (
              <div key={room.id} className="commissioning-room-row">
                <span
                  className="commissioning-room-swatch"
                  style={{ backgroundColor: room.color }}
                  aria-hidden="true"
                />
                <span>
                  <strong>{room.name}</strong>
                  <small>{room.points.length} boundary points</small>
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteRoom(room.id)}
                  disabled={!isIdle}
                  aria-label={`Delete ${room.name}`}
                >
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="commissioning-empty-state">
            <CircleDot size={18} aria-hidden="true" />
            <span><strong>No rooms mapped</strong><small>Name a room and draw its outline.</small></span>
          </div>
        )}
      </section>

      <section className="commissioning-section" aria-labelledby="commissioning-devices-title">
        <div className="commissioning-section-heading">
          <div>
            <span>Step 2</span>
            <h3 id="commissioning-devices-title">Devices</h3>
          </div>
          <strong>{anchors.length}/{devices.length}</strong>
        </div>

        {activeDevice && (
          <div className="commissioning-device-instruction" role="status" aria-live="polite">
            <span className="commissioning-pulse">
              <MapPin size={19} aria-hidden="true" />
            </span>
            <div>
              <small>{placedDeviceIds.has(activeDevice.id) ? "Repositioning" : "Placing"}</small>
              <strong>{activeDevice.name}</strong>
              <p>Tap its exact location on the 3D model.</p>
            </div>
            <button type="button" onClick={onCancel} aria-label={`Cancel placing ${activeDevice.name}`}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="commissioning-device-list" aria-label="Devices to place">
          {devices.map((device) => {
            const anchor = anchors.find((candidate) => candidate.deviceId === device.id);
            const room = anchor ? rooms.find((candidate) => candidate.id === anchor.roomId) : null;
            const active = mode.kind === "device" && mode.deviceId === device.id;
            const placementLocked = mode.kind !== "idle" && !active;

            return (
              <div className={`commissioning-device-row ${active ? "is-active" : ""}`} key={device.id}>
                <span className={`commissioning-device-icon kind-${device.kind}`}>
                  <DeviceIcon device={device} />
                </span>
                <span className="commissioning-device-copy">
                  <strong>{device.name}</strong>
                  <small>
                    {anchor ? `Placed${room ? ` in ${room.name}` : ""}` : `${device.room} · Not placed`}
                  </small>
                </span>
                <button
                  type="button"
                  className="commissioning-place-button"
                  onClick={() => onStartDevice(device.id)}
                  disabled={placementLocked || active}
                  aria-label={`${anchor ? "Reposition" : "Place"} ${device.name}`}
                >
                  {active ? "Tap map" : anchor ? "Reposition" : "Place"}
                  {!active && <ChevronRight size={15} aria-hidden="true" />}
                </button>
                {anchor && (
                  <button
                    type="button"
                    className="commissioning-remove-anchor"
                    onClick={() => onRemoveAnchor(device.id)}
                    disabled={!isIdle}
                    aria-label={`Remove ${device.name} from the map`}
                  >
                    <RotateCcw size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="commissioning-footer">
        <div className="commissioning-local-note">
          <ShieldCheck size={17} aria-hidden="true" />
          <p><strong>Saved on this tablet</strong><span>Re-import the same GLB to restore this map. Server-wide tablet sync comes next.</span></p>
        </div>
        <button type="button" className="commissioning-done-button" onClick={onDone} disabled={!isIdle}>
          <Check size={18} aria-hidden="true" />
          Done with map setup
        </button>
      </div>
    </div>
  );
}
