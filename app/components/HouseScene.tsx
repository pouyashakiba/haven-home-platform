"use client";

import { Canvas, ThreeEvent, useFrame } from "@react-three/fiber";
import {
  CameraControls,
  ContactShadows,
  Environment,
  Html,
  Line,
  RoundedBox,
} from "@react-three/drei";
import {
  DoubleSide,
  Group,
  MathUtils,
  MeshBasicMaterial,
  Shape,
} from "three";
import { useEffect, useMemo, useRef } from "react";
import type { HomeDevice } from "../lib/home-data";
import type { LocalHouseModel } from "../lib/house-model";
import { roomCentroid, type DeviceAnchor, type SpatialRoom, type Vec3 } from "../lib/spatial-config";
import { ImportedHouseModel } from "./ImportedHouseModel";

export type CommissioningState =
  | { kind: "idle" }
  | { kind: "room"; roomName: string; points: Vec3[] }
  | { kind: "device"; deviceId: string };

export type HouseSceneProps = {
  selectedId: string | null;
  alertActive: boolean;
  devices: HomeDevice[];
  onSelect: (id: string) => void;
  importedModel: LocalHouseModel | null;
  rooms: SpatialRoom[];
  deviceAnchors: DeviceAnchor[];
  commissioning: CommissioningState;
  onCommissionPoint: (point: Vec3) => void;
  /** Incremented for each motion event. It never changes selection or camera focus. */
  motionPulse?: number;
};

type SceneVec3 = [number, number, number];

const ROOM_COLORS: Record<string, string> = {
  living: "#b6d8cc",
  kitchen: "#d6cab2",
  entry: "#a9c6bd",
  office: "#b5c4d0",
  bedroom: "#cabfb7",
};

const ROOM_LAYOUT: Array<{
  id: string;
  name: string;
  position: SceneVec3;
  size: [number, number];
}> = [
  { id: "living", name: "Living room", position: [-3, 0, -1], size: [6, 6] },
  { id: "kitchen", name: "Kitchen", position: [3, 0, -1], size: [6, 6] },
  { id: "entry", name: "Entry", position: [-4.5, 0, 3.25], size: [3, 2.5] },
  { id: "office", name: "Office", position: [-1.5, 0, 3.25], size: [3, 2.5] },
  { id: "bedroom", name: "Bedroom", position: [3, 0, 3.25], size: [6, 2.5] },
];

const DEVICE_POSITIONS: Record<string, SceneVec3> = {
  "living-light": [-3.1, 0.82, -1.4],
  "kitchen-light": [3.15, 0.82, -1.35],
  thermostat: [0.18, 0.68, 1.75],
  "front-door": [-4.48, 1.08, 4.34],
  "entry-camera": [-5.55, 1.52, 3.82],
  "entry-motion": [-4.9, 1.28, 2.18],
  "office-light": [-1.5, 0.75, 3.2],
  "bedroom-shade": [4.55, 0.74, 4.18],
  "air-sensor": [-1.25, 0.54, -2.75],
};

const CAMERA_POSES: Record<string, { position: SceneVec3; target: SceneVec3; zoom: number }> = {
  home: { position: [11, 12, 14], target: [0, 0, 0], zoom: 49 },
  living: { position: [7, 8, 8], target: [-3, 0, -1], zoom: 76 },
  kitchen: { position: [10, 8, 6], target: [3, 0, -1], zoom: 76 },
  entry: { position: [3, 7, 11], target: [-4.2, 0.8, 3.5], zoom: 86 },
  office: { position: [7, 8, 11], target: [-1.5, 0, 3.2], zoom: 82 },
  bedroom: { position: [10, 8, 11], target: [3, 0, 3.2], zoom: 75 },
  "living-light": { position: [6, 7, 8], target: [-3.1, 0.5, -1.4], zoom: 84 },
  "kitchen-light": { position: [10, 7, 7], target: [3.1, 0.5, -1.4], zoom: 84 },
  thermostat: { position: [7, 6, 8], target: [0.2, 0.6, 1.75], zoom: 92 },
  "front-door": { position: [2.8, 5.8, 10.5], target: [-4.5, 1, 4.15], zoom: 104 },
  "entry-camera": { position: [2, 6.5, 10], target: [-5.4, 1.2, 3.7], zoom: 94 },
  "entry-motion": { position: [2.8, 6.6, 10.5], target: [-4.7, 0.9, 2.65], zoom: 92 },
  "office-light": { position: [6, 7, 10], target: [-1.5, 0.5, 3.2], zoom: 92 },
  "bedroom-shade": { position: [11, 7, 11], target: [4.5, 0.6, 4.1], zoom: 88 },
  "air-sensor": { position: [7, 7, 7], target: [-1.3, 0.4, -2.7], zoom: 92 },
};

function CameraDirector({
  focusId,
  alertActive,
  roomDrawing,
}: {
  focusId: string | null;
  alertActive: boolean;
  roomDrawing: boolean;
}) {
  const controls = useRef<any>(null);

  useEffect(() => {
    const control = controls.current;
    if (!control) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    control.stop();
    if (roomDrawing) {
      void control.setLookAt(0, 16, 0.01, 0, 0, 0, !reduceMotion);
      void control.zoomTo(47, !reduceMotion);
      return;
    }

    const id = alertActive ? "front-door" : focusId ?? "home";
    const pose = CAMERA_POSES[id] ?? CAMERA_POSES.home;
    void control.setLookAt(
      pose.position[0],
      pose.position[1],
      pose.position[2],
      pose.target[0],
      pose.target[1],
      pose.target[2],
      !reduceMotion,
    );
    void control.zoomTo(pose.zoom, !reduceMotion);
  }, [focusId, alertActive, roomDrawing]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      enabled={!roomDrawing}
      minPolarAngle={roomDrawing ? 0 : Math.PI * 0.18}
      maxPolarAngle={roomDrawing ? 0.01 : Math.PI * 0.43}
      minZoom={34}
      maxZoom={125}
      smoothTime={0.42}
      draggingSmoothTime={0.08}
      dollyToCursor={!roomDrawing}
    />
  );
}

function RoomSlab({
  room,
  selected,
  anySelected,
  onSelect,
}: {
  room: (typeof ROOM_LAYOUT)[number];
  selected: boolean;
  anySelected: boolean;
  onSelect: (id: string) => void;
}) {
  const click = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(room.id);
  };

  return (
    <group>
      <RoundedBox
        args={[room.size[0] - 0.1, 0.16, room.size[1] - 0.1]}
        radius={0.08}
        smoothness={3}
        position={[room.position[0], 0.02, room.position[2]]}
        receiveShadow
        onClick={click}
      >
        <meshStandardMaterial
          color={ROOM_COLORS[room.id]}
          roughness={0.78}
          metalness={0.02}
          transparent
          opacity={anySelected && !selected ? 0.62 : 0.95}
          emissive={selected ? "#70e0be" : "#000000"}
          emissiveIntensity={selected ? 0.18 : 0}
        />
      </RoundedBox>
      {selected && (
        <mesh position={[room.position[0], 0.12, room.position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.44, 0.48, 64]} />
          <meshBasicMaterial color="#70e0be" transparent opacity={0.75} side={DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

type WallTone = "exterior" | "interior" | "cutaway";

function Wall({
  position,
  size,
  tone = "interior",
}: {
  position: SceneVec3;
  size: SceneVec3;
  tone?: WallTone;
}) {
  const color = tone === "exterior" ? "#eeeae1" : tone === "cutaway" ? "#d7d5cc" : "#e4e2da";

  return (
    <group>
      <RoundedBox
        args={size}
        position={position}
        radius={0.025}
        smoothness={2}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={color} roughness={0.78} />
      </RoundedBox>
      {tone !== "cutaway" && (
        <mesh position={[position[0], position[1] + size[1] / 2 + 0.012, position[2]]} receiveShadow>
          <boxGeometry args={[size[0] + 0.025, 0.025, size[2] + 0.025]} />
          <meshStandardMaterial color="#f7f3ea" roughness={0.7} />
        </mesh>
      )}
    </group>
  );
}

function Sofa() {
  return (
    <group position={[-3.55, 0, -2.35]}>
      <RoundedBox args={[3.0, 0.34, 0.98]} radius={0.15} position={[0, 0.32, 0]} castShadow>
        <meshStandardMaterial color="#3f5b52" roughness={0.9} />
      </RoundedBox>
      <RoundedBox args={[2.52, 0.16, 0.7]} radius={0.1} position={[0, 0.56, 0.08]} castShadow>
        <meshStandardMaterial color="#58736a" roughness={0.92} />
      </RoundedBox>
      <RoundedBox args={[2.68, 0.72, 0.2]} radius={0.08} position={[0, 0.68, -0.42]} castShadow>
        <meshStandardMaterial color="#4a665d" roughness={0.92} />
      </RoundedBox>
      {[-1.4, 1.4].map((x) => (
        <RoundedBox key={x} args={[0.22, 0.58, 0.96]} radius={0.08} position={[x, 0.54, 0]} castShadow>
          <meshStandardMaterial color="#435f56" roughness={0.9} />
        </RoundedBox>
      ))}
      {[-1.15, 1.15].map((x) => (
        <mesh key={x} position={[x, 0.11, 0.18]} castShadow>
          <boxGeometry args={[0.09, 0.2, 0.09]} />
          <meshStandardMaterial color="#795f43" roughness={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function CoffeeTable() {
  return (
    <group position={[-2.9, 0, -0.72]}>
      <RoundedBox args={[1.52, 0.12, 0.84]} radius={0.08} position={[0, 0.34, 0]} castShadow>
        <meshStandardMaterial color="#b4946d" roughness={0.66} />
      </RoundedBox>
      {[-0.58, 0.58].flatMap((x) =>
        [-0.25, 0.25].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.18, z]} castShadow>
            <boxGeometry args={[0.07, 0.3, 0.07]} />
            <meshStandardMaterial color="#5b4a39" roughness={0.74} />
          </mesh>
        )),
      )}
    </group>
  );
}

function KitchenIsland() {
  return (
    <group position={[2.85, 0, -0.45]}>
      <RoundedBox args={[3.35, 0.76, 0.9]} radius={0.08} position={[0, 0.48, 0]} castShadow>
        <meshStandardMaterial color="#53645f" roughness={0.72} />
      </RoundedBox>
      <RoundedBox args={[3.55, 0.12, 1.05]} radius={0.055} position={[0, 0.9, 0]} castShadow>
        <meshStandardMaterial color="#d8d3c6" roughness={0.42} />
      </RoundedBox>
      <RoundedBox args={[0.58, 0.035, 0.42]} radius={0.04} position={[0.85, 0.968, 0]}>
        <meshStandardMaterial color="#667c78" metalness={0.35} roughness={0.25} />
      </RoundedBox>
      <mesh position={[1.12, 1.08, 0]} rotation={[0, 0, -0.18]} castShadow>
        <torusGeometry args={[0.16, 0.025, 10, 24, Math.PI]} />
        <meshStandardMaterial color="#b9c6c2" metalness={0.7} roughness={0.22} />
      </mesh>
    </group>
  );
}

function DiningSet() {
  return (
    <group position={[3.6, 0, -2.72]}>
      <RoundedBox args={[2.2, 0.12, 0.95]} radius={0.06} position={[0, 0.62, 0]} castShadow>
        <meshStandardMaterial color="#b38f67" roughness={0.7} />
      </RoundedBox>
      {[-0.78, 0.78].flatMap((x) =>
        [-0.28, 0.28].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.31, z]} castShadow>
            <boxGeometry args={[0.07, 0.58, 0.07]} />
            <meshStandardMaterial color="#5d4937" roughness={0.76} />
          </mesh>
        )),
      )}
      {[-1.38, 1.38].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <RoundedBox args={[0.46, 0.1, 0.46]} radius={0.05} position={[0, 0.43, 0]} castShadow>
            <meshStandardMaterial color="#344944" roughness={0.84} />
          </RoundedBox>
          <RoundedBox args={[0.46, 0.5, 0.1]} radius={0.04} position={[0, 0.65, -0.18]} castShadow>
            <meshStandardMaterial color="#344944" roughness={0.84} />
          </RoundedBox>
        </group>
      ))}
    </group>
  );
}

function Bed() {
  return (
    <group position={[3.25, 0, 3.38]}>
      <RoundedBox args={[2.65, 0.14, 1.8]} radius={0.08} position={[0, 0.17, 0]} castShadow>
        <meshStandardMaterial color="#67584d" roughness={0.82} />
      </RoundedBox>
      <RoundedBox args={[2.5, 0.34, 1.65]} radius={0.18} position={[0, 0.39, -0.02]} castShadow>
        <meshStandardMaterial color="#9da9a4" roughness={0.94} />
      </RoundedBox>
      <RoundedBox args={[2.58, 0.85, 0.16]} radius={0.08} position={[0, 0.67, 0.78]} castShadow>
        <meshStandardMaterial color="#667873" roughness={0.9} />
      </RoundedBox>
      {[-0.62, 0.62].map((x) => (
        <RoundedBox key={x} args={[0.82, 0.16, 0.46]} radius={0.12} position={[x, 0.65, 0.48]} castShadow>
          <meshStandardMaterial color="#e6e0d6" roughness={0.96} />
        </RoundedBox>
      ))}
      <RoundedBox args={[2.38, 0.06, 0.8]} radius={0.04} position={[0, 0.61, -0.4]}>
        <meshStandardMaterial color="#7c938b" roughness={0.98} />
      </RoundedBox>
    </group>
  );
}

function OfficeDesk() {
  return (
    <group position={[-1.52, 0, 3.28]}>
      <RoundedBox args={[1.45, 0.1, 0.68]} radius={0.045} position={[0, 0.58, 0]} castShadow>
        <meshStandardMaterial color="#a88766" roughness={0.7} />
      </RoundedBox>
      {[-0.58, 0.58].map((x) => (
        <mesh key={x} position={[x, 0.29, 0]} castShadow>
          <boxGeometry args={[0.07, 0.55, 0.48]} />
          <meshStandardMaterial color="#4c4036" roughness={0.78} />
        </mesh>
      ))}
      <RoundedBox args={[0.66, 0.42, 0.06]} radius={0.035} position={[0, 0.9, 0.02]} castShadow>
        <meshStandardMaterial color="#14231f" roughness={0.32} metalness={0.18} />
      </RoundedBox>
      <mesh position={[0, 0.68, 0.02]} castShadow>
        <boxGeometry args={[0.05, 0.22, 0.05]} />
        <meshStandardMaterial color="#42514d" metalness={0.35} roughness={0.45} />
      </mesh>
      <group position={[0, 0, -0.72]}>
        <RoundedBox args={[0.58, 0.1, 0.52]} radius={0.06} position={[0, 0.42, 0]} castShadow>
          <meshStandardMaterial color="#324944" roughness={0.86} />
        </RoundedBox>
        <RoundedBox args={[0.58, 0.55, 0.1]} radius={0.05} position={[0, 0.68, -0.2]} castShadow>
          <meshStandardMaterial color="#324944" roughness={0.86} />
        </RoundedBox>
      </group>
    </group>
  );
}

function EntryBench() {
  return (
    <group position={[-5.15, 0, 3.2]}>
      <RoundedBox args={[1.25, 0.16, 0.46]} radius={0.06} position={[0, 0.46, 0]} castShadow>
        <meshStandardMaterial color="#927557" roughness={0.78} />
      </RoundedBox>
      {[-0.46, 0.46].map((x) => (
        <mesh key={x} position={[x, 0.23, 0]} castShadow>
          <boxGeometry args={[0.07, 0.44, 0.32]} />
          <meshStandardMaterial color="#54463a" roughness={0.78} />
        </mesh>
      ))}
    </group>
  );
}

function Furniture() {
  return (
    <group>
      <Sofa />
      <CoffeeTable />
      <KitchenIsland />
      <DiningSet />
      <Bed />
      <OfficeDesk />
      <EntryBench />
    </group>
  );
}

function FrontDoor({
  alertActive,
  selected,
  onSelect,
}: {
  alertActive: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const hinge = useRef<Group>(null);

  useFrame((_, delta) => {
    if (!hinge.current) return;
    hinge.current.rotation.y = MathUtils.damp(
      hinge.current.rotation.y,
      alertActive ? -Math.PI * 0.36 : 0,
      7,
      delta,
    );
  });

  return (
    <group position={[-5.18, 0, 4.28]}>
      <mesh position={[-0.04, 1.08, 0.03]} castShadow>
        <boxGeometry args={[0.11, 2.18, 0.22]} />
        <meshStandardMaterial color="#e9e4da" roughness={0.76} />
      </mesh>
      <mesh position={[1.4, 1.08, 0.03]} castShadow>
        <boxGeometry args={[0.11, 2.18, 0.22]} />
        <meshStandardMaterial color="#e9e4da" roughness={0.76} />
      </mesh>
      <mesh position={[0.68, 2.15, 0.03]} castShadow>
        <boxGeometry args={[1.55, 0.12, 0.22]} />
        <meshStandardMaterial color="#e9e4da" roughness={0.76} />
      </mesh>
      <RoundedBox args={[1.52, 0.08, 0.28]} radius={0.025} position={[0.68, 0.08, 0]} receiveShadow>
        <meshStandardMaterial color="#9b8d78" roughness={0.76} />
      </RoundedBox>
      <group ref={hinge}>
        <RoundedBox
          args={[1.35, 2.05, 0.13]}
          radius={0.06}
          position={[0.67, 1.05, 0]}
          castShadow
          onClick={(event) => {
            event.stopPropagation();
            onSelect("front-door");
          }}
        >
          <meshStandardMaterial
            color={alertActive ? "#ff5266" : "#8d6f4f"}
            emissive={alertActive ? "#ff334d" : "#000000"}
            emissiveIntensity={alertActive ? 0.48 : 0}
            roughness={0.62}
          />
        </RoundedBox>
        <group position={[1.06, 1.26, -0.11]}>
          <RoundedBox args={[0.22, 0.42, 0.09]} radius={0.045} castShadow>
            <meshStandardMaterial color="#17231f" metalness={0.25} roughness={0.38} />
          </RoundedBox>
          {[0.1, 0, -0.1].map((y) => (
            <mesh key={y} position={[0, y, -0.052]}>
              <circleGeometry args={[0.022, 14]} />
              <meshBasicMaterial color={alertActive ? "#ff6675" : "#70e0be"} />
            </mesh>
          ))}
        </group>
        <mesh position={[1.12, 0.92, -0.13]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.055, 0.055, 0.24, 20]} />
          <meshStandardMaterial color="#e8c982" metalness={0.68} roughness={0.26} />
        </mesh>
      </group>
      {selected && (
        <mesh position={[0.68, 0.16, -0.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.48, 0.55, 48]} />
          <meshBasicMaterial
            color={alertActive ? "#ff5266" : "#70e0be"}
            transparent
            opacity={0.86}
            side={DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

function AlertRings({ active }: { active: boolean }) {
  const first = useRef<Group>(null);
  const second = useRef<Group>(null);
  const firstMaterial = useRef<MeshBasicMaterial>(null);
  const secondMaterial = useRef<MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    if (!active) return;
    const time = clock.elapsedTime;
    const animate = (group: Group | null, material: MeshBasicMaterial | null, offset: number) => {
      if (!group || !material) return;
      const phase = (time * 0.75 + offset) % 1;
      group.scale.setScalar(0.65 + phase * 1.35);
      material.opacity = 0.65 * (1 - phase);
    };
    animate(first.current, firstMaterial.current, 0);
    animate(second.current, secondMaterial.current, 0.5);
  });

  if (!active) return null;
  return (
    <group position={[-4.5, 0.15, 4.1]}>
      {[{ ref: first, material: firstMaterial }, { ref: second, material: secondMaterial }].map((item, index) => (
        <group ref={item.ref} key={index} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <ringGeometry args={[0.42, 0.5, 48]} />
            <meshBasicMaterial ref={item.material} color="#ff5266" transparent opacity={0.55} side={DoubleSide} />
          </mesh>
        </group>
      ))}
      <pointLight color="#ff334d" intensity={2.4} distance={4.5} />
    </group>
  );
}

function LightDevice({ device }: { device: HomeDevice }) {
  const offsets = device.id === "kitchen-light" ? [-0.24, 0, 0.24] : [0];

  if (device.id === "office-light") {
    return (
      <group>
        <mesh position={[0, -0.17, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.22, 0.08, 24]} />
          <meshStandardMaterial color="#40514c" roughness={0.5} metalness={0.2} />
        </mesh>
        <mesh position={[-0.04, 0.08, 0]} rotation={[0, 0, -0.34]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.48, 14]} />
          <meshStandardMaterial color="#a9b6b2" metalness={0.45} roughness={0.3} />
        </mesh>
        <mesh position={[0.05, 0.32, 0]} rotation={[0, 0, -0.2]} castShadow>
          <coneGeometry args={[0.19, 0.28, 24, 1, true]} />
          <meshStandardMaterial color="#d7c8a9" roughness={0.58} side={DoubleSide} />
        </mesh>
        <mesh position={[0.08, 0.22, 0]}>
          <sphereGeometry args={[0.075, 20, 14]} />
          <meshStandardMaterial
            color="#fff1bf"
            emissive="#ffc857"
            emissiveIntensity={device.active ? 2.2 : 0.15}
            roughness={0.3}
          />
        </mesh>
        {device.active && <pointLight position={[0.08, 0.22, 0]} color="#ffd99a" intensity={1.8} distance={2.8} />}
      </group>
    );
  }

  return (
    <group>
      {offsets.map((offset) => (
        <group key={offset} position={[offset, 0, 0]} scale={device.id === "kitchen-light" ? 0.8 : 1}>
          <mesh position={[0, 0.27, 0]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 0.32, 14]} />
            <meshStandardMaterial color="#53635e" metalness={0.4} roughness={0.32} />
          </mesh>
          <mesh position={[0, 0.06, 0]} castShadow>
            <coneGeometry args={[0.24, 0.27, 24, 1, true]} />
            <meshStandardMaterial color="#d4b97e" roughness={0.58} side={DoubleSide} />
          </mesh>
          <mesh position={[0, -0.055, 0]}>
            <sphereGeometry args={[0.09, 20, 14]} />
            <meshStandardMaterial
              color="#fff2bd"
              emissive="#ffc857"
              emissiveIntensity={device.active ? 2.25 : 0.12}
              roughness={0.28}
            />
          </mesh>
        </group>
      ))}
      {device.active && <pointLight position={[0, -0.04, 0]} color="#ffd99a" intensity={2.05} distance={3.4} decay={2} />}
    </group>
  );
}

function CameraDevice({ active }: { active: boolean }) {
  return (
    <group rotation={[0, -0.42, 0]}>
      <mesh position={[0, -0.22, -0.08]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.34, 16]} />
        <meshStandardMaterial color="#778783" metalness={0.45} roughness={0.36} />
      </mesh>
      <RoundedBox args={[0.46, 0.27, 0.3]} radius={0.07} position={[0, 0, 0]} castShadow>
        <meshStandardMaterial color="#dce4e1" roughness={0.48} metalness={0.08} />
      </RoundedBox>
      <mesh position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.115, 0.14, 0.12, 28]} />
        <meshStandardMaterial color="#172522" metalness={0.45} roughness={0.22} />
      </mesh>
      <mesh position={[0, 0, 0.247]}>
        <circleGeometry args={[0.075, 28]} />
        <meshStandardMaterial
          color="#294e49"
          emissive={active ? "#70e0be" : "#10211d"}
          emissiveIntensity={active ? 0.75 : 0.08}
          metalness={0.8}
          roughness={0.12}
        />
      </mesh>
      <mesh position={[0.15, 0.075, 0.16]}>
        <sphereGeometry args={[0.024, 14, 10]} />
        <meshBasicMaterial color={active ? "#70e0be" : "#73817d"} />
      </mesh>
    </group>
  );
}

function ClimateDevice({ active }: { active: boolean }) {
  return (
    <group>
      <RoundedBox args={[0.42, 0.48, 0.12]} radius={0.09} castShadow>
        <meshStandardMaterial color="#e4e9e7" roughness={0.52} />
      </RoundedBox>
      <RoundedBox args={[0.31, 0.25, 0.025]} radius={0.06} position={[0, 0.04, 0.073]}>
        <meshStandardMaterial
          color="#17302d"
          emissive={active ? "#23695f" : "#0c1715"}
          emissiveIntensity={active ? 0.65 : 0.08}
          roughness={0.3}
        />
      </RoundedBox>
      <mesh position={[0, 0.04, 0.09]}>
        <ringGeometry args={[0.065, 0.082, 28]} />
        <meshBasicMaterial color={active ? "#62c3ff" : "#869692"} transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, -0.16, 0.073]}>
        <boxGeometry args={[0.16, 0.018, 0.02]} />
        <meshBasicMaterial color="#7a8985" />
      </mesh>
    </group>
  );
}

function AirSensorDevice({ active }: { active: boolean }) {
  return (
    <group>
      <RoundedBox args={[0.28, 0.4, 0.16]} radius={0.075} castShadow>
        <meshStandardMaterial color="#dfe6e2" roughness={0.62} />
      </RoundedBox>
      {[-0.08, -0.03, 0.02, 0.07].map((y) => (
        <mesh key={y} position={[0, y, 0.086]}>
          <boxGeometry args={[0.15, 0.014, 0.012]} />
          <meshBasicMaterial color="#657a74" />
        </mesh>
      ))}
      <mesh position={[0, 0.135, 0.09]}>
        <circleGeometry args={[0.027, 16]} />
        <meshBasicMaterial color={active ? "#70e0be" : "#93a39e"} />
      </mesh>
    </group>
  );
}

function MotionSensorDevice({ active }: { active: boolean }) {
  return (
    <group>
      <RoundedBox args={[0.34, 0.3, 0.16]} radius={0.075} castShadow>
        <meshStandardMaterial color="#e5e9e6" roughness={0.58} />
      </RoundedBox>
      <mesh position={[0, 0.02, 0.115]}>
        <sphereGeometry args={[0.12, 24, 14]} />
        <meshStandardMaterial color="#c6d4d0" transparent opacity={0.88} roughness={0.24} />
      </mesh>
      {[0.19, 0.25].map((radius) => (
        <mesh key={radius} position={[0, 0.01, 0.105]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[radius, 0.012, 8, 28, Math.PI]} />
          <meshBasicMaterial color={active ? "#70e0be" : "#7e918b"} transparent opacity={active ? 0.85 : 0.5} />
        </mesh>
      ))}
    </group>
  );
}

function ShadeDevice({ active }: { active: boolean }) {
  return (
    <group>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0, 0]} castShadow>
          <boxGeometry args={[0.045, 0.72, 0.07]} />
          <meshStandardMaterial color="#7f8e89" metalness={0.25} roughness={0.45} />
        </mesh>
      ))}
      <mesh position={[0, 0.34, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.065, 0.065, 0.68, 18]} />
        <meshStandardMaterial color="#9eaaed" roughness={0.58} />
      </mesh>
      <mesh position={[0, active ? 0.05 : 0.14, -0.01]} castShadow>
        <boxGeometry args={[0.57, active ? 0.5 : 0.34, 0.035]} />
        <meshStandardMaterial color="#a99ae1" roughness={0.88} transparent opacity={0.92} />
      </mesh>
      <mesh position={[0, -0.31, 0]}>
        <boxGeometry args={[0.65, 0.04, 0.07]} />
        <meshStandardMaterial color="#6f7f7a" metalness={0.22} roughness={0.48} />
      </mesh>
    </group>
  );
}

function LockDevice({ locked }: { locked: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.14, 0]} castShadow>
        <torusGeometry args={[0.12, 0.032, 10, 28, Math.PI]} />
        <meshStandardMaterial color="#b8c5c1" metalness={0.7} roughness={0.24} />
      </mesh>
      <RoundedBox args={[0.34, 0.31, 0.16]} radius={0.06} position={[0, -0.05, 0]} castShadow>
        <meshStandardMaterial color="#263a35" roughness={0.46} metalness={0.2} />
      </RoundedBox>
      <mesh position={[0, -0.025, 0.086]}>
        <circleGeometry args={[0.045, 18]} />
        <meshBasicMaterial color={locked ? "#70e0be" : "#ffb36b"} />
      </mesh>
      <mesh position={[0, -0.09, 0.09]}>
        <boxGeometry args={[0.025, 0.085, 0.012]} />
        <meshBasicMaterial color={locked ? "#70e0be" : "#ffb36b"} />
      </mesh>
    </group>
  );
}

function DeviceForm({ device }: { device: HomeDevice }) {
  if (device.kind === "light") return <LightDevice device={device} />;
  if (device.kind === "camera") return <CameraDevice active={device.active} />;
  if (device.kind === "climate") return <ClimateDevice active={device.active} />;
  if (device.kind === "lock") {
    const lockState = device.state.trim().toLowerCase();
    return <LockDevice locked={lockState === "locked" || lockState === "secured"} />;
  }
  if (device.kind === "motion") return <MotionSensorDevice active={device.active} />;
  if (device.kind === "shade") return <ShadeDevice active={device.active} />;
  return <AirSensorDevice active={device.active} />;
}

function AmbientMotion({ pulse = 0 }: { pulse?: number }) {
  const root = useRef<Group>(null);
  const walker = useRef<Group>(null);
  const ripple = useRef<Group>(null);
  const rippleMaterial = useRef<MeshBasicMaterial>(null);
  const lastPulse = useRef(-1);
  const startedAt = useRef(Number.NEGATIVE_INFINITY);
  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    if (pulse > 0 && pulse !== lastPulse.current) {
      lastPulse.current = pulse;
      startedAt.current = performance.now();
    }
  }, [pulse]);

  useFrame(() => {
    const elapsed = (performance.now() - startedAt.current) / 1000;
    const visible = elapsed >= 0 && elapsed < 2.8;
    if (!root.current) return;
    root.current.visible = visible;
    if (!visible) return;

    const progress = MathUtils.clamp(elapsed / 2.25, 0, 1);
    if (walker.current) {
      walker.current.position.x = reduceMotion ? 0 : MathUtils.lerp(-0.6, 0.62, progress);
      walker.current.position.z = reduceMotion ? 0 : Math.sin(progress * Math.PI) * 0.09;
      walker.current.scale.setScalar(0.92 + Math.sin(progress * Math.PI * 4) * 0.035);
    }
    if (ripple.current && rippleMaterial.current) {
      const phase = reduceMotion ? 0.35 : (elapsed * 0.72) % 1;
      ripple.current.scale.setScalar(0.75 + phase * 0.75);
      rippleMaterial.current.opacity = 0.34 * (1 - phase);
    }
  });

  return (
    <group ref={root} position={[-4.45, 0.13, 3.18]} visible={false}>
      <group ref={walker}>
        <mesh position={[0, 0.42, 0]}>
          <sphereGeometry args={[0.075, 18, 12]} />
          <meshBasicMaterial color="#e8fff7" transparent opacity={0.72} />
        </mesh>
        <RoundedBox args={[0.13, 0.28, 0.1]} radius={0.05} position={[0, 0.22, 0]}>
          <meshBasicMaterial color="#70e0be" transparent opacity={0.58} />
        </RoundedBox>
        {[-0.045, 0.045].map((x) => (
          <mesh key={x} position={[x, 0.045, 0]} rotation={[0, 0, x < 0 ? -0.15 : 0.15]}>
            <boxGeometry args={[0.035, 0.2, 0.035]} />
            <meshBasicMaterial color="#70e0be" transparent opacity={0.48} />
          </mesh>
        ))}
      </group>
      <group ref={ripple} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <ringGeometry args={[0.27, 0.31, 40]} />
          <meshBasicMaterial ref={rippleMaterial} color="#70e0be" transparent opacity={0.3} side={DoubleSide} />
        </mesh>
      </group>
      {pulse > 0 && (
        <Html position={[0, 0.6, 0]}>
          <span className="sr-only" role="status" aria-live="polite">
            Motion detected in the entry, event {pulse}
          </span>
        </Html>
      )}
    </group>
  );
}

function DeviceMarker({
  device,
  selected,
  onSelect,
}: {
  device: HomeDevice;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const position = DEVICE_POSITIONS[device.id];
  if (!position || device.id === "front-door") return null;

  return (
    <group
      position={position}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(device.id);
      }}
    >
      <mesh visible={false}>
        <boxGeometry args={[0.82, 0.82, 0.82]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      <DeviceForm device={device} />
      {selected && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -position[1] + 0.16, 0]}>
            <ringGeometry args={[0.3, 0.36, 44]} />
            <meshBasicMaterial color="#70e0be" transparent opacity={0.9} side={DoubleSide} />
          </mesh>
          <Html center position={[0, 0.62, 0]} zIndexRange={[10, 0]}>
            <div className="scene-label">
              <span>{device.name}</span>
              <strong>{device.state}</strong>
            </div>
          </Html>
        </>
      )}
    </group>
  );
}

function CompletedRoomOverlay({
  room,
  selected,
  interactive,
  onSelect,
}: {
  room: SpatialRoom;
  selected: boolean;
  interactive: boolean;
  onSelect: (id: string) => void;
}) {
  const shape = useMemo(() => {
    const nextShape = new Shape();
    room.points.forEach((point, index) => {
      if (index === 0) nextShape.moveTo(point[0], point[2]);
      else nextShape.lineTo(point[0], point[2]);
    });
    if (room.points.length > 0) nextShape.closePath();
    return nextShape;
  }, [room.points]);
  const center = roomCentroid(room);
  const outline = room.points.map((point) => [point[0], 0.105, point[2]] as SceneVec3);
  if (outline.length > 0) outline.push([...outline[0]]);

  if (room.points.length < 3) return null;

  return (
    <group>
      <mesh
        position={[0, 0.082, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        onClick={(event) => {
          if (!interactive) return;
          event.stopPropagation();
          onSelect(room.id);
        }}
      >
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial color={room.color} transparent opacity={selected ? 0.3 : 0.14} depthWrite={false} side={DoubleSide} />
      </mesh>
      <Line
        points={outline}
        color={room.color}
        lineWidth={selected ? 2.6 : 1.6}
        transparent
        opacity={0.9}
        depthTest={false}
        raycast={() => undefined}
      />
      <Html center position={[center[0], 0.17, center[2]]} zIndexRange={[6, 0]}>
        <div className="scene-label">
          <span>Mapped room</span>
          <strong>{room.name}</strong>
        </div>
      </Html>
    </group>
  );
}

function RoomDraftOverlay({ commissioning }: { commissioning: CommissioningState }) {
  if (commissioning.kind !== "room") return null;
  const points = commissioning.points.map((point) => [point[0], 0.13, point[2]] as SceneVec3);
  const closingPoints = points.length >= 3 ? [points[points.length - 1], points[0]] : [];
  const lastPoint = points[points.length - 1];

  return (
    <group>
      {points.map((point, index) => (
        <group key={`${point[0]}-${point[2]}-${index}`} position={point}>
          <mesh raycast={() => undefined}>
            <sphereGeometry args={[index === points.length - 1 ? 0.095 : 0.075, 18, 12]} />
            <meshBasicMaterial color="#e8fff7" />
          </mesh>
          <mesh position={[0, -0.045, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => undefined}>
            <ringGeometry args={[0.13, 0.16, 28]} />
            <meshBasicMaterial color="#70e0be" transparent opacity={0.65} side={DoubleSide} />
          </mesh>
        </group>
      ))}
      {points.length >= 2 && (
        <Line
          points={points}
          color="#e8fff7"
          lineWidth={2.1}
          depthTest={false}
          raycast={() => undefined}
        />
      )}
      {closingPoints.length === 2 && (
        <Line
          points={closingPoints}
          color="#70e0be"
          lineWidth={1.2}
          dashed
          dashSize={0.16}
          gapSize={0.11}
          transparent
          opacity={0.52}
          depthTest={false}
          raycast={() => undefined}
        />
      )}
      {lastPoint && (
        <Html center position={[lastPoint[0], 0.35, lastPoint[2]]} zIndexRange={[8, 0]}>
          <div className="scene-label">
            <span>{commissioning.roomName}</span>
            <strong>{points.length} points</strong>
          </div>
        </Html>
      )}
    </group>
  );
}

function AnchoredDeviceMarker({
  anchor,
  device,
  selected,
  onSelect,
}: {
  anchor: DeviceAnchor;
  device: HomeDevice;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const position: SceneVec3 = [anchor.position[0], anchor.position[1], anchor.position[2]];

  return (
    <group
      position={position}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(device.id);
      }}
    >
      <mesh visible={false}>
        <boxGeometry args={[0.82, 0.82, 0.82]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      <DeviceForm device={device} />
      {selected && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -position[1] + 0.16, 0]}>
            <ringGeometry args={[0.3, 0.36, 44]} />
            <meshBasicMaterial color="#70e0be" transparent opacity={0.9} side={DoubleSide} />
          </mesh>
          <Html center position={[0, 0.62, 0]} zIndexRange={[10, 0]}>
            <div className="scene-label">
              <span>{device.name}</span>
              <strong>{device.state}</strong>
            </div>
          </Html>
        </>
      )}
    </group>
  );
}

function ImportedSpatialLayer({
  rooms,
  deviceAnchors,
  devices,
  selectedId,
  commissioning,
  onSelect,
}: Pick<HouseSceneProps, "rooms" | "deviceAnchors" | "devices" | "selectedId" | "commissioning" | "onSelect">) {
  return (
    <group>
      {rooms.map((room) => (
        <CompletedRoomOverlay
          key={room.id}
          room={room}
          selected={selectedId === room.id}
          interactive={commissioning.kind === "idle"}
          onSelect={onSelect}
        />
      ))}
      <RoomDraftOverlay commissioning={commissioning} />
      {commissioning.kind !== "room" &&
        deviceAnchors.map((anchor) => {
          const device = devices.find((candidate) => candidate.id === anchor.deviceId);
          if (!device) return null;
          return (
            <AnchoredDeviceMarker
              key={anchor.deviceId}
              anchor={anchor}
              device={device}
              selected={selectedId === device.id}
              onSelect={onSelect}
            />
          );
        })}
    </group>
  );
}

function ProceduralHome({ selectedId, alertActive, devices, onSelect, motionPulse }: HouseSceneProps) {
  const selectedRoom = ROOM_LAYOUT.some((room) => room.id === selectedId) ? selectedId : null;
  const selectedDevice = devices.some((device) => device.id === selectedId) ? selectedId : null;
  const walls = useMemo<Array<{ position: SceneVec3; size: SceneVec3; tone: WallTone }>>(
    () => [
      { position: [0, 1.24, -4.07], size: [12.25, 2.28, 0.18], tone: "exterior" },
      { position: [-6.05, 1.24, 0.17], size: [0.18, 2.28, 8.48], tone: "exterior" },
      { position: [6.05, 1.24, 0.17], size: [0.18, 2.28, 8.48], tone: "exterior" },
      { position: [-5.63, 0.27, 4.42], size: [0.76, 0.34, 0.18], tone: "cutaway" },
      { position: [1.1, 0.27, 4.42], size: [9.7, 0.34, 0.18], tone: "cutaway" },
      { position: [-5.0, 0.85, 2.03], size: [1.9, 1.5, 0.14], tone: "interior" },
      { position: [-2.35, 0.85, 2.03], size: [1.5, 1.5, 0.14], tone: "interior" },
      { position: [2.6, 0.85, 2.03], size: [6.6, 1.5, 0.14], tone: "interior" },
      { position: [-3, 0.85, 2.38], size: [0.14, 1.5, 0.66], tone: "interior" },
      { position: [-3, 0.85, 4.05], size: [0.14, 1.5, 0.7], tone: "interior" },
      { position: [0, 0.85, 2.38], size: [0.14, 1.5, 0.66], tone: "interior" },
      { position: [0, 0.85, 4.05], size: [0.14, 1.5, 0.7], tone: "interior" },
      { position: [0, 0.85, -2.22], size: [0.14, 1.5, 3.55], tone: "interior" },
      { position: [0, 0.85, 1.22], size: [0.14, 1.5, 1.55], tone: "interior" },
    ],
    [],
  );

  return (
    <group>
      {ROOM_LAYOUT.map((room) => (
        <RoomSlab
          key={room.id}
          room={room}
          selected={selectedRoom === room.id}
          anySelected={Boolean(selectedRoom)}
          onSelect={onSelect}
        />
      ))}
      {walls.map((wall, index) => (
        <Wall key={index} {...wall} />
      ))}
      <Furniture />
      <FrontDoor alertActive={alertActive} selected={selectedDevice === "front-door"} onSelect={onSelect} />
      <AlertRings active={alertActive} />
      <AmbientMotion pulse={motionPulse} />
      {devices.map((device) => (
        <DeviceMarker
          key={device.id}
          device={device}
          selected={selectedDevice === device.id}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

export default function HouseScene(props: HouseSceneProps) {
  return (
    <Canvas
      orthographic
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [11, 12, 14], zoom: 49, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onPointerMissed={() => props.onSelect("home")}
    >
      <color attach="background" args={["#0a1412"]} />
      <fog attach="fog" args={["#0a1412", 20, 38]} />
      <ambientLight intensity={1.25} color="#dff8ef" />
      <hemisphereLight intensity={1.35} color="#eaf7f2" groundColor="#09110f" />
      <directionalLight
        castShadow
        position={[7, 12, 8]}
        intensity={2.6}
        color="#fff4df"
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={35}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <Environment preset="apartment" environmentIntensity={0.22} />
      {props.importedModel ? (
        <>
          <ImportedHouseModel
            model={props.importedModel}
            commissioning={props.commissioning}
            onCommissionPoint={props.onCommissionPoint}
          />
          <ImportedSpatialLayer
            rooms={props.rooms}
            deviceAnchors={props.deviceAnchors}
            devices={props.devices}
            selectedId={props.selectedId}
            commissioning={props.commissioning}
            onSelect={props.onSelect}
          />
        </>
      ) : (
        <ProceduralHome {...props} />
      )}
      <ContactShadows
        position={[0, -0.08, 0]}
        opacity={0.44}
        scale={18}
        blur={2.5}
        far={8}
        resolution={512}
        frames={1}
      />
      <CameraDirector
        key={props.importedModel?.id ?? "procedural-home"}
        focusId={props.importedModel || props.selectedId === "home" ? null : props.selectedId}
        alertActive={props.importedModel ? false : props.alertActive}
        roomDrawing={Boolean(props.importedModel && props.commissioning.kind === "room")}
      />
    </Canvas>
  );
}
