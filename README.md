# ⚓ Kraken

> **The self-hosted control plane and Docker fleet manager for [Windrose](https://store.steampowered.com/app/3041230/Windrose/) dedicated servers.**  
> Live at [**thekraken.cloud**](https://thekraken.cloud/) · Interactive Demo at [**demo.thekraken.cloud**](https://demo.thekraken.cloud/) · Steam AppID **`4129620`**

[![Windrose Version](https://img.shields.io/badge/Windrose-v1.6.4-ccb99d?style=flat-square)](https://store.steampowered.com/app/3041230/Windrose/)
[![Steam AppID](https://img.shields.io/badge/SteamCMD-AppID%204129620-1b2e35?style=flat-square)](https://store.steampowered.com/app/3041230/Windrose/)
[![Stack](https://img.shields.io/badge/Stack-Svelte%205%20%2B%20Bun-2a4a52?style=flat-square)](https://bun.sh)
[![License](https://img.shields.io/badge/License-MIT-9a7f3e?style=flat-square)](LICENSE)

```text
                  _  __ _____            _  __ ______ _   _ 
                 | |/ /|  __ \     /\   | |/ /|  ____| \ | |
                 | ' / | |__) |   /  \  | ' / | |__  |  \| |
                 |  <  |  _  /   / /\ \ |  <  |  __| | . ` |
                 | . \ | | \ \  / ____ \| . \ | |____| |\  |
                 |_|\_\|_|  \_\/_/    \_\_|\_\|______|_| \_|
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
             W I N D R O S E   F L E E T   M A N A G E R
             Control Plane · Multi-Ship Docker Stacks · UE4SS Mods
             https://thekraken.cloud  ·  https://github.com/C9RE/Kraken
```

Kraken gives you a unified browser dashboard to spin up, orchestrate, mod, and configure multiple isolated Windrose dedicated servers without opening an SSH terminal.

Forked from [`UberDudePL/windrose-dedicated-server-docker`](https://github.com/UberDudePL/windrose-dedicated-server-docker). The fleet manager lives in `hub/` and the marketing site lives in `site/` (hosted at [thekraken.cloud](https://thekraken.cloud)).

---

## ⚡ 1-Line Quick Install

### 🐧 Linux (Docker Engine)
```bash
curl -fsSL https://thekraken.cloud/install.sh | bash
```

### 🪟 Windows (Native Win32 Engine — Zero Wine/WSL2 Overhead)
```powershell
irm https://thekraken.cloud/install.ps1 | iex
```

Or clone and run the installer locally:
* **Linux:** `./install.sh`
* **Windows:** `.\install.ps1` (or run `start-kraken.bat` after build)

---

## ⚓ Key Features

Each dedicated server ("ship") is an isolated `docker-compose` stack with its own configuration, port allocation, save files, and Wine runtime.

- **🚢 Fleet Harbor (`/`)** — Real-time overview of all commissioned vessels. View live container status, uptime, health checks, headcount, UDP port bindings, and invite codes. 1-click start (`Cast off`), stop, restart, or board the bridge.
- **🏗️ Drydock (`/new`)** — Commission a new dedicated server in seconds. Auto-generates container slugs on the fly, allocates collision-free UDP ports (`7777`, `7787`, `7797`), offers crew capacity preset chips (`2p`, `4p`, `8p`, `12p`, `16p`), connection region selection (`EU`, `SEA`, `CIS`), and live spec summaries.
- **🧭 Bridge & Manifest (`/ship/:id`)** — Edit environment variables (`SERVER_NAME`, `SERVER_NOTE`, `INVITE_CODE`, `MAX_PLAYERS`, `PORT`, `QUERYPORT`, `IMAGE_TAG`, `USE_DIRECT_CONNECTION`, `USER_SELECTED_REGION`, `DISCORD_WEBHOOK_URL`, `GOTIFY_URL`) directly from the browser with change-tracking and safe persistence.
- **🏴‍☠️ Rigging Mod Manager (`/ship/:id` → Rigging)** — Drag-and-drop mod uploader supporting UE4SS zip bundles, loose `.lua` scripts, native `.dll` mods, and Unreal `.pak`/`.ucas`/`.utoc` files. Maintains dual synchronization across `mods.json` (authoritative) and `mods.txt` (CRLF legacy mirror with pinned `Keybinds : 1` anchor), creates DLL `enabled.txt` sentinels, and auto-detects **WindrosePlus**.
- **🗺️ Voyage Difficulty Studio (`/ship/:id` → Voyage)** — Visual tuning aligned with the official Windrose Dedicated Server Guide. Presets (`Easy`, `Medium`, `Hard`, `Custom`) and exact upstream parameter multipliers (Mob HP `0.2–5.0`, Mob Damage `0.2–5.0`, Ship HP `0.4–5.0`, Ship Damage `0.2–2.5`, Boarding `0.2–5.0`, Co-op enemy & ship scaling `0.0–2.0`, Shared Quests, and Immersive Exploration) written safely to `WorldDescription.json`. Gated while servers are running to prevent RocksDB flush overwrites.
- **📦 Cargo Hold Backups (`/ship/:id` → Cargo Hold)** — Hot-tar world save profiles (`data/R5/Saved`) and server configurations into timestamped `.tar.gz` archives with instant 1-click download or restore.
- **📜 Log Book (`/ship/:id` → Log Book)** — Tail live container logs and Wine execution output directly in the browser with configurable tail length. Zero SSH required.
- **⚙️ Settings & 1-Click Updates (`/settings`)** — Built-in Git version tracker showing current commit, remote commit, and a 1-click self-updater that pulls, builds, and seamlessly restarts the service.
- **🔐 Security PIN Gate (`/login`)** — Scrypt-hashed 4–12 digit PIN access with per-IP exponential brute-force rate limiting (5 failed attempts locks for 15 minutes) and signed session cookies.
- **🎮 Interactive Demo Sandbox** — Fully functional mirror sandbox at [**demo.thekraken.cloud**](https://demo.thekraken.cloud) where anyone can explore the complete management UI.

---

## 📋 System Requirements

The host machine running Kraken requires:

1. **Docker Engine with Compose v2+** (`docker compose version` $\ge$ 2.0.0).
2. **Bun $\ge$ 1.0** (or Node $\ge$ 20) for running the SvelteKit Hub.
3. **AVX / AVX2 CPU Instructions** — Windrose game binaries require AVX support (Intel Haswell / AMD Zen or newer).
4. **Kernel IPv6 Enabled** — The Windrose server process requires IPv6 at the kernel level (do not set `ipv6.disable=1` in boot parameters).
5. **Host Networking** — Containers run with `network_mode: host` to bind UDP game ports (`7777`/`7778`) and handle P2P NAT punch-through with the Windrose matchmaking gateway.

*Note: WineHQ (x86_64), Xvfb, and SteamCMD are entirely containerized inside the Docker image. You do not need Wine installed on the host.*

---

## 🚀 Manual Quickstart

### 1. Run via Kraken Hub

```bash
git clone https://github.com/C9RE/Kraken.git
cd Kraken/hub
bun install
bun run build
PORT=8783 bun run start
```

Open `http://your-server-ip:8783` in your browser.

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
Environment=PATH=/home/law/.bun/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/home/law/.bun/bin/bun run start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kraken-hub
```

---

### 3. Run Standalone via Docker Compose (CLI Only)

If you only want a single standalone server without the web dashboard:

```bash
git clone https://github.com/C9RE/Kraken.git
cd Kraken
cp .env.example .env
# Edit .env with your SERVER_NAME, PORT, and INVITE_CODE
docker compose up -d
```

---

## 🛠️ Mod Installation Matrix

Windrose loads mods from distinct directories depending on whether they are UE4SS scripts, native DLLs, or Unreal pak files. Kraken Rigging handles all of them automatically:

| Upload Format | Target Destination | Activation & Handling |
|---|---|---|
| `<name>.zip` (UE4SS folder layout) | `data/R5/Binaries/Win64/ue4ss/Mods/<name>/` | Synced to `mods.json` and `mods.txt` |
| `<name>.zip` (Pak archive) | `data/R5/Content/Paks/~mods/` | Unpacked alongside `.ucas`/`.utoc` siblings |
| `<name>.lua` (Loose Lua script) | `data/R5/Binaries/Win64/ue4ss/Mods/<name>/Scripts/main.lua` | Added to `mods.json` registry |
| `<name>.dll` (Native C++ mod) | `data/R5/Binaries/Win64/ue4ss/Mods/<name>/dlls/main.dll` | Writes `enabled.txt` sentinel in mod folder |
| `<name>.pak` (Asset replacement) | `data/R5/Content/Paks/~mods/<name>.pak` | Engine autoloads at boot |
| `<name>.pak` (Logic pak) | `data/R5/Content/Paks/LogicMods/<name>.pak` | Loaded via built-in `BPModLoaderMod` |

### Registry Dual-Sync
UE4SS 3.x reads `mods.json` for active mod declarations while legacy tooling reads `mods.txt`. Kraken maintains **both** files in lockstep with CRLF line endings and ensures the critical `; Built-in keybinds, do not move up!` and `Keybinds : 1` tail remains anchored at the bottom.

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
