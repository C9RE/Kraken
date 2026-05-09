# 🐙 Kraken Hub

> Fleet manager for [Windrose](https://store.steampowered.com/app/3041230/Windrose/) dedicated servers.
> One dashboard. Many ships. Click to start, stop, restart, refit, backup.

The hub builds on the [Kraken docker image](../README.md) (a fork of [UberDudePL/windrose-dedicated-server-docker](https://github.com/UberDudePL/windrose-dedicated-server-docker)) - every ship you commission is a self-contained `docker-compose` stack on disk, generated from the template at the root of this repo.

---

## Features

- **Drydock**: spin up new dedicated server instances with one form. No CLI required.
- **Bridge**: edit `.env` settings (server name, invite code, max players, ports, password, image tag, notification webhooks…) per ship.
- **Rigging**: drag-and-drop mod installer - accepts `.zip` (UE4SS layout), `.lua`, or `.dll`. Toggles enabled state in `mods.txt`. Removes mods cleanly.
- **Lifecycle**: start, stop, restart, refit (pull + restart), scuttle.
- **Backups**: hot-tar saves into the ship's own `backups/` directory.
- **Logs**: tail container logs straight from the dashboard.
- **Multi-instance**: run several worlds side-by-side; each ship is isolated under its own directory.

---

## Stack

- SvelteKit 2 + Svelte 5 (runes)
- Tailwind CSS 4
- JavaScript with JSDoc (no TypeScript)
- Bun for install / dev / build
- Talks to the host's Docker daemon via the `docker` CLI (host networking; no Docker SDK)

---

## Quick start

```bash
# from the repo root
cd hub
bun install
bun run dev   # → http://localhost:8783
```

By default the hub stores ship stacks in `hub/fleet/`. Override via env:

```bash
export KRAKEN_FLEET_ROOT=/srv/kraken-fleet
export KRAKEN_TEMPLATE=/path/to/Kraken      # repo root with docker-compose.yml + Dockerfile
bun run dev
```

### Production build

```bash
bun run build
PORT=8783 bun run start
```

The adapter-node output lives in `build/`. Front it with Caddy / nginx / Cloudflare as you would any other Node app.

---

## How it works

```
KRAKEN_FLEET_ROOT/
├ fleet.json              ← index of registered ships
└ <ship-id>/
    ├ docker-compose.yml  ← copied from $KRAKEN_TEMPLATE
    ├ .env                ← generated; edited via the UI
    ├ data/               ← /data mount (game files + saves)
    ├ steam-home/         ← Wine prefix + SteamCMD cache
    └ backups/            ← *.tar.gz saves
```

When you "Cast off" a ship, the hub runs `docker compose up -d` in that ship's directory. When you save settings, it rewrites `.env` (preserving comments + line order) and you restart to pick them up. When you scuttle a ship, the hub runs `docker compose down` then deletes the directory.

The hub itself has no idea what Windrose is - it just orchestrates docker-compose stacks built from the parent fork's template.

---

## Requirements

- **Docker Engine** with the `compose` plugin (`docker compose version` ≥ v2)
- **Bun** ≥ 1.0 (or Node ≥ 20 if you must)
- The hub process needs:
 - read access to `$KRAKEN_TEMPLATE/docker-compose.yml`
 - read/write on `$KRAKEN_FLEET_ROOT`
 - permission to talk to the Docker daemon (membership in `docker` group, or socket bind-mount)

The Windrose dedicated server itself needs an AVX-capable CPU and IPv6 enabled at the kernel level (no `ipv6.disable=1`).

---

## Configuration

| Env var               | Default                | Notes |
|-----------------------|------------------------|-------|
| `KRAKEN_FLEET_ROOT`   | `./fleet` (cwd)        | Where ship stacks are written. |
| `KRAKEN_TEMPLATE`     | `..` (parent dir)      | Where to copy `docker-compose.yml` from. The repo root by default. |
| `PORT`                | `8783`                 | HTTP port (when running the production server). |
| `HOST`                | `0.0.0.0`              | Bind address (when running the production server). |

---

## Mods

The Rigging panel on each ship lets anyone install mods without SSH'ing into the host.

| Upload | Where it lands | Notes |
|---|---|---|
| `<name>.zip` (UE4SS folder shape) | `Binaries/Win64/ue4ss/Mods/<name>/` | Single-top-level-dir zips are auto-flattened. |
| `<name>.zip` (contains `.pak` at top) | `Content/Paks/~mods/` (default) or `LogicMods/` | Picks up matching `.ucas`/`.utoc` siblings. Pick the target in the upload form. |
| `<name>.lua` | `Mods/<name>/Scripts/main.lua` | Loose Lua mod. |
| `<name>.dll` | `Mods/<name>/dlls/main.dll` (+ `enabled.txt`) | Native UE4SS mod. |
| `<name>.pak` (+ optional `.ucas`/`.utoc`) | `Content/Paks/~mods/<name>.pak` (default) | Or `LogicMods/` if you select that target. |

### What gets written

Enabled state is mirrored to **both** UE4SS registries - UE4SS 3.x maintains them in parallel:

- `Binaries/Win64/ue4ss/Mods/mods.json` - JSON array (`[{mod_name, mod_enabled}]`). Authoritative.
- `Binaries/Win64/ue4ss/Mods/mods.txt` - `ModName : 0|1`, **CRLF**, with the `Keybinds` line pinned at the bottom under its `; Built-in keybinds, do not move up!` comment. The hub respects all of this.

For native (DLL) mods the hub also writes `enabled.txt` inside the mod folder, which is the per-folder sentinel UE4SS expects for native mods.

`.pak` mods can't be disabled in-place - they're loaded unconditionally by the engine. Remove the file (the hub's "remove" button does this) to disable.

### UE4SS, in-image

The upstream `uberdudepl/windrose-dedicated-server-docker` image already provisions UE4SS 3.0.1 (Beta) and the built-in UE4SS mods (`BPModLoaderMod`, `ConsoleEnablerMod`, `Keybinds`, etc.) on first SteamCMD run. You don't have to install UE4SS separately. Built-in mods are flagged in the table; deleting them is gated behind an extra confirm because removing `BPModLoaderMod` or `Keybinds` will break the loader.

### WindrosePlus

If `data/windrose_plus_data/` is present, the hub shows a "WindrosePlus detected" badge. The hub does not touch `UE4SS-settings.ini` - WindrosePlus needs specific values there (`HookProcessInternal=1`, `HookEngineTick=0`, `DefaultExecuteInGameThreadMethod=ProcessEvent`) and overwriting them crashes the dedicated server.

### Restart the ship after edits

UE4SS only reads `mods.json` / `mods.txt` at process start. The Rigging panel shows a warning when the ship is currently running - UE4SS may rewrite both files on next boot, possibly clobbering your changes. Stop the ship, edit, then start.

### Sources & community

- [UE4SS for Windrose - Nexus #43](https://www.nexusmods.com/windrose/mods/43) - canonical UE4SS build for the game.
- [Windrose Mod Manager - Nexus #29](https://www.nexusmods.com/windrose/mods/29) - GUI-side prior art (dedicated-server-aware).
- [WindrosePlus](https://github.com/HumanGenome/WindrosePlus) - server-side framework + admin features.
- [WinterNode install guide](https://winternode.com/help/games/windrose/setup/how-to-add-mods) - clearest `mods.json` schema + Lua/DLL split.
- [HypeServ install guide](https://hypeserv.com/en/blog/how-to-install-mods-on-a-windrose-server) - pak / `~mods` paths.
- [BisectHosting UE4SS-on-Windrose article](https://help.bisecthosting.com/hc/en-us/articles/49353795082523-How-to-Install-UE4SS-on-a-Windrose-Server).
- [UE4SS upstream](https://github.com/UE4SS-RE/RE-UE4SS).

## Roadmap

- Scheduled backups + retention policy per ship.
- Browse + restore from the backup tarball list (currently view-only).
- One-click image-channel switch (`stable` / `dev`).
- Multi-host Docker - point the hub at a remote `DOCKER_HOST=tcp://…` instead of the local socket.
- Optional auth (token / basic) - currently the hub is unauthenticated; expose it on a private network or front it with Caddy/nginx auth.

---

## License

MIT - same as the parent project.
