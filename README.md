# Kraken

a small web dashboard for running [Windrose](https://store.steampowered.com/app/3041230/Windrose/) dedicated servers, plus the docker image they run on.

i needed somewhere to spin up windrose servers without sshing in every time, drop mods on them, and tweak the difficulty. this is that.

```
   ___                __
  / __|________ __ __/ /_____ ___
 / /\ \ / __/ _ \\ \ / __/ -_) _ \
/_/ /_\\_\ \__,\_\ \__/\___/_//_/

  windrose dedicated server hub
```

forked from [`UberDudePL/windrose-dedicated-server-docker`](https://github.com/UberDudePL/windrose-dedicated-server-docker) (the docker image stays as upstream put it; all credit there). the dashboard part lives in `hub/`.

---

## what's in here

```
Kraken/
  Dockerfile            <- upstream's docker image, untouched
  docker-compose.yml    <- one-server compose file, also untouched
  scripts/              <- entrypoint, healthcheck, server.sh, wine.sh
  hub/                  <- the dashboard i built (svelte + bun)
```

if you only want the docker image, you can ignore `hub/` entirely and run things the way upstream documents. if you want the dashboard, jump to "running the hub".

---

## what the hub does

think of it as a control panel for one or many windrose servers. each "ship" is its own docker-compose stack on disk, and the dashboard wires them all into one ui.

screens you'll actually use:

- **fleet** - list of every server you've spun up. start, stop, restart from the cards.
- **drydock** - form to add a new server. picks free ports automatically, copies the compose template, writes a fresh `.env`.
- **bridge** - edit a single server: invite code, server name, password, max players, image tag, all the stuff that lives in `.env`.
- **rigging** - drag-drop ue4ss mods (`.lua`, `.dll`, `.zip`) and unreal pak mods (`.pak`/`.ucas`/`.utoc`). flips the right rows in `mods.txt` AND `mods.json` so ue4ss is happy, writes `enabled.txt` for native dll mods. detects WindrosePlus and stays out of its way.
- **voyage** - the per-world difficulty stuff that lives in `WorldDescription.json`: easy/medium/hard preset, combat preset, mob/ship/coop multipliers, shared-quests and easy-explore toggles. refuses to write while the server is running because the game holds the file open and would clobber edits.
- **cargo hold** - hot-tar the world into a backup tarball. lists what's there.
- **log book** - tail of `docker logs` straight on the bridge.
- **settings** - one-click pull-and-rebuild from this repo. shows the current commit, the available commit, and a log of what happened during the update.

---

## requirements

you need a host with:

- docker engine with the `compose` plugin (`docker compose version` should print v2 or newer)
- bun 1.0+ for the dashboard (or node 20+ if you must)
- ipv6 enabled at the kernel (don't set `ipv6.disable=1` on the cmdline) - the dedicated server needs it
- an avx-capable cpu - windrose checks for it

windrose itself runs in wine inside the container; you don't need wine on the host.

---

## running the hub

```bash
git clone https://github.com/C9RE/Kraken.git
cd Kraken/hub
bun install
bun run build
PORT=8783 bun run start
```

open `http://your-host:8783`. it starts empty. click **drydock** and commission a ship.

### config

| env var | default | what it does |
|---|---|---|
| `KRAKEN_FLEET_ROOT` | `./fleet` | where ship stacks live on disk |
| `KRAKEN_TEMPLATE` | `..` (the repo root) | where the hub copies `docker-compose.yml` from |
| `PORT` | `8783` | http port |
| `HOST` | `0.0.0.0` | bind address |
| `KRAKEN_GIT_REMOTE` | `origin` | git remote for self-update |
| `KRAKEN_GIT_BRANCH` | (current branch) | branch for self-update |
| `KRAKEN_SYSTEMD_UNIT` | (empty) | if set, the hub exits cleanly after update so systemd respawns it |

there's optional PIN auth (4 to 12 digits, scrypt-hashed, rate-limited 5/15min per IP). off by default; flip it on from the settings page. when it's off, the hub assumes you're on a private network or behind a reverse proxy that does auth - same threat model as the docker stack itself.

### running it as a service

if you want it always-on, drop this in `/etc/systemd/system/kraken-hub.service` (replace `youruser` and the paths):

```ini
[Unit]
Description=Kraken Hub
After=network.target docker.service

[Service]
Type=simple
User=youruser
WorkingDirectory=/srv/Kraken/hub
Environment=KRAKEN_FLEET_ROOT=/srv/kraken-fleet
Environment=KRAKEN_TEMPLATE=/srv/Kraken
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

with the systemd unit name set, the in-app "apply update" button works as a true zero-touch update: pull, install, build, exit, and systemd respawns with the new bits. without systemd it falls back to a detached shell that re-execs `bun run start`.

---

## updating

two options:

1. **from the dashboard** - settings page, "check for updates", "apply update". it pulls, installs, builds, restarts.
2. **manually** -
   ```bash
   cd /srv/Kraken && git pull
   cd hub && bun install && bun run build
   sudo systemctl restart kraken-hub   # or however you run it
   ```

both end up doing the same thing.

---

## mod paths the hub knows about

windrose loads mods from a few places. rigging handles all of them.

| upload | lands at |
|---|---|
| `<name>.zip` (folder layout) | `data/R5/Binaries/Win64/ue4ss/Mods/<name>/` |
| `<name>.zip` with `.pak` files at top | `data/R5/Content/Paks/~mods/` (or `LogicMods/` if you pick that target) |
| `<name>.lua` | `Mods/<name>/Scripts/main.lua` |
| `<name>.dll` | `Mods/<name>/dlls/main.dll` (+ `enabled.txt`) |
| `<name>.pak` (+ `.ucas`/`.utoc`) | `Content/Paks/~mods/<name>.pak` (default) or `LogicMods/` |

enable state is mirrored to **both** `mods.json` (authoritative for ue4ss 3.x) and `mods.txt` (legacy mirror, crlf, with the `Keybinds : 1` line pinned at the bottom under its comment - the loader needs that exact shape or it gets cranky).

restart the server after edits. ue4ss only reads its mod list at process start.

---

## troubleshooting

**"the harbor is empty" forever**
the fleet index is `<KRAKEN_FLEET_ROOT>/fleet.json`. either it doesn't exist yet (commission a ship and it'll appear) or the hub can't read the directory.

**"ship is running" warning on the rigging panel**
ue4ss rewrites `mods.json` on launch. if you change mods while the server is up, the next time the world flushes it'll overwrite your edits. stop the ship, edit, start.

**"port already used by another ship"**
two ships on the same host can't share a port. pick something else. drydock auto-bumps by 10 each time so this only hits you when you explicitly type a port.

**update button does nothing**
look at the "last update log" panel under the button. if there's no log at all, your `KRAKEN_HUB_DIR` probably isn't a git checkout.

**"cross-site post forbidden" on uploads**
shouldn't happen anymore (csrf origin check is off in the svelte config) but if you're running an older build, rebuild.

---

## the docker image

if you don't want the dashboard, the docker image alone is fine. it's the same one upstream maintains:

```bash
docker compose up -d
```

`.env.example` documents every var. all credit for the image goes to [UberDudePL](https://github.com/UberDudePL) - i forked it as a base for the hub but haven't changed the image itself.

---

## thanks

- [UberDudePL](https://github.com/UberDudePL) for the docker image this is forked from.
- [UE4SS-RE/RE-UE4SS](https://github.com/UE4SS-RE/RE-UE4SS) for the loader.
- [HumanGenome/WindrosePlus](https://github.com/HumanGenome/WindrosePlus) for clarifying which `UE4SS-settings.ini` values matter for dedicated servers.
- [WinterNode](https://winternode.com/help/games/windrose/setup/how-to-add-mods) and [HypeServ](https://hypeserv.com/en/blog/how-to-install-mods-on-a-windrose-server) for writing the mod-install paths down.

---

## license

MIT. same as upstream.
