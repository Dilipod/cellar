#!/usr/bin/env bash
set -euo pipefail

# Dilipod Box — Installation Script
# Installs cellar runtime on dedicated hardware for always-on agent execution.

echo "==============================="
echo "  Dilipod Box Setup"
echo "  cellar runtime installer"
echo "==============================="
echo ""

OS="$(uname -s)"
INSTALL_DIR="${DILIPOD_HOME:-$HOME/.dilipod}"

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."

    if ! command -v git &> /dev/null; then
        echo "ERROR: git is not installed"
        exit 1
    fi

    if ! command -v curl &> /dev/null; then
        echo "ERROR: curl is not installed"
        exit 1
    fi

    echo "  git: $(git --version)"
    echo "  OS:  $OS"
    echo ""
}

# Install Rust if not present
install_rust() {
    if command -v rustc &> /dev/null; then
        echo "Rust already installed: $(rustc --version)"
    else
        echo "Installing Rust..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env"
    fi
}

# Install Node.js if not present
install_node() {
    if command -v node &> /dev/null; then
        echo "Node.js already installed: $(node --version)"
    else
        echo "Installing Node.js 20 LTS..."
        if [ "$OS" = "Darwin" ]; then
            # macOS: use Homebrew
            brew install node@20
        else
            # Linux/Windows: use nvm
            curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
            nvm install 20
        fi
    fi

    # Install pnpm
    if ! command -v pnpm &> /dev/null; then
        echo "Installing pnpm..."
        npm install -g pnpm
    fi
}

# Build cellar
build_cellar() {
    echo "Building cellar..."
    mkdir -p "$INSTALL_DIR"

    # Build Rust workspace
    echo "  Building Rust components..."
    cargo build --workspace --release

    # Build TypeScript packages
    echo "  Building TypeScript components..."
    pnpm install
    pnpm build

    echo "  Build complete."
}

# Setup autostart
setup_autostart() {
    echo "Setting up autostart..."
    if [ "$OS" = "Darwin" ]; then
        # macOS: install launchd plist
        cp box/autostart/macos-launchd.plist ~/Library/LaunchAgents/com.dilipod.cellar.plist
        launchctl load ~/Library/LaunchAgents/com.dilipod.cellar.plist
        echo "  macOS launchd agent installed."
    else
        echo "  Autostart setup for this platform is not yet automated."
        echo "  See box/autostart/ for platform-specific scripts."
    fi
}

# Main
check_prerequisites
install_rust
install_node
build_cellar
setup_autostart

echo ""
echo "Dilipod Box setup complete!"
echo "Run 'dilipod status' to verify."
