# 🐙 Kraken Hub

> Fleet manager for [Windrose](https://store.steampowered.com/app/3041230/Windrose/) dedicated servers.
> One dashboard. Many ships. Click to start, stop, restart, refit, backup.

The hub builds on the [Kraken docker image](../README.md) (a fork of [UberDudePL/windrose-dedicated-server-docker](https://github.com/UberDudePL/windrose-dedicated-server-docker)) — every ship you commission is a self-contained `docker-compose` stack on disk, generated from the template at the root of this repo.

---

## Features

- **Drydock**: spin up new dedicated server instances with one form.
- **Bridge**: edit `.env` settings (server name, invite code, max players, ports, password, image tag, notification webhooks…) per ship.
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
├── fleet.json              ← index of registered ships
└── <ship-id>/
    ├── docker-compose.yml  ← copied from $KRAKEN_TEMPLATE
    ├── .env                ← generated; edited via the UI
    ├── data/               ← /data mount (game files + saves)
    ├── steam-home/         ← Wine prefix + SteamCMD cache
    └── backups/            ← *.tar.gz saves
```

When you "Cast off" a ship, the hub runs `docker compose up -d` in that ship's directory. When you save settings, it rewrites `.env` (preserving comments + line order) and you restart to pick them up. When you scuttle a ship, the hub runs `docker compose down` then deletes the directory.

The hub itself has no idea what Windrose is — it just orchestrates docker-compose stacks built from the parent fork's template.

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

## Roadmap

- Mod manager — drop in [Kraken Lua/C++ mods](../README.md) per-ship from the bridge
- Player list + RCON dispatch (when paired with the [in-game admin tool](https://github.com/C9RE/Kraken))
- Scheduled backups + retention policy per ship
- One-click image-channel switching (`stable` / `dev`)
- Multi-host Docker (point the hub at remote `DOCKER_HOST=tcp://…` instead of just the local socket)

---

## License

MIT — same as the parent project.
