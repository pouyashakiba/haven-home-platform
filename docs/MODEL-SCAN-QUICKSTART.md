# Scan your home tonight

This is the shortest path from an iPhone/iPad scan to a model you can preview in Haven. Allow roughly 20–40 minutes for a small home, plus processing time.

## What you need

- Best result: a LiDAR-equipped iPhone Pro or iPad Pro with [Polycam](https://learn.poly.cam/hc/en-us/articles/36655587097620-How-to-Use-Space-Mode).
- Free desktop conversion: [Blender](https://www.blender.org/download/).
- Final file: one **uncompressed GLB 2.0**, exported **Y-up**.

Haven currently accepts one `.glb` up to 100 MB. For smooth tablet use, aim for **under 25 MB and under 300,000 triangles**. Draco, Meshopt, and KTX2-compressed files are not supported by tonight's importer.

## 1. Scan with Polycam Space Mode

1. Turn on all lights, clear the walking route, and open every door you want included before starting.
2. Reduce reflections: cover or avoid large mirrors and glass. Avoid hard direct sunlight.
3. In Polycam, tap **+ → Space** and keep the floorplan option enabled.
4. Start at the entrance. Walk slowly around the perimeter, point into corners and doorways, then cover the center of each room. Rotate the phone slowly.
5. Before finishing, fill remaining blue/unscanned areas and check that walls and corners are complete.
6. Process using **Space** for straightened room geometry. Crop away outdoor fragments and unwanted geometry.

Polycam documents that Space Mode is intended for rooms and full homes, and recommends clear paths, open doors, even lighting, slow movement, and avoiding reflective surfaces. See its [Space Mode instructions](https://learn.poly.cam/hc/en-us/articles/36655587097620-How-to-Use-Space-Mode) and [capture-mode comparison](https://learn.poly.cam/hc/en-us/articles/48565771018772-Which-Capture-Mode-Should-I-Use).

## 2. Export a Haven-ready GLB

Open the processed capture, select **Download/Export**, and use these settings when available:

- Format: **GLB** (single binary glTF file)
- Up axis: **Y-up**
- Units: meters
- Geometry/material compression: **off**
- Texture resolution: 1K or 2K for a tablet preview

Polycam says export settings include an up-axis choice and recommends changing it when a model imports sideways; its current export steps are [documented here](https://learn.poly.cam/hc/en-us/articles/29647691255316-How-to-Export-Polycam-Captures). Export availability varies by plan: the free plan currently provides GLTF, while paid tiers expose more formats; see [Polycam's format table](https://learn.poly.cam/hc/en-us/articles/27756102599572-What-File-Types-Can-Polycam-Export).

If Polycam gives you a single `.glb`, skip to step 4. If it gives you `.gltf`, `.bin`, and texture files, convert them below.

## 3A. Free GLTF → single GLB in Blender

1. Extract the entire Polycam download into one folder. Keep the `.gltf`, `.bin`, and all textures together.
2. In Blender, choose **File → Import → glTF 2.0** and select the `.gltf`.
3. Press `A` to select everything, then **Object → Apply → Rotation & Scale**.
4. If the model is dense, add a **Decimate** modifier in Collapse mode and lower the ratio gradually while checking walls and door openings.
5. Choose **File → Export → glTF 2.0**.
6. Set **Format: glTF Binary (.glb)**, enable **Y Up** and **Apply Modifiers**, and leave Draco compression disabled.
7. Export as one `.glb` file.

Blender's glTF exporter confirms that **glTF Binary** packs geometry and textures into one GLB and exports using the glTF **+Y-up** convention. See the official [Blender glTF guide](https://docs.blender.org/manual/en/3.3/addons/import_export/scene_gltf2.html). Its [Decimate modifier](https://docs.blender.org/manual/en/5.0/modeling/modifiers/generate/decimate.html) reduces face count with minimal shape change.

## 3B. Apple RoomPlan USDZ → GLB in Blender

Apple RoomPlan creates a parametric room model in USD or USDZ, including recognized walls, furniture, and dimensions; see Apple's [RoomPlan overview](https://developer.apple.com/augmented-reality/roomplan/).

1. Export/AirDrop the RoomPlan `.usdz` to your computer.
2. In Blender, save a new `.blend`, then choose **File → Import → Universal Scene Description** and select the USDZ.
3. Enable **Apply Unit Conversion Scale**. Set **Import Textures** to **Packed** so textures remain available.
4. Select everything and apply **Rotation & Scale**. Remove unwanted cameras, annotations, or duplicate geometry if present.
5. Export using the same **glTF Binary (.glb)**, **Y Up**, **Apply Modifiers**, and no-compression settings above.

Blender officially supports USDZ import, unit conversion, and packed texture import; material conversion can be approximate. See the [Blender USD documentation](https://docs.blender.org/manual/en/dev/files/import_export/usd.html).

## 4. Preview it in Haven

1. Open Haven on the tablet or computer that contains the GLB.
2. Go to **Setup → My 3D house**.
3. Select **Choose a house GLB**, pick the file, and wait while Haven validates, centers, and scales it.
4. Tap **View**. Use **My scan / Demo** above the 3D view to switch models.

## 5. Map rooms and place devices

The GLB is a visual mesh and normally does not contain trustworthy room names or boundaries. Haven therefore uses a short, installer-confirmed mapping step instead of guessing.

1. Tap **Set up map** over the imported scan, or open **Setup → Map rooms & devices**.
2. Enter a room name and tap **Draw**. The camera switches to a locked top-down view.
3. Tap the room's floor corners in order. Use **Undo** if needed, then **Finish room** after at least three points.
4. Repeat for every room. Concave rooms can use more than four points.
5. Under **Devices**, choose **Place** beside a Home Assistant entity.
6. Orbit to the correct view and tap the device's exact surface location. Haven automatically assigns it to the room polygon containing that point.
7. Use **Reposition** or the remove-placement button whenever a location needs correction.

Room boundaries and device anchors are saved in that tablet browser and restored when the same GLB is imported again. The GLB itself is still selected locally after each refresh and the map is **not yet synchronized to the Linux server or other tablets**; server-wide persistence is the next deployment milestone.

## Fast troubleshooting

| Problem | Fix |
| --- | --- |
| Model is sideways | Re-export from Polycam with **Y-up**. In Blender, rotate it upright, apply **Rotation & Scale**, then export with **Y Up** enabled. |
| Model is black or textures are missing | For GLTF, re-import with the `.gltf`, `.bin`, and texture files in the same folder. For USDZ, import textures as **Packed**. Verify materials in Blender's Material Preview, then export one GLB. If only some faces are black, select the mesh in Edit Mode and use **Mesh → Normals → Recalculate Outside**. |
| File is too large or tablet is slow | Crop unused scan data in Polycam. In Blender, use Decimate carefully and resize large textures to 1K/2K. Target under **25 MB / 300k triangles**; 100 MB is the hard limit. |
| Haven reports Draco, Meshopt, or KTX2 | Re-export from Blender with geometry compression/Draco disabled and ordinary PNG/JPEG textures. A larger uncompressed GLB is expected for tonight's test. |
| GLB is rejected as invalid | Ensure the export format is **glTF Binary (.glb)**, not a renamed `.gltf` or a zip. Re-export from Blender and try again. |
| Walls are incomplete or distorted | Rescan with all doors already open, all lights on, slower motion, complete corner coverage, and mirrors/glass avoided or covered. |
