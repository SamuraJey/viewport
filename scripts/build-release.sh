#!/usr/bin/env bash
set -euo pipefail
# ---------------------------------------------------------------------------
# build-release.sh — tag, build & push Viewport images to a local registry.
#
# Usage:
#   ./scripts/build-release.sh [version]
#
# Without arguments: auto-bumps MINOR from the latest v* tag, preserving suffix
#                   (v0.14.0-alpha → v0.15.0-alpha).
# With a version:    uses it literally (e.g. v0.15.0-beta1).
#
# Required env vars:
#   VIEWPORT_BACKEND_URL   backend origin (e.g. https://backend.samuraj.su:4443)
#   VIEWPORT_REGISTRY      Docker registry
#
# Examples:
#   ./scripts/build-release.sh
#   ./scripts/build-release.sh v0.15.0-beta1
# ---------------------------------------------------------------------------
REGISTRY="${VIEWPORT_REGISTRY:?ERROR: VIEWPORT_REGISTRY not set — export it or pass inline}"
VITE_API_URL="${VIEWPORT_BACKEND_URL:?ERROR: VIEWPORT_BACKEND_URL not set — export it or pass inline}"

VERSION_PATTERN='^v([0-9]+)\.([0-9]+)\.([0-9]+)(-.*)?$'
TAG_CREATED_LOCAL=false
TAG_PUSHED_REMOTE=false
BACKEND_IMAGE_BUILT=false
FRONTEND_IMAGE_BUILT=false
BACKEND_IMAGE_PUSHED=false
FRONTEND_IMAGE_PUSHED=false

on_failure() {
  local exit_code="$1"
  local line_no="$2"
  trap - ERR

  echo "" >&2
  echo "ERROR: release failed at line ${line_no} (exit ${exit_code})." >&2
  echo "Partial release state:" >&2
  echo "  Tag ${VERSION:-<unresolved>}: local_created=${TAG_CREATED_LOCAL}, remote_pushed=${TAG_PUSHED_REMOTE}" >&2
  echo "  Backend image: built=${BACKEND_IMAGE_BUILT}, pushed=${BACKEND_IMAGE_PUSHED}" >&2
  echo "  Frontend image: built=${FRONTEND_IMAGE_BUILT}, pushed=${FRONTEND_IMAGE_PUSHED}" >&2
  echo "Recovery: fix the failure and rerun this script with the same version." >&2
  echo "Reruns reuse an existing tag only when local/remote ${VERSION:-<version>} resolves to current HEAD." >&2
  echo "If only one image pushed, rerun to rebuild and push both images for the same tag." >&2
  exit "${exit_code}"
}

trap 'on_failure "$?" "$LINENO"' ERR

# ── Resolve version ──────────────────────────────────────────────────────

if [[ $# -ge 1 ]]; then
  VERSION="$1"
  if ! [[ "${VERSION}" =~ ${VERSION_PATTERN} ]]; then
    echo "ERROR: invalid version '${VERSION}' — expected vMAJOR.MINOR.PATCH[-suffix]" >&2
    exit 1
  fi
  echo "==> Using explicit version: ${VERSION}"
else
  echo "==> Auto-incrementing version from latest tag..."
  LATEST_TAG="$(git tag -l 'v*' --sort=-v:refname | head -1)"
  if [[ -z "${LATEST_TAG}" ]]; then
    VERSION="v0.1.0"
    echo "    No tags found — starting at ${VERSION}"
  else
    echo "    Latest tag: ${LATEST_TAG}"
    # Parse v<MAJOR>.<MINOR>.<PATCH>[-suffix]; preserve suffix on bump
    if [[ "${LATEST_TAG}" =~ ${VERSION_PATTERN} ]]; then
      MAJOR="${BASH_REMATCH[1]}"
      MINOR="${BASH_REMATCH[2]}"
      SUFFIX="${BASH_REMATCH[4]:-}"
      NEW_MINOR=$((MINOR + 1))
      VERSION="v${MAJOR}.${NEW_MINOR}.0${SUFFIX}"
      echo "    Bumped  → ${VERSION}"
    else
      echo "ERROR: cannot parse latest tag '${LATEST_TAG}' — expected vMAJOR.MINOR.PATCH" >&2
      exit 1
    fi
  fi
fi

BACKEND_IMAGE="${REGISTRY}/viewport:${VERSION}"
FRONTEND_IMAGE="${REGISTRY}/viewport-frontend:${VERSION}"

echo ""
echo "==> Version:   ${VERSION}"
echo "==> API URL:   ${VITE_API_URL}"
echo "==> Registry:  ${REGISTRY}"
echo "==> Backend:   ${BACKEND_IMAGE}"
echo "==> Frontend:  ${FRONTEND_IMAGE}"

# ── Git tag ──────────────────────────────────────────────────────────────

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [[ "${CURRENT_BRANCH}" != "main" ]]; then
  echo "ERROR: must be on 'main' branch (currently '${CURRENT_BRANCH}')" >&2
  exit 1
fi

echo ""
echo "==> Checking for uncommitted or untracked changes..."
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "ERROR: uncommitted or untracked changes present — commit or stash them first" >&2
  exit 1
fi

HEAD_COMMIT="$(git rev-parse HEAD)"
LOCAL_TAG_EXISTS=false

if git rev-parse -q --verify "refs/tags/${VERSION}" >/dev/null; then
  LOCAL_TAG_EXISTS=true
  LOCAL_TAG_COMMIT="$(git rev-list -n 1 "${VERSION}")"
  if [[ "${LOCAL_TAG_COMMIT}" != "${HEAD_COMMIT}" ]]; then
    echo "ERROR: local tag ${VERSION} points to ${LOCAL_TAG_COMMIT}, not current HEAD ${HEAD_COMMIT}" >&2
    echo "       Use a fresh version tag or move/delete the incorrect local tag intentionally." >&2
    exit 1
  fi
  echo "==> Tag ${VERSION} already exists locally at current HEAD — reusing"
fi

REMOTE_TAG_COMMIT="$(git ls-remote --tags origin "refs/tags/${VERSION}^{}" | awk 'NR == 1 {print $1}')"
if [[ -z "${REMOTE_TAG_COMMIT}" ]]; then
  REMOTE_TAG_COMMIT="$(git ls-remote --tags origin "refs/tags/${VERSION}" | awk 'NR == 1 {print $1}')"
fi

REMOTE_TAG_EXISTS=false
if [[ -n "${REMOTE_TAG_COMMIT}" ]]; then
  REMOTE_TAG_EXISTS=true
  if [[ "${REMOTE_TAG_COMMIT}" != "${HEAD_COMMIT}" ]]; then
    echo "ERROR: remote tag ${VERSION} points to ${REMOTE_TAG_COMMIT}, not current HEAD ${HEAD_COMMIT}" >&2
    echo "       Use a fresh version tag or correct the remote tag intentionally before release." >&2
    exit 1
  fi
  echo "==> Tag ${VERSION} already on remote at current HEAD — reusing"
fi

if [[ "${LOCAL_TAG_EXISTS}" == "false" ]]; then
  echo "==> Creating tag ${VERSION}..."
  git tag "${VERSION}"
  TAG_CREATED_LOCAL=true
fi

if [[ "${REMOTE_TAG_EXISTS}" == "false" ]]; then
  echo "==> Pushing tag ${VERSION}..."
  git push origin "${VERSION}"
  TAG_PUSHED_REMOTE=true
fi

# ── Docker build ─────────────────────────────────────────────────────────

echo ""
echo "==> Building backend image (${BACKEND_IMAGE})..."
docker build \
  --file Dockerfile.backend \
  --tag "${BACKEND_IMAGE}" \
  .
BACKEND_IMAGE_BUILT=true

echo ""
echo "==> Building frontend image (${FRONTEND_IMAGE})..."
docker build \
  --file Dockerfile.frontend \
  --build-arg "VITE_API_URL=${VITE_API_URL}" \
  --tag "${FRONTEND_IMAGE}" \
  .
FRONTEND_IMAGE_BUILT=true

# ── Docker push ──────────────────────────────────────────────────────────

echo ""
echo "==> Pushing ${BACKEND_IMAGE}..."
docker push "${BACKEND_IMAGE}"
BACKEND_IMAGE_PUSHED=true

echo ""
echo "==> Pushing ${FRONTEND_IMAGE}..."
docker push "${FRONTEND_IMAGE}"
FRONTEND_IMAGE_PUSHED=true

# ── Done ─────────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Release ${VERSION} built and pushed."
echo ""
echo "  Backend:  ${BACKEND_IMAGE}"
echo "  Frontend: ${FRONTEND_IMAGE}"
echo ""
echo "  docker run -d -p 8000:8000 ${BACKEND_IMAGE}"
echo "  docker run -d -p 80:80   ${FRONTEND_IMAGE}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
