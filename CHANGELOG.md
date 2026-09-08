# ⚓ Changelog

All notable changes to **Kraken** (the Windrose Dedicated Server Fleet Manager) are documented in this file.

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
