"use client";

import { Blinds, Grid3X3, Link2, Speaker, Thermometer, ToggleLeft, Tv } from "lucide-react";
import { useState } from "react";
import type { DeviceKind, HomeDevice } from "../lib/home-data";
import { scanSmartObjects, type HavenScanBundle, type ScanSmartObjectCategory } from "../lib/lidar-scan";

const categoryKinds: Record<ScanSmartObjectCategory, DeviceKind[]> = {
  smart_tv: ["media"],
  speaker: ["media"],
  wall_switch: ["switch", "light"],
  keypad: ["keypad", "lock", "sensor"],
  smart_blind: ["shade"],
  thermostat: ["climate", "sensor"],
};

const categoryIcons = {
  smart_tv: Tv,
  speaker: Speaker,
  wall_switch: ToggleLeft,
  keypad: Grid3X3,
  smart_blind: Blinds,
  thermostat: Thermometer,
} as const;

export function ScanDeviceAssignment({
  scan,
  devices,
  onAssign,
}: {
  scan: HavenScanBundle;
  devices: HomeDevice[];
  onAssign: (smartObjectId: string, entityId: string | null) => Promise<void>;
}) {
  const objects = scanSmartObjects(scan);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (objects.length === 0) return null;

  return (
    <div className="scan-assignment" aria-labelledby="scan-assignment-title">
      <div className="scan-assignment-heading">
        <span><Link2 size={17} aria-hidden="true" /></span>
        <div>
          <strong id="scan-assignment-title">Connect detected objects</strong>
          <small>{devices.length} Home Assistant entities available</small>
        </div>
      </div>
      <div className="scan-assignment-list">
        {objects.map((object) => {
          const Icon = categoryIcons[object.category];
          const assignedEntityId = scan.deviceAssignments?.[object.id] || "";
          const recommended = devices.filter((device) => categoryKinds[object.category].includes(device.kind));
          const other = devices.filter((device) => !categoryKinds[object.category].includes(device.kind));
          const assignedMissing = assignedEntityId && !devices.some((device) => device.entityId === assignedEntityId);
          return (
            <div className="scan-assignment-row" key={object.id}>
              <span className={`scan-assignment-icon category-${object.category}`}>
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="scan-assignment-copy">
                <strong>{object.label}</strong>
                <small>{object.roomName} · {object.confidence} confidence</small>
              </span>
              <label>
                <span className="sr-only">Home Assistant device for {object.label} in {object.roomName}</span>
                <select
                  value={assignedEntityId}
                  disabled={savingId === object.id}
                  onChange={async (event) => {
                    const value = event.target.value || null;
                    setSavingId(object.id);
                    setError(null);
                    try {
                      await onAssign(object.id, value);
                    } catch (caught) {
                      setError(caught instanceof Error ? caught.message : "Could not save assignment");
                    } finally {
                      setSavingId(null);
                    }
                  }}
                >
                  <option value="">{savingId === object.id ? "Saving…" : "Choose HA device"}</option>
                  {assignedMissing && <option value={assignedEntityId}>Assigned · currently unavailable</option>}
                  {recommended.length > 0 && (
                    <optgroup label="Recommended matches">
                      {recommended.map((device) => <DeviceOption key={device.entityId} device={device} />)}
                    </optgroup>
                  )}
                  {other.length > 0 && (
                    <optgroup label="Other Home Assistant devices">
                      {other.map((device) => <DeviceOption key={device.entityId} device={device} />)}
                    </optgroup>
                  )}
                </select>
              </label>
            </div>
          );
        })}
      </div>
      {error && <p className="scan-assignment-error" role="alert">{error}</p>}
    </div>
  );
}

function DeviceOption({ device }: { device: HomeDevice }) {
  const hardware = [device.manufacturer, device.model].filter(Boolean).join(" ");
  const detail = [device.room !== "Unassigned" ? device.room : null, hardware || null].filter(Boolean).join(" · ");
  return <option value={device.entityId}>{device.name}{detail ? ` — ${detail}` : ""}</option>;
}
