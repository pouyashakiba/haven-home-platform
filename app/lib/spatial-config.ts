import type { LocalHouseModel } from "./house-model";

export type Vec3 = readonly [x: number, y: number, z: number];

export type SpatialRoom = {
  id: string;
  name: string;
  color: string;
  points: readonly Vec3[];
};

export type DeviceAnchor = {
  deviceId: string;
  position: Vec3;
  roomId: string;
};

type LocalHouseModelMetadata = Pick<LocalHouseModel, "name" | "totalBytes" | "triangleCount">;

const GEOMETRY_EPSILON = 1e-9;
const STORAGE_KEY_PREFIX = "haven:spatial:v1";

/** A comparison-safe room name while retaining human-readable word boundaries. */
export function normalizeRoomName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Area of a room footprint on the horizontal X/Z plane. */
export function polygonAreaXZ(points: readonly Vec3[]): number {
  if (points.length < 3) return 0;

  let twiceSignedArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceSignedArea += current[0] * next[2] - next[0] * current[2];
  }

  return Math.abs(twiceSignedArea) / 2;
}

/** Boundary-inclusive point-in-polygon test on the horizontal X/Z plane. */
export function pointInRoomXZ(position: Vec3, room: SpatialRoom): boolean {
  const points = room.points;
  if (points.length < 3 || !Number.isFinite(position[0]) || !Number.isFinite(position[2])) return false;

  for (let index = 0; index < points.length; index += 1) {
    if (pointOnSegmentXZ(position, points[index], points[(index + 1) % points.length])) return true;
  }

  const [x, , z] = position;
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const [currentX, , currentZ] = points[index];
    const [previousX, , previousZ] = points[previous];
    const crossesRay = currentZ > z !== previousZ > z;
    if (!crossesRay) continue;

    const intersectionX = ((previousX - currentX) * (z - currentZ)) / (previousZ - currentZ) + currentX;
    if (x < intersectionX) inside = !inside;
  }

  return inside;
}

/** Returns the first configured room containing the position. Array order breaks shared-boundary ties. */
export function findRoomForPosition(position: Vec3, rooms: readonly SpatialRoom[]): SpatialRoom | undefined {
  return rooms.find((room) => pointInRoomXZ(position, room));
}

/** Polygon centroid on X/Z, with the mean point as a safe fallback for degenerate footprints. */
export function roomCentroid(room: SpatialRoom): Vec3 {
  const points = room.points;
  if (points.length === 0) return [0, 0, 0];

  const meanY = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  let twiceSignedArea = 0;
  let weightedX = 0;
  let weightedZ = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current[0] * next[2] - next[0] * current[2];
    twiceSignedArea += cross;
    weightedX += (current[0] + next[0]) * cross;
    weightedZ += (current[2] + next[2]) * cross;
  }

  if (Math.abs(twiceSignedArea) <= GEOMETRY_EPSILON) {
    let totalX = 0;
    let totalZ = 0;
    for (const point of points) {
      totalX += point[0];
      totalZ += point[2];
    }
    return [totalX / points.length, meanY, totalZ / points.length];
  }

  return [weightedX / (3 * twiceSignedArea), meanY, weightedZ / (3 * twiceSignedArea)];
}

/** Stable, synchronous, browser-safe key for a model's local spatial configuration. */
export function createSpatialStorageKey(model: LocalHouseModelMetadata): string {
  const normalizedName = normalizeRoomName(model.name) || "unnamed-model";
  const totalBytes = normalizeCount(model.totalBytes);
  const triangleCount = normalizeCount(model.triangleCount);
  return `${STORAGE_KEY_PREFIX}:${encodeURIComponent(normalizedName)}:${totalBytes}:${triangleCount}`;
}

function pointOnSegmentXZ(point: Vec3, start: Vec3, end: Vec3): boolean {
  const segmentX = end[0] - start[0];
  const segmentZ = end[2] - start[2];
  const pointX = point[0] - start[0];
  const pointZ = point[2] - start[2];
  const scale = Math.max(1, Math.hypot(segmentX, segmentZ));
  const tolerance = GEOMETRY_EPSILON * scale;
  const cross = segmentX * pointZ - segmentZ * pointX;
  if (Math.abs(cross) > tolerance) return false;

  const projection = pointX * segmentX + pointZ * segmentZ;
  if (projection < -tolerance) return false;
  const squaredLength = segmentX * segmentX + segmentZ * segmentZ;
  return projection <= squaredLength + tolerance;
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
