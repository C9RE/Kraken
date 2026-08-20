#!/usr/bin/env bash
# ==============================================================================
#  ⚓ KRAKEN — Windrose Dedicated Server Fleet Manager
#  Automated Installation & Setup Script
#  https://thekraken.cloud · https://github.com/C9RE/Kraken
# ==============================================================================

set -euo pipefail

# ANSI Colors
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  C_GOLD='\033[38;2;204;185;157m'
  C_AMBER='\033[38;2;154;127;62m'
  C_CYAN='\033[38;2;90;180;190m'
  C_GREEN='\033[38;2;104;186;140m'
  C_RED='\033[38;2;194;89;83m'
  C_DIM='\033[38;2;120;120;120m'
  C_BOLD='\033[1m'
  C_RESET='\033[0m'
else
  C_GOLD=''
  C_AMBER=''
  C_CYAN=''
  C_GREEN=''
  C_RED=''
  C_DIM=''
  C_BOLD=''
  C_RESET=''
fi

print_banner() {
  printf "${C_AMBER}\n"
  printf "                  _  __ _____            _  __ ______ _   _ \n"
  printf "                 | |/ /|  __ \     /\   | |/ /|  ____| \ | |\n"
  printf "                 | ' / | |__) |   /  \  | ' / | |__  |  \| |\n"
  printf "                 |  <  |  _  /   / /\ \ |  <  |  __| | . \` |\n"
  printf "                 | . \ | | \ \  / ____ \| . \ | |____| |\  |\n"
  printf "                 |_|\_\|_|  \_\/_/    \_\_|\_\|______|_| \_|\n"
  printf "${C_GOLD}          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n"
  printf "             ${C_BOLD}W I N D R O S E   F L E E T   M A N A G E R${C_RESET}\n"
  printf "${C_DIM}             Control Plane · Multi-Ship Docker Stacks · UE4SS Mods\n"
  printf "             https://thekraken.cloud  ·  https://github.com/C9RE/Kraken\n\n${C_RESET}"
}

log_info()  { printf "${C_CYAN}  ⚓ ${C_RESET}%s\n" "$*"; }
log_ok()    { printf "${C_GREEN}  ✔ ${C_RESET}%s\n" "$*"; }
log_warn()  { printf "${C_AMBER}  ▲ ${C_RESET}%s\n" "$*"; }
log_err()   { printf "${C_RED}  ✖ ${C_RESET}%s\n" "$*"; }
log_step()  { printf "\n${C_BOLD}${C_GOLD}──▶ %s${C_RESET}\n" "$*"; }

print_banner

# Step 1: Pre-flight System & Architecture Checks
log_step "Checking System Compatibility"

ARCH="$(uname -m)"
OS="$(uname -s)"

if [[ "$OS" != "Linux" ]]; then
  log_err "Kraken is engineered for Linux hosts (detected $OS)."
  exit 1
fi

if [[ "$ARCH" != "x86_64" ]]; then
  log_warn "Host architecture is $ARCH. Note: Windrose Steam binaries require x86_64."
else
  log_ok "Architecture: x86_64 (Linux)"
fi

# Check AVX instruction support
if grep -q -E 'avx|avx2' /proc/cpuinfo 2>/dev/null; then
  log_ok "CPU AVX / AVX2 instructions detected"
else
  log_warn "AVX CPU instructions not detected in /proc/cpuinfo (Windrose game binaries may require AVX)."
fi

# Step 2: Check Tools & Dependencies
log_step "Verifying Prerequisites"

# Git
if command -v git &>/dev/null; then
  log_ok "Git is installed: $(git --version)"
else
  log_err "Git is required. Please install git (e.g. sudo apt install git)."
  exit 1
fi

# Docker
if command -v docker &>/dev/null; then
  log_ok "Docker is installed: $(docker --version)"
  if docker compose version &>/dev/null; then
    log_ok "Docker Compose is installed: $(docker compose version --short 2>/dev/null || echo 'v2+')"
  else
    log_warn "Docker Compose v2 plugin not found. Please install docker-compose-plugin."
  fi
else
  log_warn "Docker not detected. Dedicated server containers will require Docker Engine."
fi

# Bun or Node
BUN_BIN="$(command -v bun || true)"
if [[ -z "$BUN_BIN" ]]; then
  if [[ -f "$HOME/.bun/bin/bun" ]]; then
    BUN_BIN="$HOME/.bun/bin/bun"
    export PATH="$HOME/.bun/bin:$PATH"
  fi
fi

if [[ -n "$BUN_BIN" ]]; then
  log_ok "Bun runtime detected: $($BUN_BIN --version)"
else
  log_info "Bun runtime not found. Installing Bun automatically..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  if command -v bun &>/dev/null; then
    BUN_BIN="$(command -v bun)"
    log_ok "Bun successfully installed: $($BUN_BIN --version)"
  else
    log_err "Failed to install Bun. Please visit https://bun.sh or install Node.js >= 20."
    exit 1
  fi
fi

# Step 3: Clone or Locate Kraken Repository
log_step "Setting Up Kraken Codebase"

TARGET_DIR="${KRAKEN_DIR:-$PWD}"

if [[ -f "$TARGET_DIR/hub/package.json" && -f "$TARGET_DIR/docker-compose.yml" ]]; then
  log_ok "Using existing Kraken directory at $TARGET_DIR"
  cd "$TARGET_DIR"
elif [[ -d "$TARGET_DIR/Kraken/hub" ]]; then
  log_ok "Found Kraken repo at $TARGET_DIR/Kraken"
  cd "$TARGET_DIR/Kraken"
else
  CLONE_DIR="$HOME/kraken"
  if [[ -d "$CLONE_DIR" ]]; then
    log_info "Updating existing repository at $CLONE_DIR..."
    cd "$CLONE_DIR"
    git pull origin main || true
  else
    log_info "Cloning Kraken from GitHub into $CLONE_DIR..."
    git clone https://github.com/C9RE/Kraken.git "$CLONE_DIR"
    cd "$CLONE_DIR"
  fi
fi

# Step 4: Build Kraken Hub Dashboard
log_step "Building Kraken Hub Dashboard"

cd hub
log_info "Installing dashboard dependencies via Bun..."
bun install

log_info "Compiling SvelteKit production build..."
bun run build
log_ok "Kraken Hub built successfully!"

cd ..

# Step 5: Systemd Service Installation (Optional)
log_step "Configuring Process Daemon"

PORT="${PORT:-8783}"
FLEET_ROOT="${KRAKEN_FLEET_ROOT:-$PWD/fleet}"
mkdir -p "$FLEET_ROOT"

if [[ -d /etc/systemd/system ]] && command -v systemctl &>/dev/null && [[ -t 0 ]]; then
  SERVICE_FILE="/etc/systemd/system/kraken-hub.service"
  
  printf "\n${C_BOLD}Would you like to install Kraken Hub as a systemd service (auto-start on boot)?${C_RESET}\n"
  read -r -p "Install systemd service? [Y/n]: " setup_systemd || setup_systemd="y"
  setup_systemd="${setup_systemd:-y}"

  if [[ "${setup_systemd,,}" =~ ^(y|yes)$ ]]; then
    log_info "Writing systemd service unit to $SERVICE_FILE (requires sudo)..."
    
    BUN_EXEC="$(command -v bun || echo "$HOME/.bun/bin/bun")"
    CURRENT_USER="$(whoami)"
    
    sudo tee "$SERVICE_FILE" > /dev/null << UNIT_EOF
[Unit]
Description=Kraken Hub — Windrose Dedicated Server Fleet Manager
After=network.target docker.service

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$PWD/hub
Environment=KRAKEN_FLEET_ROOT=$FLEET_ROOT
Environment=KRAKEN_TEMPLATE=$PWD
Environment=KRAKEN_SYSTEMD_UNIT=kraken-hub
Environment=PORT=$PORT
Environment=HOST=0.0.0.0
Environment=PATH=$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$BUN_EXEC run start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT_EOF

    log_info "Reloading systemd and enabling kraken-hub.service..."
    sudo systemctl daemon-reload
    sudo systemctl enable --now kraken-hub.service
    log_ok "Kraken Hub systemd service is active and running on port $PORT!"
  else
    log_info "Skipping systemd service installation."
  fi
fi

# Step 6: Summary & Launch Info
IP_ADDR="$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")"

printf "\n${C_GOLD}==============================================================================${C_RESET}\n"
printf "${C_BOLD}${C_GREEN}  🎉 Kraken Installation Complete!${C_RESET}\n"
printf "${C_GOLD}==============================================================================${C_RESET}\n\n"
printf "  ${C_BOLD}Access the Kraken Dashboard:${C_RESET}\n"
printf "  ▶ Local:    ${C_CYAN}http://localhost:%s${C_RESET}\n" "$PORT"
printf "  ▶ Network:  ${C_CYAN}http://%s:%s${C_RESET}\n\n" "$IP_ADDR" "$PORT"
printf "  ${C_BOLD}Management Commands:${C_RESET}\n"
printf "  • Start manually:   ${C_DIM}cd %s/hub && PORT=%s bun run start${C_RESET}\n" "$PWD" "$PORT"
printf "  • Check service:    ${C_DIM}sudo systemctl status kraken-hub${C_RESET}\n"
printf "  • View hub logs:    ${C_DIM}sudo journalctl -u kraken-hub -f${C_RESET}\n\n"
printf "${C_AMBER}  Fair winds and following seas! ⚓${C_RESET}\n\n"
