# Haven architecture

## Product boundary

Haven is the presentation, spatial, commissioning, and household-security layer. Home Assistant remains the source of truth for integrations, entity state, services, history, and automations.

```text
Managed wall tablets / household browsers
                    │
          same-origin HTTPS + SSE
                    │
                 Caddy
              ┌─────┴─────┐
              │           │
          web app      Haven gateway
                           │
                  private REST + WebSocket
                           │
                    Home Assistant
```

Tablets never receive the Home Assistant token. Caddy is the only published service; the gateway container is reachable only inside the Compose network. Caddy injects a private proxy key, and the gateway also checks JSON content type and same-origin requests for mutations.

## Runtime modes

- `AUTOMATION_MODE=demo`: deterministic seeded entities; the interface visibly says Demo home.
- `AUTOMATION_MODE=live`: Home Assistant is required. Disconnection produces an offline/stale state and command failure; it never swaps in demo data.
- `NEXT_PUBLIC_AUTOMATION_SOURCE=gateway`: build-time web setting used by the Docker image. Local UI development defaults to its isolated presentation state.

## Gateway contract

```http
GET  /api/v1/health
GET  /api/v1/bootstrap
GET  /api/v1/events
POST /api/v1/actions
```

`bootstrap` returns schema version, provider identity/status, normalized entities, current active alerts, server time, and a snapshot revision. The SSE stream sends sequenced `provider.status`, `state.patch`, `motion.detected`, `security.alert`, `security.cleared`, and `command.result` events. It keeps the last 100 events for EventSource reconnection and requests a full resync when that window is missed.

Commands are semantic (`turnOn`, `setTemperature`, `lock`) rather than arbitrary Home Assistant service calls. The gateway validates action/domain pairs, entity existence, parameter ranges, and idempotent request IDs before calling an allow-listed service.

## Security rules

- Live mutations require the Caddy proxy key.
- Browser mutations must be same-origin and `application/json`.
- Containers run as non-root, read-only, without Linux capabilities, and with `no-new-privileges`.
- Unlock, disarm, cover open, and cover positioning are off by default.
- No safety-sensitive action is queued while Home Assistant is offline.
- Tokens remain server-side and `.env` is excluded from Docker build context and Git.

Before sensitive actions are enabled for customers, add opaque HttpOnly tablet sessions, household roles, CSRF tokens, rate limiting, PIN or biometric confirmation, and a persisted audit trail. Long-lived Home Assistant tokens are an installer-stage compromise; OAuth or an HA OS App supervisor token is the production target.

## Home Assistant lifecycle

The live provider loads `/api/config` and `/api/states`, then keeps one `/api/websocket` connection subscribed to `state_changed`. It normalizes incoming entities, emits state patches, and classifies door/window opening transitions as security alerts. Disconnects use bounded exponential retry with jitter.

The next registry milestone should also request Home Assistant's entity, device, area, and floor registries. Physical placement should bind primarily to stable device IDs while retaining the current entity IDs beneath each binding.

## Spatial data

The GLB contains geometry and named movable nodes. `spatial-manifest.json` contains Home Assistant bindings, positions, touch hit radii, and explicit camera poses. Keeping them separate prevents a remodel or cleaner model export from destroying device setup.

Coordinate conventions:

- one unit is one meter;
- Y is up;
- positions are `[x, y, z]`;
- rotations are quaternion `[x, y, z, w]`;
- door/window nodes have stable names;
- every alert-capable opening has a pre-commissioned camera pose.

The first model can remain procedural. A customer model pipeline is:

1. LiDAR scan with Apple RoomPlan or Polycam.
2. Export USDZ.
3. Clean mesh, simplify materials, separate doors/windows, and fix scale in Blender.
4. Export Draco/Meshopt-compressed GLB with KTX2 textures.
5. Import into Haven and tap to place/bind devices.

## Security camera direction

When an exterior opening reports open:

1. Create or deduplicate an incident for the entity.
2. Immediately announce a DOM alert.
3. Focus the precomputed opening pose once for that incident.
4. Animate the matching door/window node and apply a red architectural highlight.
5. Replace the control panel with incident details and available cameras.
6. Do not fight manual camera movement; offer Return to alert.
7. Clear the active incident when the sensor closes, while retaining history in the future SQLite store.

Reduced-motion users receive an immediate camera cut and static warning instead of tweening/pulsing.

Motion is intentionally a lower-priority ambient event. A motion transition can briefly animate a small person/path trace in the relevant room, but it must never change selection, replace the side panel, or move the camera. Only a separate security policy—such as motion while armed-away—may promote it to an interrupting incident.

## Local scan preview and commissioning

The Setup panel accepts one uncompressed GLB 2.0 file for a browser-local preview. Haven validates the header, parses it in memory, measures its bounds and triangle count, aligns it to the floor, and scales it into the scene envelope. Imported geometry replaces the procedural house; demo markers are hidden until real spatial anchors exist.

Commissioning is touch-first and operates in normalized scene coordinates. An installer names a room, traces its floor polygon from a locked top-down camera, then selects a Home Assistant entity and taps its exact location on the scan. Device-to-room membership is inferred with a boundary-inclusive point-in-polygon test. Completed rooms render as subtle overlays and only anchored devices receive 3D forms.

The spatial map is stored in browser local storage under a stable model metadata key, so importing the same GLB restores its rooms and anchors. The GLB itself remains browser-local and must be selected again after refresh. Linux-server persistence and cross-tablet synchronization remain the next commissioning milestone.

## Planned persistence

SQLite should store only Haven-owned data: homes, model versions, spatial anchors, bindings, households, sessions, encrypted OAuth tokens, settings, incident history, and audit events. It should not duplicate Home Assistant state history.

The current gateway keeps active incidents and command-idempotency records in memory. SQLite persistence, authentication, registry discovery, camera proxying, and a commissioning API are intentionally the next implementation stage.
