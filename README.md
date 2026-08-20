# ⚓ Kraken

> **The self-hosted control plane and Docker fleet manager for [Windrose](https://store.steampowered.com/app/3041230/Windrose/) dedicated servers.**  
> Live at [**thekraken.cloud**](https://thekraken.cloud/) · Steam Dedicated Server AppID **`4129620`** · Compatible with Windrose **`v1.6.4`**

[![Windrose Version](https://img.shields.io/badge/Windrose-v1.6.4-ccb99d?style=flat-square)](https://store.steampowered.com/app/3041230/Windrose/)
[![Steam AppID](https://img.shields.io/badge/SteamCMD-AppID%204129620-1b2e35?style=flat-square)](https://store.steampowered.com/app/3041230/Windrose/)
[![Stack](https://img.shields.io/badge/Stack-Svelte%205%20%2B%20Bun-2a4a52?style=flat-square)](https://bun.sh)
[![License](https://img.shields.io/badge/License-MIT-9a7f3e?style=flat-square)](LICENSE)

```
   ___                __
  / __|________ __ __/ /_____ ___
 / /\ \ / __/ _ \\ \ / __/ -_) _ \
/_/ /_\\_\ \__,\_\ \__/\___/_//_/

  windrose dedicated server fleet manager
```

Kraken gives you a unified browser dashboard to spin up, manage, and orchestrate multiple isolated Windrose dedicated servers without opening an SSH terminal every time.

Forked from [`UberDudePL/windrose-dedicated-server-docker`](https://github.com/UberDudePL/windrose-dedicated-server-docker) (the underlying Docker image stays aligned with upstream). The fleet manager lives in `hub/` and the landing page lives in `site/` (hosted at [thekraken.cloud](https://thekraken.cloud)).

---

## ⚓ What Kraken Does

Each dedicated server ("ship") is an isolated `docker-compose` stack with its own configuration, port allocation, save files, and Wine runtime.

- **🚢 Fleet Harbor (`/`)** — Real-time overview of all commissioned vessels. View live container status, uptime, health checks, headcount, UDP port bindings, and invite codes. 1-click start (`Cast off`), stop, restart, or board the bridge.
- **🏗️ Drydock (`/new`)** — Commission a new dedicated server in seconds. Automatically detects in-use ports and allocates the next free UDP port pair (`7777`, `7787`, `7797`), provisions the directory structure, copies the compose template, and generates `.env`.
- **🧭 Bridge & Manifest (`/ship/:id`)** — Edit environment variables (`SERVER_NAME`, `SERVER_NOTE`, `INVITE_CODE`, `MAX_PLAYERS`, `PORT`, `QUERYPORT`, `IMAGE_TAG`, `USE_DIRECT_CONNECTION`, `DISCORD_WEBHOOK_URL`, `GOTIFY_URL`) directly from the browser with change-tracking and safe persistence.
- **🏴‍☠️ Rigging Mod Manager (`/ship/:id` → Rigging)** — Drag-and-drop mod installer supporting UE4SS zip archives, loose `.lua` scripts, native `.dll` mods, and Unreal `.pak`/`.ucas`/`.utoc` files. Automatically maintains dual synchronization across `mods.json` (authoritative) and `mods.txt` (CRLF legacy mirror with pinned `Keybinds : 1` anchor), creates DLL `enabled.txt` sentinels, and auto-detects **WindrosePlus**.
- **🗺️ Voyage Difficulty Studio (`/ship/:id` → Voyage)** — Visual tuning for world difficulty presets (`Easy`, `Normal`, `Hardcore`, `Custom`) and per-parameter multipliers (Mob HP, Mob Damage, Ship Hull Integrity, Boarding Difficulty, Co-op Scaling) written safely to `WorldDescription.json`. Gated while servers are running to prevent RocksDB flush overwrites.
- **📦 Cargo Hold Backups (`/ship/:id` → Cargo Hold)** — Hot-tar world save profiles (`data/R5/Saved`) and server configurations into timestamped `.tar.gz` archives with configurable retention.
- **📜 Log Book (`/ship/:id` → Log Book)** — Tail live container logs and Wine execution output directly in the browser. Zero SSH required.
- **⚙️ Settings & 1-Click Updates (`/settings`)** — Built-in Git version tracker showing current commit, remote commit, and a 1-click self-updater that pulls, builds, and seamlessly restarts the service.
- **🔐 Optional PIN Authentication (`/login`)** — Scrypt-hashed 4–12 digit PIN gate with per-IP exponential rate limiting (5 failed attempts per 15 minutes) and signed session cookies.

---

## 📋 System Requirements

The host machine running Kraken requires:

1. **Docker Engine with Compose v2+** (`docker compose version` $\ge$ 2.0.0).
2. **Bun $\ge$ 1.0** (or Node $\ge$ 20) for running the SvelteKit Hub.
3. **AVX / AVX2 CPU Instructions** — Windrose game binaries require AVX support (Intel Haswell / AMD Zen or newer).
4. **Kernel IPv6 Enabled** — The Windrose server process requires IPv6 at the kernel level (do not set `ipv6.disable=1` in boot parameters).
5. **Host Networking** — Containers run with `network_mode: host` to bind UDP game ports (`7777`/`7788`) and handle P2P NAT punch-through with the Windrose matchmaking gateway (`r5coopapigateway-eu-release.windrose.support:443`).

*Note: WineHQ (x86_64), Xvfb, and SteamCMD are entirely containerized inside the Docker image. You do not need Wine installed on the host.*

---

## 🚀 Quickstart

### 1. Run via Kraken Hub (Recommended)

```bash
git clone https://github.com/C9RE/Kraken.git
cd Kraken/hub
bun install
bun run build
PORT=8783 bun run start
```

Open `http://your-server-ip:8783` in your browser. Head over to **Drydock** and commission your first ship!

### Hub Environment Variables

| Variable | Default | Description |
|---|---|---|
| `KRAKEN_FLEET_ROOT` | `./fleet` | Where ship directories and saves live on disk |
| `KRAKEN_TEMPLATE` | `..` (repo root) | Path to template `docker-compose.yml` |
| `PORT` | `8783` | HTTP listening port for the Hub web app |
| `HOST` | `0.0.0.0` | Bind address |
| `KRAKEN_GIT_REMOTE` | `origin` | Git remote for in-app self updates |
| `KRAKEN_GIT_BRANCH` | `main` | Git branch for in-app self updates |
| `KRAKEN_SYSTEMD_UNIT`| `kraken-hub` | Optional systemd unit name for zero-touch restart |

---

### 2. Run as a Systemd Service

To keep Kraken Hub running 24/7 in the background with zero-touch in-app updates, create `/etc/systemd/system/kraken-hub.service`:

```ini
[Unit]
Description=Kraken Hub — Windrose Fleet Manager
After=network.target docker.service

[Service]
Type=simple
User=law
WorkingDirectory=/home/law/core/kraken/hub
Environment=KRAKEN_FLEET_ROOT=/home/law/core/kraken-fleet
Environment=KRAKEN_TEMPLATE=/home/law/core/kraken
Environment=KRAKEN_SYSTEMD_UNIT=kraken-hub
Environment=PORT=8783
Environment=HOST=0.0.0.0
ExecStart=/usr/bin/bun run start
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kraken-hub
```

---

### 3. Run Headless via Docker Compose (CLI Only)

If you only want a single standalone server without the web dashboard:

```bash
git clone https://github.com/C9RE/Kraken.git
cd Kraken
cp .env.example .env
# Edit .env with your SERVER_NAME and INVITE_CODE
docker compose up -d
```

---

## 🛠️ Mod Installation Guide

Windrose loads mods from several distinct directories depending on whether they are UE4SS scripts, native DLLs, or Unreal pak files. Kraken Rigging handles all of them:

| Upload Format | Target Destination | Activation & Handling |
|---|---|---|
| `<name>.zip` (UE4SS folder layout) | `data/R5/Binaries/Win64/ue4ss/Mods/<name>/` | Synced to `mods.json` and `mods.txt` |
| `<name>.zip` (Pak archive) | `data/R5/Content/Paks/~mods/` | Unpacked alongside `.ucas`/`.utoc` siblings |
| `<name>.lua` (Loose Lua script) | `data/R5/Binaries/Win64/ue4ss/Mods/<name>/Scripts/main.lua` | Added to `mods.json` registry |
| `<name>.dll` (Native C++ mod) | `data/R5/Binaries/Win64/ue4ss/Mods/<name>/dlls/main.dll` | Writes `enabled.txt` sentinel in mod folder |
| `<name>.pak` (Asset replacement) | `data/R5/Content/Paks/~mods/<name>.pak` | Engine autoloads at boot |
| `<name>.pak` (Logic pak) | `data/R5/Content/Paks/LogicMods/<name>.pak` | Loaded via built-in `BPModLoaderMod` |

### Registry Dual-Sync
UE4SS 3.x reads `mods.json` for active mod declarations while legacy tooling reads `mods.txt`. Kraken maintains **both** files in lockstep with CRLF formatting and ensures the critical `; Built-in keybinds, do not move up!` and `Keybinds : 1` tail remains anchored at the bottom.

---

## 📡 REST API Reference

Kraken Hub exposes a complete REST API:

- `GET /api/fleet` — List all registered ships with live health and status.
- `POST /api/fleet` — Commission a new ship stack.
- `GET /api/fleet/:id` — Get detailed ship configuration, storage metrics, and backups.
- `POST /api/fleet/:id` — Perform lifecycle action (`start`, `stop`, `restart`, `pull`, `refit`, `backup`, `update_env`, `scuttle`).
- `GET /api/fleet/:id/logs?lines=200` — Stream container logs.
- `GET /api/fleet/:id/mods` — List installed UE4SS and Pak mods.
- `POST /api/fleet/:id/mods` — Upload and auto-unpack mod file.
- `POST /api/fleet/:id/mods/:name` — Toggle mod enable state or delete mod.
- `GET /api/fleet/:id/voyage` — Read save profiles and difficulty parameters from `WorldDescription.json`.
- `POST /api/fleet/:id/voyage` — Apply preset or custom difficulty multipliers.
- `GET /api/system` — Get Hub git version status and update availability.
- `POST /api/system` — Trigger self-update (`pull`, `install`, `build`, `restart`).

---

## 📄 License & Credits

- **License:** MIT License.
- **Parent Image:** [UberDudePL/windrose-dedicated-server-docker](https://github.com/UberDudePL/windrose-dedicated-server-docker)
- **Mod Loader:** [UE4SS-RE/RE-UE4SS](https://github.com/UE4SS-RE/RE-UE4SS)
- **Framework Reference:** [HumanGenome/WindrosePlus](https://github.com/HumanGenome/WindrosePlus)
- **Maintained By:** [C9RE](https://c9re.com) · [thekraken.cloud](https://thekraken.cloud)
