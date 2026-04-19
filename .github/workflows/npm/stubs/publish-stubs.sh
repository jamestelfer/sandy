#!/usr/bin/env bash
set -euo pipefail

# One-off bootstrap: publish minimal placeholder packages so npm Trusted
# Publishers can be configured against a name that exists. Uses dist-tag
# `next` so these stubs do not occupy `latest`. After running this, configure
# the trusted publisher for each package on npmjs.com, then cut a real
# release — publish.sh will overwrite these and set `latest`.
#
# Usage:
#   npm login
#   .github/workflows/npm/stubs/publish-stubs.sh
#
# Environment:
#   VERSION: placeholder version to publish (default: 0.0.1-alpha.0)
#   DIST_TAG: dist-tag to publish under (default: next)

VERSION="${VERSION:-0.0.1-alpha.0}"
DIST_TAG="${DIST_TAG:-next}"

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

publish_stub() {
  local name="${1}"
  local os="${2-}"
  local cpu="${3-}"

  local tmpdir
  tmpdir="$(make_tmpdir)"

  if [[ -n "${os}" ]]; then
    cat > "${tmpdir}/package.json" <<PKGJSON
{
  "name": "${name}",
  "version": "${VERSION}",
  "description": "Bootstrap placeholder — do not install. Real release forthcoming.",
  "os": ["${os}"],
  "cpu": ["${cpu}"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/jamestelfer/sandy.git"
  }
}
PKGJSON
  else
    cat > "${tmpdir}/package.json" <<PKGJSON
{
  "name": "${name}",
  "version": "${VERSION}",
  "description": "Bootstrap placeholder — do not install. Real release forthcoming.",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/jamestelfer/sandy.git"
  }
}
PKGJSON
  fi

  (cd "${tmpdir}" && npm publish --access public --tag "${DIST_TAG}")
  echo "published ${name}@${VERSION} (tag: ${DIST_TAG})"
}

main() {
  publish_stub "@jamestelfer/sandy"
  publish_stub "@jamestelfer/sandy-linux-x64"    linux  x64
  publish_stub "@jamestelfer/sandy-linux-arm64"  linux  arm64
  publish_stub "@jamestelfer/sandy-darwin-x64"   darwin x64
  publish_stub "@jamestelfer/sandy-darwin-arm64" darwin arm64
}

main "$@"
