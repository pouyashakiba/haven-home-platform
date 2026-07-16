"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useEffect } from "react";
import type { LocalHouseModel } from "../lib/house-model";
import type { Vec3 } from "../lib/spatial-config";
import type { CommissioningState } from "./HouseScene";

export function ImportedHouseModel({
  model,
  commissioning,
  onCommissionPoint,
}: {
  model: LocalHouseModel;
  commissioning: CommissioningState;
  onCommissionPoint: (point: Vec3) => void;
}) {
  const interactive = commissioning.kind !== "idle";

  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );

  function handleSurfaceClick(event: ThreeEvent<MouseEvent>) {
    if (!interactive) return;
    event.stopPropagation();
    const { x, y, z } = event.point;
    onCommissionPoint(commissioning.kind === "room" ? [x, 0.07, z] : [x, y + 0.035, z]);
  }

  return (
    <group position={model.position} scale={model.scale}>
      <primitive
        object={model.scene}
        onClick={handleSurfaceClick}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          if (!interactive) return;
          event.stopPropagation();
          document.body.style.cursor = "crosshair";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      />
    </group>
  );
}
