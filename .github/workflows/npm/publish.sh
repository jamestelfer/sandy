#!/usr/bin/env bash
set -euo pipefail

# Publishes platform-specific and main npm packages from goreleaser dist/ archives.
# Usage: publish.sh <version>
#   <version>: git tag, e.g. v1.2.3 — leading 'v' is stripped automatically.
# Environment:
#   DIST_DIR: path to goreleaser dist directory (default: dist)

DIST_DIR="${DIST_DIR:-dist}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TMPDIRS=()
cleanup() {
  for d in "${TMPDIRS[@]+"${TMPDIRS[@]}"}"; do
    rm -rf "${d}"
  done
}
trap cleanup EXIT

make_tmpdir() {
  local d
  d="$(mktemp -d)"
  TMPDIRS+=("${d}")
  echo "${d}"
}

publish_platform_package() {
  local version="${1}"
  local os="${2}"       # e.g. linux
  local arch="${3}"     # e.g. x64

  local pkg_name="@jamestelfer/sandy-${os}-${arch}"
  local archive="${DIST_DIR}/sandy-${version}-${os}-${arch}.tar.gz"
  local tmpdir
  tmpdir="$(make_tmpdir)"

  tar -xzf "${archive}" -C "${tmpdir}" sandy
  chmod +x "${tmpdir}/sandy"

  cat > "${tmpdir}/package.json" <<PKGJSON
{
  "name": "${pkg_name}",
  "version": "${version}",
  "description": "Sandboxed TypeScript runtime with AWS SDK access for AI agents — ${os} ${arch} binary",
  "os": ["${os}"],
  "cpu": ["${arch}"],
  "files": ["sandy"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/jamestelfer/sandy.git"
  }
}
PKGJSON

  npm publish --access public "${tag_args[@]+"${tag_args[@]}"}" "${tmpdir}"
  echo "published ${pkg_name}@${version}"
}

publish_main_package() {
  local version="${1}"
  local tmpdir
  tmpdir="$(make_tmpdir)"

  cp -r "${SCRIPT_DIR}/main/." "${tmpdir}/"
  cp "${SCRIPT_DIR}/../../../README.md" "${tmpdir}/README.md"
  # Replace placeholder version with the release version
  sed -i "s/0\.0\.0-dev/${version}/g" "${tmpdir}/package.json"

  npm publish --access public "${tag_args[@]+"${tag_args[@]}"}" "${tmpdir}"
  echo "published @jamestelfer/sandy@${version}"
}

main() {
  local version="${1:?'usage: publish.sh <version>'}"
  version="${version#v}"

  local tag_args=()
  if [[ "${version}" == *-* ]]; then
    tag_args=(--tag next)
  fi

  publish_platform_package "${version}" linux  x64
  publish_platform_package "${version}" linux  arm64
  publish_platform_package "${version}" darwin x64
  publish_platform_package "${version}" darwin arm64

  publish_main_package "${version}"
}

main "$@"
