"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import type { HavenScanBundle, ScanElement } from "../lib/lidar-scan";

type PreparedElement = {
  id: string;
  category: string;
  kind: "wall" | "door" | "window" | "opening" | "floor" | "object";
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number, number];
};

const COLORS = {
  wall: "#c4d2cd",
  door: "#d8a96a",
  window: "#68c8df",
  opening: "#8ea7a0",
  floor: "#29433b",
  object: "#70e0be",
} as const;

export function ScannedHomeModel({ scan, onSelect }: { scan: HavenScanBundle; onSelect: (id: string) => void }) {
  const prepared = useMemo(() => prepareScan(scan), [scan]);

  useEffect(() => () => {
    document.body.style.cursor = "";
  }, []);

  return (
    <group position={prepared.position} scale={prepared.scale}>
      {prepared.elements.map((element) => (
        <mesh
          key={element.id}
          position={element.position}
          rotation={element.rotation}
          castShadow={element.kind !== "floor"}
          receiveShadow
          onClick={(event: ThreeEvent<MouseEvent>) => {
            event.stopPropagation();
            onSelect(element.id);
          }}
          onPointerOver={(event: ThreeEvent<PointerEvent>) => {
            event.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
        >
          <boxGeometry args={element.size} />
          <meshStandardMaterial
            color={COLORS[element.kind]}
            transparent={element.kind === "window" || element.kind === "opening"}
            opacity={element.kind === "window" ? 0.55 : element.kind === "opening" ? 0.28 : element.kind === "object" ? 0.74 : 1}
            roughness={element.kind === "window" ? 0.2 : 0.78}
            metalness={element.kind === "object" ? 0.08 : 0}
          />
        </mesh>
      ))}
    </group>
  );
}

function prepareScan(scan: HavenScanBundle) {
  const elements: PreparedElement[] = [];
  for (const room of scan.rooms) {
    append(elements, room.walls, "wall");
    append(elements, room.floors, "floor");
    append(elements, room.doors, "door");
    append(elements, room.windows, "window");
    append(elements, room.openings, "opening");
    append(elements, room.objects, "object");
  }
  const xs = elements.map((item) => item.position[0]);
  const zs = elements.map((item) => item.position[2]);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 1;
  const minZ = zs.length ? Math.min(...zs) : 0;
  const maxZ = zs.length ? Math.max(...zs) : 1;
  const span = Math.max(maxX - minX, maxZ - minZ, 1);
  const scale = Math.min(2.5, 10.5 / span);
  return {
    elements,
    scale,
    position: [-(minX + maxX) * 0.5 * scale, 0, -(minZ + maxZ) * 0.5 * scale] as [number, number, number],
  };
}

function append(target: PreparedElement[], elements: ScanElement[], kind: PreparedElement["kind"]) {
  for (const element of elements) {
    const matrix = element.transform;
    const x = matrix[12] || 0;
    const y = matrix[13] || 0;
    const z = matrix[14] || 0;
    const yaw = Math.atan2(matrix[8] || 0, matrix[0] || 1);
    const [width, height, depth] = element.dimensions.map((value) => Math.max(0.02, Math.abs(value))) as [number, number, number];
    const size: [number, number, number] = kind === "floor"
      ? [width, 0.045, Math.max(depth, height)]
      : kind === "wall" || kind === "door" || kind === "window" || kind === "opening"
        ? [width, height, Math.max(depth, 0.065)]
        : [width, height, depth];
    target.push({
      id: element.id,
      category: element.category,
      kind,
      position: [x, kind === "floor" ? y - 0.02 : y, z],
      rotation: [0, yaw, 0],
      size,
    });
  }
}
