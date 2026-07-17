"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import type { HavenScanBundle, ScanElement, ScanSmartObject, ScanSmartObjectCategory } from "../lib/lidar-scan";

type PreparedElement = {
  id: string;
  category: string;
  kind: "wall" | "door" | "window" | "opening" | "floor" | "object";
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number, number];
};

type PreparedSmartObject = {
  id: string;
  category: ScanSmartObjectCategory;
  label: string;
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number, number];
  entityId?: string;
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
      {prepared.smartObjects.map((object) => (
        <SmartObjectSymbol
          key={object.id}
          object={object}
          onSelect={() => onSelect(object.entityId || object.id)}
        />
      ))}
    </group>
  );
}

function prepareScan(scan: HavenScanBundle) {
  const elements: PreparedElement[] = [];
  const smartObjects: PreparedSmartObject[] = [];
  const replacedObjectIds = new Set(scan.rooms.flatMap((room) => (room.smartObjects || [])
    .filter((object) => object.category !== "smart_blind")
    .map((object) => object.sourceElementId)
    .filter((id): id is string => Boolean(id))));
  for (const room of scan.rooms) {
    append(elements, room.walls, "wall");
    append(elements, room.floors, "floor");
    append(elements, room.doors, "door");
    append(elements, room.windows, "window");
    append(elements, room.openings, "opening");
    append(elements, room.objects.filter((object) => !replacedObjectIds.has(object.id)), "object");
    for (const object of room.smartObjects || []) {
      smartObjects.push(prepareSmartObject(object, scan.deviceAssignments?.[object.id]));
    }
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
    smartObjects,
    scale,
    position: [-(minX + maxX) * 0.5 * scale, 0, -(minZ + maxZ) * 0.5 * scale] as [number, number, number],
  };
}

function prepareSmartObject(object: ScanSmartObject, entityId?: string): PreparedSmartObject {
  const matrix = object.transform;
  return {
    id: object.id,
    category: object.category,
    label: object.label,
    position: [matrix[12] || 0, matrix[13] || 0, matrix[14] || 0],
    rotation: [0, Math.atan2(matrix[8] || 0, matrix[0] || 1), 0],
    size: object.dimensions.map((value) => Math.max(0.02, Math.abs(value))) as [number, number, number],
    entityId,
  };
}

function SmartObjectSymbol({ object, onSelect }: { object: PreparedSmartObject; onSelect: () => void }) {
  const color = object.entityId ? "#70e0be" : "#ffc857";
  return (
    <group
      position={object.position}
      rotation={object.rotation}
      onClick={(event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect(); }}
      onPointerOver={(event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}
      userData={{ label: object.label, entityId: object.entityId }}
    >
      {object.category === "smart_tv" && <TelevisionSymbol size={object.size} color={color} />}
      {object.category === "speaker" && <SpeakerSymbol size={object.size} color={color} />}
      {object.category === "wall_switch" && <SwitchSymbol size={object.size} color={color} />}
      {object.category === "keypad" && <KeypadSymbol size={object.size} color={color} />}
      {object.category === "smart_blind" && <BlindSymbol size={object.size} color={color} />}
      {object.category === "thermostat" && <ThermostatSymbol size={object.size} color={color} />}
    </group>
  );
}

function TelevisionSymbol({ size: [width, height, depth], color }: SymbolProps) {
  const bodyDepth = Math.min(Math.max(depth, 0.045), 0.12);
  return (
    <group>
      <RoundedBox args={[width, height, bodyDepth]} radius={Math.min(0.05, height * 0.06)} castShadow>
        <meshStandardMaterial color="#10221f" roughness={0.26} metalness={0.38} />
      </RoundedBox>
      <mesh position={[0, 0, bodyDepth * 0.51]}>
        <planeGeometry args={[width * 0.92, height * 0.86]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.16} roughness={0.18} />
      </mesh>
    </group>
  );
}

function SpeakerSymbol({ size: [width, height, depth], color }: SymbolProps) {
  return (
    <RoundedBox args={[width, height, depth]} radius={Math.min(width, depth) * 0.22} castShadow>
      <meshStandardMaterial color={color} roughness={0.58} metalness={0.16} />
      {[0.22, -0.22].map((offset) => (
        <mesh key={offset} position={[0, height * offset, depth * 0.51]}>
          <circleGeometry args={[Math.min(width, height) * 0.24, 24]} />
          <meshStandardMaterial color="#17302a" roughness={0.72} />
        </mesh>
      ))}
    </RoundedBox>
  );
}

function SwitchSymbol({ size: [width, height, depth], color }: SymbolProps) {
  const plateWidth = Math.max(width, 0.1);
  const plateHeight = Math.max(height, 0.1);
  const plateDepth = Math.max(depth, 0.025);
  return (
    <group>
      <RoundedBox args={[plateWidth, plateHeight, plateDepth]} radius={0.02} castShadow>
        <meshStandardMaterial color="#e7eeeb" roughness={0.52} />
      </RoundedBox>
      <RoundedBox args={[plateWidth * 0.46, plateHeight * 0.58, plateDepth * 0.45]} radius={0.012} position={[0, 0, plateDepth * 0.68]}>
        <meshStandardMaterial color={color} roughness={0.4} />
      </RoundedBox>
    </group>
  );
}

function KeypadSymbol({ size: [width, height, depth], color }: SymbolProps) {
  const panelWidth = Math.max(width, 0.13);
  const panelHeight = Math.max(height, 0.18);
  const panelDepth = Math.max(depth, 0.035);
  return (
    <group>
      <RoundedBox args={[panelWidth, panelHeight, panelDepth]} radius={0.025} castShadow>
        <meshStandardMaterial color="#19312b" roughness={0.48} />
      </RoundedBox>
      {Array.from({ length: 9 }, (_, index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        return (
          <mesh key={index} position={[(column - 1) * panelWidth * 0.23, (1 - row) * panelHeight * 0.22, panelDepth * 0.54]}>
            <circleGeometry args={[Math.min(panelWidth, panelHeight) * 0.055, 14]} />
            <meshBasicMaterial color={index === 0 ? color : "#9eaaa6"} />
          </mesh>
        );
      })}
    </group>
  );
}

function BlindSymbol({ size: [width, height, depth], color }: SymbolProps) {
  const blindDepth = Math.max(depth, 0.025);
  return (
    <group>
      {Array.from({ length: 9 }, (_, index) => (
        <mesh key={index} position={[0, height * (0.42 - index * 0.105), blindDepth * 0.6]}>
          <boxGeometry args={[width * 0.96, Math.max(0.018, height * 0.055), blindDepth]} />
          <meshStandardMaterial color={index === 0 ? color : "#c7d2ce"} roughness={0.66} />
        </mesh>
      ))}
    </group>
  );
}

function ThermostatSymbol({ size: [width, height, depth], color }: SymbolProps) {
  const radius = Math.max(Math.min(width, height) * 0.5, 0.06);
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[radius, radius, Math.max(depth, 0.04), 32]} />
        <meshStandardMaterial color="#e8efec" roughness={0.36} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0, Math.max(depth, 0.04) * 0.52]}>
        <circleGeometry args={[radius * 0.64, 30]} />
        <meshStandardMaterial color="#18312b" emissive={color} emissiveIntensity={0.22} />
      </mesh>
    </group>
  );
}

type SymbolProps = { size: [number, number, number]; color: string };

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
