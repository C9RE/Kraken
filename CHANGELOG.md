# ⚓ Changelog

All notable changes to **Kraken** (the Windrose Dedicated Server Fleet Manager) are documented in this file.

---

## [v1.8.0] — 2026-11-14

### 🚀 Engine Sync, Native Fixes & Fleet UX
* **🐳 Windrose Engine `v1.6.6` Upgrade:**
  * Updated default upstream container tag from `v1.6.4` to **`v1.6.6`** across `docker-compose.yml`, `.env.example`, `fleet.js`, Drydock (`new/+page.svelte`), Bridge (`ship/[id]/+page.svelte`), and demo seeds.
  * Restored `WINEDLLOVERRIDES: ${WINEDLLOVERRIDES:-dwmapi=n,b}` in `docker-compose.yml` and `.env.example` so headless Wine containers reliably load UE4SS `dwmapi.dll` hooks.
* **🪟 Native Windows Supervision Fixes (`fleet.js`):**
  * Fixed native Windows server executable resolution to target `data/R5/Binaries/Win64/WindroseServer-Win64-Shipping.exe` first (keeping `R5Server-Win64-Shipping.exe` and `WindroseServer.exe` as fallbacks).
  * Added `+@sSteamCmdForcePlatformType windows` to native SteamCMD `pull` invocations for reliable Windows depot downloads across platforms.
* **⚓ Harbor Fleet Dashboard UX (`+page.svelte`, `ShipCard.svelte`):**
  * Added real-time vessel search/filter input and `All` / `Afloat` / `Moored` status filter pills when managing multiple ships.
  * Added total active/max crew capacity pill in the Harbor header and dismissible action toast banners reporting start/stop/restart outcomes and errors.
  * Added 1-click **Direct IP:Port** clipboard copy button on vessel cards when `USE_DIRECT_CONNECTION=true`.
* **🌐 Web & GitHub SEO/GEO Overhaul:**
  * Fixed broken `thekraken.cloud/demo` links in `llms.txt` and `sitemap.xml` to point to `https://demo.thekraken.cloud/`, added `llms-full.txt`, expanded `@graph` JSON-LD with `FAQPage` and full `SoftwareApplication` metadata, added interactive 4-tab UI previews and comparison matrix on `thekraken.cloud`, and updated footer links to `https://c9re.dev`.

---

## [v1.7.0] — 2026-09-08

### 🚀 Highlights & New Features
* **📦 Cargo Hold 1-Click Download & Safe Restore:**
  * Added direct `.tar.gz` archive streaming endpoint (`/api/fleet/:id/backups/:filename`) with `Content-Disposition` attachments for instant 1-click browser downloads.
  * Added 1-click snapshot restore workflow (`restore_ship_backup`) that safely suspends the server container, extracts world save profiles (`data/R5/Saved`) and `ServerDescription.json`, and seamlessly restarts the stack without manual terminal intervention.
* **📋 1-Click Clipboard Invite Code Copying:**
  * Added interactive invite code copy buttons with transient `copied! ⚓` visual indicators across Harbor fleet cards ([ShipCard.svelte](hub/src/lib/components/ShipCard.svelte)) and the Bridge header status deck ([routes/ship/[id]/+page.svelte](hub/src/routes/ship/[id]/+page.svelte)).
* **🛡️ Drydock Port Collision Detector & Auto-Suggester:**
  * Added live fleet preflight in Drydock commissioning ([routes/new/+page.svelte](hub/src/routes/new/+page.svelte)).
  * Automatically scans registered fleet vessels and calculates the next collision-free UDP port allocation (e.g. `7777`, `7787`, `7797`, `7807`).
  * Real-time inline collision warnings if an operator manually assigns an already bound UDP port.
* **📜 Log Book Search Filter, Auto-Scroll & Copy:**
  * Added real-time log filter input in the Ship's Log Book to instantly grep/filter stdout/stderr output (e.g., error tracing, SteamCMD events, player sessions).
  * Added automatic scroll-to-bottom pinning toggle.
  * Added 1-click "Copy Logs" button.
* **⚙️ Version Stream & System Diagnostics:**
  * Integrated dynamic Git release tag resolution in `system.js` to accurately display the active version in Hub Settings and layout footers.

---

## [v1.6.4] — 2026-08-25

### Added
* Support for Windrose patch `0.10.0.9` hit registration and combat updates.
* Native Windows engine supervisor mode with `install.ps1` and `start-kraken.bat`.
* Multi-region matchmaking routing (`EU`, `SEA`, `CIS`) in Drydock and Ship Manifest.

---

## [v1.6.0] — 2026-05-24

### Added
* Dual UE4SS synchronization across `mods.json` (authoritative) and `mods.txt` (CRLF legacy mirror with pinned `Keybinds : 1` tail block).
* Drag-and-drop mod manager ("Rigging") supporting `.zip`, `.lua`, `.dll`, and Unreal `.pak` mods.
* RocksDB-safe Voyage difficulty studio with official upstream parameters and save-clobber protection.
* Interactive demo sandbox at `demo.thekraken.cloud` with in-memory simulated orchestration.
* Scrypt-hashed PIN authentication gate with exponential brute-force lockout.
