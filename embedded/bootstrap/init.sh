#!/bin/sh
#
# Initialise the sandy VM snapshot: install certificates, Node.js,
# pnpm, workspace dependencies, and profile.d environment scripts.
#
# Usage: init.sh <step>
#   Steps: prerequisites, certificates, nodejs, pnpm, workspace,
#          profiles, dependencies, all

set -eu

readonly BOOTSTRAP=/tmp/bootstrap
readonly CERT_FILE="${BOOTSTRAP}/certs/nscacert.pem"

prerequisites() {
  echo "[--> install prerequisites"
  apt-get update -qq
  apt-get install -y --no-install-recommends ca-certificates
  apt-get clean -y
}

certificates() {
  echo "[--> add additional root certificates (if Netskope is in use)"
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
}

nodejs() {
  echo "[--> install Node.js"
  readonly NODE_VERSION=v24.14.1
  readonly NODE_ARCH=linux-arm64
  readonly NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${NODE_ARCH}.tar.xz"
  echo "Installing Node.js ${NODE_VERSION}..."
  apt-get install -y --no-install-recommends curl xz-utils
  curl -fsSL "${NODE_URL}" | tar -xJ -C /usr --strip-components=1
  apt-get clean -y
}

setup_pnpm() {
  echo "[--> install pnpm"
  corepack enable
  corepack prepare pnpm@latest --activate
}

workspace() {
  echo "[--> setup workspace runtime environment"
  mkdir -p /workspace
  cp "${BOOTSTRAP}/package.json" /workspace/
  cp "${BOOTSTRAP}/tsconfig.json" /workspace/
  cp "${BOOTSTRAP}/sandy.ts" /workspace/
  cp "${BOOTSTRAP}/entrypoint" /workspace/entrypoint
  chmod +x /workspace/entrypoint
}

profiles() {
  echo "[--> setup profile scripts for environment configuration"
  for f in "${BOOTSTRAP}"/*.sh; do
    [ "$(basename "${f}")" = "init.sh" ] && continue
    cp "${f}" /etc/profile.d/
  done
}

dependencies() {
  echo "[--> install workspace dependencies"
  cd /workspace
  pnpm install
}

run_all() {
  prerequisites
  certificates
  nodejs
  setup_pnpm
  workspace
  profiles
  dependencies
}

main() {
  case "${1:-}" in
    prerequisites) prerequisites ;;
    certificates) certificates ;;
    nodejs) nodejs ;;
    pnpm) setup_pnpm ;;
    workspace) workspace ;;
    profiles) profiles ;;
    dependencies) dependencies ;;
    all) run_all ;;
    *)
      echo "Usage: init.sh <step>" >&2
      echo "  Steps: prerequisites, certificates, nodejs, pnpm," >&2
      echo "         workspace, profiles, dependencies, all" >&2
      exit 1
      ;;
  esac
}

main "$@"
