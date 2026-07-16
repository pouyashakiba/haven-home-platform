import type { Material, Object3D, Texture } from "three";

export type LocalHouseModel = {
  id: string;
  name: string;
  scene: Object3D;
  position: [number, number, number];
  scale: number;
  totalBytes: number;
  triangleCount: number;
};

const GLB_MAGIC = 0x46546c67;
const MAX_PREVIEW_BYTES = 100 * 1024 * 1024;

export async function loadLocalHouseModel(file: File) {
  if (!file.name.toLowerCase().endsWith(".glb")) {
    throw new Error("Choose a single GLB file. Convert Polycam GLTF or RoomPlan USDZ to GLB in Blender first.");
  }
  if (file.size > MAX_PREVIEW_BYTES) {
    throw new Error("This scan is over 100 MB. Simplify it in Polycam or Blender before loading it on a tablet.");
  }

  const header = await file.slice(0, 12).arrayBuffer();
  if (header.byteLength !== 12) throw new Error("The selected file is incomplete.");
  const view = new DataView(header);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) {
    throw new Error("This is not a valid GLB 2.0 file.");
  }

  const [{ GLTFLoader }, { Box3, MathUtils, Mesh, Vector3 }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three"),
  ]);

  let scene: Object3D | null = null;
  try {
    const gltf = await new GLTFLoader().parseAsync(await file.arrayBuffer(), "");
    scene = gltf.scene;
    scene.updateMatrixWorld(true);

    const bounds = new Box3().setFromObject(scene);
    if (bounds.isEmpty()) throw new Error("The GLB does not contain visible house geometry.");
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    if (![size.x, size.y, size.z, center.x, center.y, center.z].every(Number.isFinite)) {
      throw new Error("The model contains invalid dimensions.");
    }

    let triangleCount = 0;
    scene.traverse((object) => {
      const mesh = object as InstanceType<typeof Mesh>;
      if (!mesh.isMesh || !mesh.geometry) return;
      const count = mesh.geometry.index?.count ?? mesh.geometry.attributes.position?.count ?? 0;
      triangleCount += Math.floor(count / 3);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    const footprint = Math.max(size.x, size.z, 0.001);
    const scale = MathUtils.clamp(11.2 / footprint, 0.02, 20);
    const model: LocalHouseModel = {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.glb$/i, ""),
      scene,
      position: [-center.x * scale, -bounds.min.y * scale + 0.03, -center.z * scale],
      scale,
      totalBytes: file.size,
      triangleCount,
    };

    const warnings = [];
    if (file.size > 25 * 1024 * 1024) warnings.push("larger than 25 MB");
    if (triangleCount > 300_000) warnings.push("over 300k triangles");
    return {
      model,
      warning: warnings.length
        ? `The scan loaded, but it is ${warnings.join(" and ")}. Optimize it before using it on every tablet.`
        : undefined,
    };
  } catch (error) {
    if (scene) disposeScene(scene);
    if (error instanceof Error && /DRACO|KTX2|meshopt/i.test(error.message)) {
      throw new Error("This GLB uses external compression. Re-export it without Draco, Meshopt, or KTX2 for tonight's local test.");
    }
    throw error instanceof Error ? error : new Error("The GLB could not be parsed.");
  }
}

function disposeScene(scene: Object3D) {
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const geometries = new Set<{ dispose: () => void }>();

  scene.traverse((object) => {
    const candidate = object as Object3D & {
      geometry?: { dispose: () => void };
      material?: Material | Material[];
    };
    if (candidate.geometry) geometries.add(candidate.geometry);
    const objectMaterials = Array.isArray(candidate.material) ? candidate.material : candidate.material ? [candidate.material] : [];
    for (const material of objectMaterials) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value && typeof value === "object" && "isTexture" in value && value.isTexture) textures.add(value as Texture);
      }
    }
  });

  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) {
    const image = texture.image;
    texture.dispose();
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
  }
}

export function releaseLocalHouseModel(model: LocalHouseModel | null) {
  if (model) disposeScene(model.scene);
}

export function formatModelSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function formatTriangleCount(count: number) {
  return count >= 1000 ? `${Math.round(count / 1000)}k triangles` : `${count} triangles`;
}
