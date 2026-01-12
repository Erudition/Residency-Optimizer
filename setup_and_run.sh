#!/bin/bash
export NVM_DIR="$HOME/.config/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "Node version: $(node -v 2>/dev/null || echo 'none')"

if ! command -v node &> /dev/null; then
    echo "Installing node..."
    nvm install --lts
    nvm use --lts
fi

if ! command -v pnpm &> /dev/null; then
    echo "Installing pnpm..."
    npm install -g pnpm
fi

echo "Installing dependencies..."
pnpm install

echo "Starting dev server..."
pnpm dev
