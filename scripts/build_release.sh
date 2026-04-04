#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Building Secbot npm release package..."
npm run release:pack

echo "Release package created successfully."
ls -1 secbot-*.tgz 2>/dev/null || true
