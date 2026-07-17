export type ScanConfidence = "low" | "medium" | "high";

export type ScanElement = {
  id: string;
  category: string;
  confidence: ScanConfidence;
  dimensions: [number, number, number];
  transform: number[];
};

export type ScanRoom = {
  id: string;
  name: string;
  walls: ScanElement[];
  doors: ScanElement[];
  windows: ScanElement[];
  openings: ScanElement[];
  floors: ScanElement[];
  objects: ScanElement[];
  smartObjects?: ScanSmartObject[];
};

export type ScanSmartObjectCategory = "smart_tv" | "speaker" | "wall_switch" | "keypad" | "smart_blind" | "thermostat";

export type ScanSmartObject = ScanElement & {
  category: ScanSmartObjectCategory;
  label: string;
  source: "roomplan" | "vision";
  sourceElementId?: string;
};

export type HavenScanBundle = {
  schemaVersion: 1;
  sessionId: string;
  deviceName: string;
  capturedAt: string;
  receivedAt?: string;
  rooms: ScanRoom[];
  deviceAssignments?: Record<string, string>;
};

export type ScanSession = {
  id: string;
  status: "waiting" | "complete" | "expired";
  expiresAt: string;
  deepLink?: string;
  receivedAt?: string;
  scan?: HavenScanBundle;
};

export type SmartObjectSuggestion = {
  category: string;
  count: number;
  deviceKind: "light" | "media" | "climate" | "shade" | "security" | "other";
  label: string;
};

export async function createLidarScanSession(): Promise<ScanSession> {
  const serverUrl = window.location.origin;
  const callback = new URL(window.location.href);
  callback.search = "";
  callback.hash = "";
  const response = await fetch("/api/v1/scans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serverUrl, callbackUrl: callback.toString() }),
  });
  if (!response.ok) throw new Error(await apiError(response, "Could not prepare the scanner."));
  return response.json() as Promise<ScanSession>;
}

export async function loadLidarScanSession(id: string): Promise<ScanSession> {
  const response = await fetch(`/api/v1/scans/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(await apiError(response, "The scan could not be loaded."));
  return response.json() as Promise<ScanSession>;
}

export async function loadLatestLidarScan(): Promise<ScanSession | null> {
  const response = await fetch("/api/v1/scans/latest", { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await apiError(response, "The saved scan could not be loaded."));
  return response.json() as Promise<ScanSession>;
}

export function countScanElements(scan: HavenScanBundle): number {
  return scan.rooms.reduce((total, room) => total
    + room.walls.length
    + room.doors.length
    + room.windows.length
    + room.openings.length
    + room.floors.length
    + room.objects.length
    + (room.smartObjects?.length || 0), 0);
}

export function scanSmartObjects(scan: HavenScanBundle): Array<ScanSmartObject & { roomId: string; roomName: string }> {
  return scan.rooms.flatMap((room) => (room.smartObjects || []).map((object) => ({
    ...object,
    roomId: room.id,
    roomName: room.name,
  })));
}

export function smartObjectSuggestions(scan: HavenScanBundle): SmartObjectSuggestion[] {
  const counts = new Map<string, number>();
  const confirmed = scanSmartObjects(scan);
  if (confirmed.length > 0) {
    for (const object of confirmed) counts.set(object.category, (counts.get(object.category) || 0) + 1);
  }
  for (const room of scan.rooms) {
    if (confirmed.length > 0) break;
    for (const object of room.objects) {
      const category = object.category.trim().toLowerCase() || "object";
      counts.set(category, (counts.get(category) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count, ...suggestionFor(category) }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function suggestionFor(category: string): Pick<SmartObjectSuggestion, "deviceKind" | "label"> {
  if (/smart_tv/.test(category)) return { deviceKind: "media", label: "Smart TV" };
  if (/speaker/.test(category)) return { deviceKind: "media", label: "Speaker" };
  if (/wall_switch/.test(category)) return { deviceKind: "light", label: "Wall switch" };
  if (/keypad/.test(category)) return { deviceKind: "security", label: "Keypad" };
  if (/smart_blind/.test(category)) return { deviceKind: "shade", label: "Smart blind" };
  if (/thermostat/.test(category)) return { deviceKind: "climate", label: "Thermostat" };
  if (/television|tv|display/.test(category)) return { deviceKind: "media", label: "Smart TV" };
  if (/fireplace/.test(category)) return { deviceKind: "climate", label: "Smart fireplace" };
  if (/window|curtain|blind/.test(category)) return { deviceKind: "shade", label: "Smart shade" };
  if (/door|opening/.test(category)) return { deviceKind: "security", label: "Entry sensor" };
  if (/lamp|light/.test(category)) return { deviceKind: "light", label: "Smart light" };
  if (/air.?conditioner|radiator|heater/.test(category)) return { deviceKind: "climate", label: "Climate device" };
  return { deviceKind: "other", label: humanizeCategory(category) };
}

export async function assignScanSmartObject(scanId: string, smartObjectId: string, entityId: string | null): Promise<HavenScanBundle> {
  const response = await fetch(`/api/v1/scans/${encodeURIComponent(scanId)}/assignments`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ smartObjectId, entityId }),
  });
  if (!response.ok) throw new Error(await apiError(response, "Could not save the device assignment."));
  return response.json() as Promise<HavenScanBundle>;
}

export function humanizeCategory(category: string): string {
  return category.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function apiError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: string };
    return body.error ? body.error.replaceAll("_", " ") : fallback;
  } catch {
    return fallback;
  }
}
