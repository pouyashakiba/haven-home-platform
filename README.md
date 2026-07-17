# Haven

Haven is a local-first, spatial home interface built on top of Home Assistant. Its opening screen is designed for wall tablets: a touch-friendly 3D home, a complete device list, clear household modes, and an incident view that focuses the affected door or window when a security event occurs.

This repository contains the first working milestone, not a finished appliance. The polished tablet interface, procedural demo house, security focus flow, local Home Assistant gateway, and Linux deployment foundation are implemented.

## What works now

- Responsive dark architectural UI for landscape tablets, portrait tablets, and phones.
- Interactive Three.js dollhouse with orbit, zoom, room selection, device selection, and deterministic focus poses.
- Recognizable low-poly lights, cameras, thermostats, shades, motion sensors, and a smart-lock keypad instead of generic circular markers.
- Ambient motion events show a brief path inside the room without moving the camera, changing selection, or interrupting the current task.
- Equivalent device controls outside WebGL for accessibility and reliability.
- Security simulation that opens and highlights the front door, moves the camera, shows an assertive alert, and provides acknowledge/secure actions.
- Explicit demo and live modes. A failed live connection never silently becomes demo data.
- Same-origin gateway contract with Home Assistant REST bootstrap, WebSocket state updates, semantic command allow-listing, SSE event replay, and reconnect backoff.
- Docker Compose deployment with Caddy local TLS. Home Assistant credentials stay in the gateway, never in the tablet bundle.
- Optional official open-source Home Assistant Container bundled for a complete single-Linux-server installation.
- Local GLB house-scan preview with header validation, geometry measurement, automatic centering/scaling, and safe model limits.
- Native iOS RoomPlan companion with live LiDAR detections, Vision-assisted smart-object confirmation, multi-room capture, secure local upload, automatic website return, and persistent 3D device anchors.
- Home Assistant entity/device/area registry discovery with media players, switches, keypads, fans, covers, climate devices, and hardware metadata available for spatial assignment.
- Sensitive operations such as unlock, disarm, and opening covers are disabled by default.

## Local development

Prerequisites: Bun 1.3+, Node.js 22+, and a browser with WebGL.

```bash
bun install
bun run dev
```

The development build uses deterministic presentation data unless `NEXT_PUBLIC_AUTOMATION_SOURCE=gateway` is set when the web app is built.

To exercise the gateway independently:

```bash
AUTOMATION_MODE=demo bun run gateway
```

Useful checks:

```bash
bun run typecheck
bun run build
bun run test
```

## Native LiDAR scanner

The website includes **Scan home** for LiDAR-equipped iPhones and iPad Pros. It opens the native SwiftUI companion, displays Apple RoomPlan detections live, and proposes smart TVs, speakers, wall switches, keypads, blinds, and thermostats for confirmation. Accepted devices retain their LiDAR position and render as symbolic 3D models after upload. Haven then offers compatible Home Assistant entities for each detected object. Completed scans and assignments remain in the Docker `scan_data` volume.

Mac/Xcode setup, signing, physical-phone installation, end-to-end testing, troubleshooting, and a ready-made prompt for a second Codex session are in [docs/IOS-LIDAR-SCANNER.md](docs/IOS-LIDAR-SCANNER.md).

## Run on the in-house Linux server

For the complete Home Assistant + Haven installation, follow [docs/LINUX-INSTALL.md](docs/LINUX-INSTALL.md). It runs the official `ghcr.io/home-assistant/home-assistant:stable` automation engine beside Haven.

1. Create the server configuration:

   ```bash
   cp .env.example .env
   openssl rand -hex 32
   ```

   Put the generated value in `HAVEN_PROXY_KEY`. Do not commit `.env`.

2. Start the safe demo appliance:

   ```bash
   docker compose up --build -d
   ```

3. Add a local DNS record for `haven.home.arpa` pointing to the Linux server.

4. Install Caddy's local root certificate on each managed tablet so the PWA has trusted HTTPS:

   ```bash
   docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./haven-root-ca.crt
   ```

5. Open `https://haven.home.arpa` and put the browser into kiosk/full-screen mode.

   For a quick LAN test before local DNS and the tablet certificate are configured,
   open `http://SERVER_LAN_IP:8080` instead. This is Haven's temporary HTTP
   commissioning endpoint; Home Assistant remains at `http://SERVER_LAN_IP:8123`.

## Connect Home Assistant

Edit `.env` on the Linux server:

```dotenv
AUTOMATION_MODE=live
HA_URL=http://host.docker.internal:8123
HA_TOKEN=your-dedicated-non-admin-token
ALLOW_SENSITIVE_ACTIONS=false
```

Use the Linux server's reachable address or a normal LAN DNS name when Home Assistant runs on another machine; Docker containers usually cannot resolve mDNS names such as `homeassistant.local`. Restart with `docker compose up -d --build`.

For this milestone, a dedicated non-admin long-lived token is supported for installation. The production customer flow should use Home Assistant OAuth or a Home Assistant OS App with `SUPERVISOR_TOKEN`. The gateway follows Home Assistant's official [REST API](https://developers.home-assistant.io/docs/api/rest/), [WebSocket API](https://developers.home-assistant.io/docs/api/websocket/), and [authentication guidance](https://developers.home-assistant.io/docs/auth_api/).

Only set `ALLOW_SENSITIVE_ACTIONS=true` after household authentication, PIN confirmation, rate limiting, and installer review are enabled. Closing/locking actions remain available without this switch; unlocking, disarming, opening covers, and setting cover position do not.

## Cheapest practical 3D-home workflow

For tonight, scan with Polycam Space/LiDAR mode, export a single Y-up GLB, then open Haven's Setup screen and choose **My 3D house → Choose a house GLB**. The file is validated and rendered locally. If Polycam only gives you GLTF, or Apple RoomPlan gives you USDZ, convert it with free Blender first.

Follow the exact [model-scan quick start](docs/MODEL-SCAN-QUICKSTART.md), including export settings and troubleshooting.

After import, choose **Set up map**. Name each room and tap its floor corners from the top-down view, then choose a Home Assistant device and tap its exact 3D location. Haven automatically assigns that point to its containing room and renders the correct device form. The browser saves these room polygons and anchors and restores them when the same GLB is imported again; the model and map are not yet shared through the Linux server to other tablets.

Tonight's target is below 25 MB and 300k triangles; files above 100 MB are rejected. Draco, Meshopt, and KTX2 decoders are not bundled yet, so use an uncompressed GLB for this test. The later production budget remains below 15 MB and 150k triangles.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/spatial-manifest.example.json](docs/spatial-manifest.example.json) for the implementation contract.

## Next milestones

1. Persist imported models and the completed room/device map on the Linux server for every tablet.
2. Complete registry discovery for Home Assistant areas, devices, floors, and renamed entities.
3. Add household accounts, tablet sessions, PIN-confirmed sensitive actions, and audit history.
4. Persist alerts, anchors, settings, and encrypted OAuth tokens in SQLite.
5. Add camera streaming, model compression, offline PWA caching, automated backups, and Home Assistant OS App packaging.

The main UI lives in `app/components/HomeDashboard.tsx`, the 3D scene in `app/components/HouseScene.tsx`, and the local gateway in `gateway/server.mjs`.
