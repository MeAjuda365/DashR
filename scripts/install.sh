#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  DashR — One-line installer
#  Usage: curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/dashr/main/scripts/install.sh | bash
# ─────────────────────────────────────────────────────────────────
set -e

DASHR_VERSION="0.1.0"
DASHR_DIR="${HOME}/.dashr"
DASHR_REPO="https://github.com/YOUR_ORG/dashr.git"
PORT="${DASHR_PORT:-3000}"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

banner() {
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo "  ██████╗  █████╗ ███████╗██╗  ██╗██████╗ "
  echo "  ██╔══██╗██╔══██╗██╔════╝██║  ██║██╔══██╗"
  echo "  ██║  ██║███████║███████╗███████║██████╔╝"
  echo "  ██║  ██║██╔══██║╚════██║██╔══██║██╔══██╗"
  echo "  ██████╔╝██║  ██║███████║██║  ██║██║  ██║"
  echo "  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝"
  echo -e "${RESET}"
  echo -e "  ${BOLD}Orchestration control plane for OpenClaw${RESET}  v${DASHR_VERSION}"
  echo ""
}

check_dep() {
  if ! command -v "$1" &> /dev/null; then
    echo -e "${RED}✗ Required: $1 is not installed${RESET}"
    echo "  Install it from: $2"
    exit 1
  fi
}

banner

echo -e "${BOLD}Checking dependencies...${RESET}"
check_dep "node" "https://nodejs.org"
check_dep "npm"  "https://nodejs.org"
check_dep "git"  "https://git-scm.com"

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 20 ]; then
  echo -e "${RED}✗ Node.js 20+ required (you have $(node -v))${RESET}"
  exit 1
fi

echo -e "${GREEN}✓ Node.js $(node -v)${RESET}"
echo -e "${GREEN}✓ npm $(npm -v)${RESET}"

# Clone or update
echo ""
echo -e "${BOLD}Installing DashR...${RESET}"

if [ -d "$DASHR_DIR" ]; then
  echo "→ Updating existing installation at $DASHR_DIR"
  cd "$DASHR_DIR" && git pull
else
  echo "→ Cloning DashR to $DASHR_DIR"
  git clone "$DASHR_REPO" "$DASHR_DIR"
  cd "$DASHR_DIR"
fi

# Install dependencies
echo "→ Installing dependencies..."
npm install --silent

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo -e "${YELLOW}→ Created .env — edit it with your OpenClaw token:${RESET}"
  echo "  OPENCLAW_GATEWAY_TOKEN=<your token from: openclaw gateway status>"
fi

# Run migrations + seeds
echo "→ Setting up database..."
npm run db:migrate --silent
npm run db:seed --silent

echo ""
echo -e "${GREEN}${BOLD}✓ DashR installed successfully!${RESET}"
echo ""
echo -e "  Start now:     ${CYAN}cd $DASHR_DIR && npm start${RESET}"
echo -e "  Open browser:  ${CYAN}http://localhost:${PORT}${RESET}"
echo ""
echo -e "  Edit config:   ${CYAN}$DASHR_DIR/.env${RESET}"
echo -e "  Docs:          ${CYAN}https://github.com/YOUR_ORG/dashr/tree/main/docs${RESET}"
echo ""
echo -e "${YELLOW}Tip: Add OpenClaw hooks so DashR receives live agent events:${RESET}"
echo '  Edit ~/.openclaw/openclaw.json → add hooks endpoint → openclaw gateway restart'
echo ""
