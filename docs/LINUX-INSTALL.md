# Haven + Home Assistant on a Linux server

This is the fastest supported route for running Haven on a normal 64-bit Linux server tonight. It uses the official `ghcr.io/home-assistant/home-assistant:stable` container as the automation engine and runs Haven's UI, local gateway, and HTTPS proxy beside it.

Home Assistant remains responsible for integrations, entities, automations, history, scenes, and device communication. Haven is the visual control surface and spatial layer. The browser never receives the Home Assistant access token.

## What this installation is

This bundle uses **Home Assistant Container**, one of Home Assistant's two supported installation methods. It runs the same open-source Home Assistant software and integrations as Home Assistant OS, but it does not include Supervisor or the Home Assistant app store. You maintain Linux, Docker, updates, MQTT, Zigbee2MQTT, and any other companion containers yourself.

Home Assistant OS is the more appliance-like option and is officially recommended for most users. If this Linux machine is dedicated only to home automation, consider running Home Assistant OS directly or in a VM and running Haven separately. Do not try to install Home Assistant OS as a Docker container.

Official references:

- [Home Assistant Container on Linux](https://www.home-assistant.io/installation/linux/)
- [Home Assistant OS versus Container](https://www.home-assistant.io/faq/ha-vs-hassio/)
- [Home Assistant REST API and access tokens](https://developers.home-assistant.io/docs/api/rest/)

## 1. Prepare the Linux host

Use a 64-bit Debian- or Ubuntu-family server with Docker Engine 23 or newer and the Docker Compose plugin. Docker Desktop is not supported for Home Assistant Container. A wired Ethernet connection, a DHCP reservation/static LAN address, 4 GB RAM, and an SSD are sensible practical starting points for Haven plus Home Assistant.

Clone or copy this repository to the server, then run these commands from its root:

```bash
cd /path/to/3d-automation

cp home-assistant/haven.env.example .env.home-assistant
nano .env.home-assistant
```

Generate a different internal gateway key and paste it over the placeholder value in `.env.home-assistant`:

```bash
openssl rand -hex 32
```

Set `TZ` to the house's [tz database name](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones), such as `Europe/London` or `America/New_York`. Leave `ALLOW_SENSITIVE_ACTIONS=false` for the first test; this prevents Haven from unlocking doors, disarming alarms, or opening covers.

Prepare the persistent configuration and private token file:

```bash
mkdir -p home-assistant/config home-assistant/secrets
chmod 700 home-assistant/secrets
umask 077
: > home-assistant/secrets/haven_gateway_token
chmod 644 home-assistant/secrets/haven_gateway_token
chmod 600 .env.home-assistant
```

Everything under `home-assistant/config` survives container replacement. Both that directory and the token file are excluded from Git.

Validate the combined Compose configuration before downloading anything:

```bash
docker compose \
  --env-file .env.home-assistant \
  -f docker-compose.yml \
  -f docker-compose.home-assistant.yml \
  config >/dev/null
```

## 2. Start Home Assistant and complete onboarding

Pull and start only Home Assistant first:

```bash
docker compose \
  --env-file .env.home-assistant \
  -f docker-compose.yml \
  -f docker-compose.home-assistant.yml \
  pull homeassistant

docker compose \
  --env-file .env.home-assistant \
  -f docker-compose.yml \
  -f docker-compose.home-assistant.yml \
  up -d homeassistant

docker compose \
  --env-file .env.home-assistant \
  -f docker-compose.yml \
  -f docker-compose.home-assistant.yml \
  logs -f homeassistant
```

The first startup can take several minutes. When the log is ready, browse to:

```text
http://SERVER_LAN_IP:8123
```

Complete Home Assistant onboarding. Use an accurate home location, unit system, and time zone. Add one simple integration or light first so the live connection is easy to confirm.

Home Assistant uses `network_mode: host` because local discovery protocols such as mDNS, SSDP, and multicast need direct LAN access. This also means port `8123` is exposed directly on the Linux host; do not forward it from the internet.

If UFW is enabled, allow the local subnet, replacing the example subnet with yours:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 8123 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 8080 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

## 3. Create the Haven gateway token

For the first test, create a dedicated non-owner Home Assistant user named `Haven Gateway`. Log in as that user, open its profile page, scroll to **Long-Lived Access Tokens**, and create a token named `Haven local gateway`. A token inherits that user's permissions, so avoid using the owner's token.

Home Assistant shows the token only once. Paste only the token into this file; do not put it in a browser, source file, chat message, or shell command:

```bash
nano home-assistant/secrets/haven_gateway_token
chmod 644 home-assistant/secrets/haven_gateway_token
```

The gateway receives it as a read-only Docker secret at runtime. It is not baked into an image, sent to Haven's web client, or stored in the Compose environment. The token file itself is readable by the gateway's non-root process, while the `home-assistant/secrets` directory stays mode `700`, preventing other host users from reaching it.

## 4. Start the complete Haven stack

```bash
docker compose \
  --env-file .env.home-assistant \
  -f docker-compose.yml \
  -f docker-compose.home-assistant.yml \
  up -d --build

docker compose \
  --env-file .env.home-assistant \
  -f docker-compose.yml \
  -f docker-compose.home-assistant.yml \
  ps
```

Confirm that the gateway reached Home Assistant:

```bash
curl -k \
  --resolve haven.home.arpa:443:127.0.0.1 \
  https://haven.home.arpa/api/v1/health
```

The JSON response should contain `"mode":"live"` and `"providerStatus":"online"`. If it says `offline`, inspect both services:

```bash
docker compose \
  --env-file .env.home-assistant \
  -f docker-compose.yml \
  -f docker-compose.home-assistant.yml \
  logs --tail=200 homeassistant gateway
```

## 5. Local DNS and trusted HTTPS

Reserve the server's LAN IP in the router. In the router, Pi-hole, AdGuard Home, or other local DNS server, add:

```text
haven.home.arpa  ->  SERVER_LAN_IP
```

Then open `https://haven.home.arpa` from a tablet. Caddy creates a private local certificate authority, so each wall tablet must trust its root certificate once. Copy only the public root certificate out of the Caddy container:

```bash
docker compose \
  --env-file .env.home-assistant \
  -f docker-compose.yml \
  -f docker-compose.home-assistant.yml \
  cp caddy:/data/caddy/pki/authorities/local/root.crt ./haven-local-root-ca.crt
```

Install `haven-local-root-ca.crt` as a trusted root certificate on each dedicated tablet. On iPad/iPhone, install the profile and then enable full trust under **Settings > General > About > Certificate Trust Settings**. Keep the private CA key inside the Caddy data volume and never copy or distribute it.

For the first-night test, you can use a hosts-file entry instead of local DNS on computers that support it:

```text
SERVER_LAN_IP  haven.home.arpa
```

The Home Assistant administration UI remains at `http://SERVER_LAN_IP:8123` on the trusted LAN. Haven itself is served through local HTTPS. Do not create router port-forwarding rules for ports 80, 443, or 8123; use a VPN or Home Assistant Cloud for remote access later.

### Quick IP-only commissioning

Before local DNS and the Caddy certificate are configured on tablets, Haven is
also available on the trusted LAN at:

```text
http://SERVER_LAN_IP:8080
```

This is the Haven 3D panel, not Home Assistant. It is intended only for
initial local commissioning because it is plain HTTP. Home Assistant's admin
panel remains at `http://SERVER_LAN_IP:8123`.

## 6. Zigbee, Z-Wave, and Bluetooth

The Compose file follows Home Assistant's official Container example: it uses host networking, privileged device access, and a read-only `/run/dbus` mount. The D-Bus mount is needed for the Bluetooth integration.

`privileged: true` is intentionally the official, compatibility-first choice for this initial installation, but it is broad host access. Install only trusted integrations and custom components. After the radios and integrations are stable, the container can be hardened by removing privileged mode and mapping only the required `/dev/serial/by-id/...` devices; retest discovery and Bluetooth after doing so.

List stable serial-device names before configuring a Zigbee or Z-Wave coordinator:

```bash
ls -l /dev/serial/by-id/
```

In Home Assistant, select the `/dev/serial/by-id/...` path instead of `/dev/ttyUSB0`; the latter can change after a reboot. For the simplest test, use Home Assistant's built-in ZHA integration with the coordinator directly.

If you prefer Zigbee2MQTT, remember that Home Assistant Container has no app store: Mosquitto and Zigbee2MQTT must run as separate containers. They are intentionally not included in this first-night bundle so there is only one radio owner and fewer failure points.

## 7. Operations and safety

Show status:

```bash
docker compose --env-file .env.home-assistant -f docker-compose.yml -f docker-compose.home-assistant.yml ps
```

Restart everything:

```bash
docker compose --env-file .env.home-assistant -f docker-compose.yml -f docker-compose.home-assistant.yml restart
```

Update to the newest stable Home Assistant and rebuild Haven:

```bash
docker compose --env-file .env.home-assistant -f docker-compose.yml -f docker-compose.home-assistant.yml pull
docker compose --env-file .env.home-assistant -f docker-compose.yml -f docker-compose.home-assistant.yml up -d --build
```

Back up Home Assistant's persistent configuration before major changes:

```bash
sudo install -d -m 700 /var/backups/haven
docker compose --env-file .env.home-assistant -f docker-compose.yml -f docker-compose.home-assistant.yml stop homeassistant
sudo tar -C home-assistant -czf "/var/backups/haven/home-assistant-$(date +%F-%H%M).tgz" config
docker compose --env-file .env.home-assistant -f docker-compose.yml -f docker-compose.home-assistant.yml start homeassistant
```

Keep `ALLOW_SENSITIVE_ACTIONS=false` until device identity, user permissions, alarm behavior, and tablet access have all been tested. Cameras, locks, alarm panels, smoke/CO detectors, and life-safety systems must retain their own native controls and should never depend only on Haven.
