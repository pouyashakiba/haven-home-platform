# Haven Scanner: Mac setup and iPhone installation

This is the handoff for installing the native Haven Scanner from a Mac. Haven opens it with a private session, Apple RoomPlan shows LiDAR detections live, the user scans one or more rooms, and the app sends a semantic floor plan back to the local gateway before reopening the website.

## What is included

- A native SwiftUI iOS 17 app at `ios/HavenScanner/HavenScanner.xcodeproj`.
- Apple RoomPlan camera overlays and a live tray for walls, doors, windows, openings, floors, and recognized objects.
- On-device Vision analysis for smart TVs, speakers, wall switches, keypads, blinds, and thermostats, with a non-blocking Add/Ignore confirmation card.
- Multi-room capture with room naming.
- A `havenscanner://scan` deep link launched by the website.
- A short-lived bearer-token handoff. The app never receives Home Assistant credentials or the Haven proxy key.
- Direct LAN upload to `/api/v1/scans/:id`, followed by automatic return to the website.
- Persistent scan storage in Docker volume `scan_data`, category-specific symbolic 3D models, and saved Home Assistant assignments.

The app has no third-party iOS packages. RoomPlan, ARKit, Vision, SwiftUI, and URLSession are supplied by Apple.

## Smart-object detection

RoomPlan directly supplies television and window geometry. Haven proposes televisions as smart TVs and windows as possible smart blinds. During the same AR session, Apple Vision analyzes a throttled stream of salient camera regions for speakers, switches, keypads, blinds, thermostats, and televisions. A candidate must be observed repeatedly and receive a valid LiDAR raycast before Haven asks the user to add it.

The confirmation card is intentionally non-blocking. **Add to plan** stores category, confidence, dimensions, the full world transform, source, and any matching RoomPlan element. **Not this object** suppresses that candidate. Confirmed objects are uploaded in the room's shared AR coordinate space.

Vision classification is an installer aid, not proof that an object is network-connected or smart. Small controls require good lighting and a close, steady pass. Haven always requires confirmation and completes identity by matching the accepted object to a Home Assistant entity on the website.

## Requirements

- A Mac with Xcode 16 or newer.
- An Apple ID added to Xcode. A free personal team is enough for testing on your own phone, but its build normally expires after seven days.
- A physical LiDAR-equipped iPhone or iPad Pro on iOS/iPadOS 17 or newer.
- Developer Mode enabled on the device.
- The Mac, phone, and Haven server on the same LAN.
- The updated Haven Docker stack running from `master`.

RoomPlan cannot be meaningfully tested in the iOS Simulator because it has no LiDAR sensor.

## 1. Update the Haven server

On the Linux host:

```bash
git fetch origin
git checkout master
git pull --ff-only origin master
docker compose up -d --build
docker compose ps
```

Do not remove the new `scan_data` Docker volume. It stores completed scan JSON across container recreation.

Verify the site from the phone in Safari:

- Preferred: `https://haven.home.arpa`
- LAN commissioning: `http://10.0.0.40:8080`

The address opened in Safari becomes the upload and callback origin. The iOS project has no hard-coded server IP.

## 2. Open and configure the iOS project

```bash
git clone https://github.com/pouyashakiba/haven-home-platform.git
cd haven-home-platform
git checkout master
git pull --ff-only origin master
open ios/HavenScanner/HavenScanner.xcodeproj
```

In Xcode:

1. Select the blue **HavenScanner** project.
2. Select the **HavenScanner** target and open **Signing & Capabilities**.
3. Enable **Automatically manage signing**.
4. Choose the user's Apple development team.
5. If `com.haven.scanner` is unavailable, use a unique bundle identifier such as `com.<your-name>.haven-scanner`.
6. Keep the deployment target at iOS 17 or later.

Do not put environment variables, API keys, Home Assistant tokens, or a server URL into Xcode.

## 3. Install on the phone

1. Connect the device to the Mac once with a cable and choose **Trust** on both devices.
2. Enable **Settings → Privacy & Security → Developer Mode** on the device, then restart when prompted.
3. In Xcode's run-destination menu, choose the physical device—not a simulator.
4. Press **Run** (`⌘R`). Xcode signs, installs, and launches Haven Scanner.
5. Accept camera and local-network permissions.

If iOS requests developer-profile trust, open **Settings → General → VPN & Device Management**, select the development profile, and trust it.

Optional unsigned compile check:

```bash
xcodebuild \
  -project ios/HavenScanner/HavenScanner.xcodeproj \
  -scheme HavenScanner \
  -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Use Xcode for the signed install so it can create or refresh provisioning for the connected Apple ID.

## 4. Test the full workflow

1. Leave Haven Scanner installed; it may be closed.
2. Open Haven in Safari on the same phone.
3. Tap **Scan home** in the scene toolbar, or **Settings → Scan with LiDAR → Start LiDAR scan**.
4. Safari opens the installed app and scanning begins.
5. Move slowly around the room. RoomPlan overlays geometry while Haven's bottom tray updates every structural count and object category live. Move closer to wall controls so Vision can classify them.
6. When a smart-object card appears, verify the object and choose **Add to plan** or **Not this object**. The card does not pause scanning.
7. Tap **Finish this room**.
8. Name it. Choose **Scan another room** or **Finish home and return**.
9. The app uploads the semantic model and reopens Haven with the completed scan ID.
10. Haven shows the RoomPlan model and symbolic smart objects. In **Setup → Scan with LiDAR**, assign each confirmed object to a recommended Home Assistant entity.

Each pending handoff expires after 30 minutes. Start a fresh scan if it expires.

## Architecture and security

```text
Safari / Haven
  POST /api/v1/scans
        │ one-time session + havenscanner:// link
        ▼
Haven Scanner / RoomPlan
  live CapturedRoom → native detection tray
  final rooms → semantic JSON
        │ PUT /api/v1/scans/:id + short-lived bearer token
        ▼
Haven gateway
  validate → /data/scans → scan.completed
        │
        ▼
callback?scan=:id → Haven fetches and renders the floor plan
```

- Tokens are random and stored only as SHA-256 hashes on the server.
- The callback must use the same origin as the Haven server that created it.
- Uploads are limited to 5 MB, 100 rooms, 10,000 elements, and finite dimensions/transforms.
- Pending links expire after 30 minutes; completed scans remain in `scan_data`.
- Home Assistant credentials stay in the gateway.
- A custom URL scheme is used because the commissioning route can be a local HTTP IP. A public HTTPS deployment can later use Universal Links.

## Troubleshooting

### The website does not open the app

- Confirm Haven Scanner is installed on the same phone.
- Open it manually once, return to Safari, and tap **Scan home** again.
- Confirm `HavenScanner/Info.plist` still registers `havenscanner`.
- Reinstall after changing the bundle identifier or URL scheme.

### “LiDAR required” appears

Use a physical LiDAR-equipped device on iOS 17 or later. A simulator always fails `RoomCaptureSession.isSupported`.

### Scanning works but upload fails

- Open the exact Haven URL in Safari on the phone. If Safari cannot reach it, the app cannot either.
- In **Settings → Privacy & Security → Local Network**, allow Haven Scanner.
- Confirm the phone and server are on the same LAN/VLAN and client isolation is disabled.
- Rebuild Docker so `/api/v1/scans` and `scan_data` exist.
- Start a new scan after a 30-minute timeout.
- Prefer `https://haven.home.arpa` with Haven's Caddy certificate. `http://10.0.0.40:8080` is supported for local commissioning by the app's ATS configuration.

### Haven returns without showing the scan

```bash
docker compose logs --tail=150 gateway caddy
docker volume ls | grep scan_data
```

The callback must contain `?scan=<UUID>`. Errors such as `scan_not_found`, `invalid_scan_token`, `invalid_scan_schema`, or `scan_expired` identify the rejected stage.

### Xcode signing fails

- Select a team and unique bundle identifier.
- Confirm the phone is unlocked, trusted, and in Developer Mode.
- Let Xcode manage signing and run again with the physical device selected.
- On a managed phone, confirm MDM permits developer apps.

## Prompt for the next Codex session on the Mac

Paste this from the repository root:

> Read `docs/IOS-LIDAR-SCANNER.md` completely. Pull the latest `master`, inspect the working tree, and verify the iOS project with `xcodebuild` without signing first. Then help me select my Apple development team and unique bundle identifier in `ios/HavenScanner/HavenScanner.xcodeproj`, detect my connected LiDAR iPhone, build and install Haven Scanner on it through Xcode, and test the full Safari → app → live smart-object confirmation → RoomPlan scan → local Haven upload → Home Assistant assignment → Safari return flow. Do not put secrets or a fixed server IP into the app. Stop and ask me only when Apple signing, trust, or physical-device confirmation requires my interaction.

The next session should not recreate the project or turn it into a web scanner. Native RoomPlan is required for iPhone/iPad LiDAR access.

## Important files

- `ios/HavenScanner/HavenScanner/ScannerRootView.swift`: scanning and live-detection UI.
- `ios/HavenScanner/HavenScanner/RoomCaptureContainer.swift`: RoomPlan delegates and processing.
- `ios/HavenScanner/HavenScanner/SmartObjectDetection.swift`: RoomPlan/Vision fusion, LiDAR anchoring, repeated-observation tracking, and target categories.
- `ios/HavenScanner/HavenScanner/ScanBundle.swift`: floor-plan JSON contract.
- `ios/HavenScanner/HavenScanner/ScanTransferClient.swift`: authenticated LAN upload.
- `app/lib/lidar-scan.ts`: website API and smart suggestions.
- `app/components/ScannedHomeModel.tsx`: parametric renderer.
- `gateway/scan-store.mjs`: handoff and persistent storage.
