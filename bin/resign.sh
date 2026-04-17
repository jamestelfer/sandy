#!/usr/bin/env bash
set -euo pipefail

# Bun --compile on macOS produces an ad-hoc signature the arm64 kernel rejects
# at exec. Strip and re-sign. No-op on other platforms.
if [[ "$(uname)" != Darwin ]]; then
  exit 0
fi

codesign --remove-signature dist/sandy 2>/dev/null || true
codesign -s - --force dist/sandy
