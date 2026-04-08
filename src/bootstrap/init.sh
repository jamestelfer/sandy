#!/bin/sh
#
# Initialise the sandy VM snapshot: install certificates, Node.js,
# pnpm, workspace dependencies, and profile.d environment scripts.

set -eu

BOOTSTRAP=/tmp/bootstrap
CERT_FILE="${BOOTSTRAP}/certs/nscacert.pem"

# --- Netskope MitM certificates ---
if [ -f "${CERT_FILE}" ]; then
  echo "Installing Netskope MitM certificates..."
  mkdir -p /usr/local/share/ca-certificates
  cp "${CERT_FILE}" /usr/local/share/ca-certificates/netskope.crt

  if ! command -v update-ca-certificates > /dev/null; then
    apt-get update
    apt-get install --yes ca-certificates
    rm -rf /var/lib/apt/lists/*
  fi

  update-ca-certificates
else
  echo "No Netskope certificate found, skipping"
fi

# --- Node.js ---
NODE_VERSION=v24.14.1
NODE_ARCH=linux-arm64
NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${NODE_ARCH}.tar.xz"
echo "Installing Node.js ${NODE_VERSION}..."
curl -fsSL "${NODE_URL}" | tar -xJ -C /usr --strip-components=1

# --- pnpm ---
corepack enable
corepack prepare pnpm@latest --activate

# --- Workspace ---
mkdir -p /workspace
cp "${BOOTSTRAP}/package.json" /workspace/
cp "${BOOTSTRAP}/tsconfig.json" /workspace/
cp "${BOOTSTRAP}/entrypoint" /workspace/entrypoint
chmod +x /workspace/entrypoint

# --- profile.d scripts ---
for f in "${BOOTSTRAP}"/*.sh; do
  [ "$(basename "$f")" = "init.sh" ] && continue
  cp "$f" /etc/profile.d/
done

# --- Dependencies ---
cd /workspace
pnpm install
