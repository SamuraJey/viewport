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
#   VIEWPORT_REGISTRY      Docker registry (default: 192.168.1.15:5000)
#
# Examples:
#   ./scripts/build-release.sh
#   ./scripts/build-release.sh v0.15.0-beta1
# ---------------------------------------------------------------------------
REGISTRY="${VIEWPORT_REGISTRY:?ERROR: VIEWPORT_REGISTRY not set — export it or pass inline}"
VITE_API_URL="${VIEWPORT_BACKEND_URL:?ERROR: VIEWPORT_BACKEND_URL not set — export it or pass inline}"

# ── Resolve version ──────────────────────────────────────────────────────

if [[ $# -ge 1 ]]; then
  VERSION="$1"
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
    if [[ "${LATEST_TAG}" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)(-.*)?$ ]]; then
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
echo "==> Checking for uncommitted changes..."
if ! git diff-index --quiet HEAD --; then
  echo "ERROR: uncommitted changes present — commit or stash them first" >&2
  exit 1
fi

if git rev-parse "${VERSION}" >/dev/null 2>&1; then
  echo "==> Tag ${VERSION} already exists locally — reusing"
else
  echo "==> Creating tag ${VERSION}..."
  git tag "${VERSION}"
fi

if git ls-remote --tags origin "${VERSION}" | grep -q "${VERSION}"; then
  echo "==> Tag ${VERSION} already on remote — reusing"
else
  echo "==> Pushing tag ${VERSION}..."
  git push origin "${VERSION}"
fi

# ── Docker build ─────────────────────────────────────────────────────────

echo ""
echo "==> Building backend image (${BACKEND_IMAGE})..."
docker build \
  --file Dockerfile.backend \
  --tag "${BACKEND_IMAGE}" \
  .

echo ""
echo "==> Building frontend image (${FRONTEND_IMAGE})..."
docker build \
  --file Dockerfile.frontend \
  --build-arg "VITE_API_URL=${VITE_API_URL}" \
  --tag "${FRONTEND_IMAGE}" \
  .

# ── Docker push ──────────────────────────────────────────────────────────

echo ""
echo "==> Pushing ${BACKEND_IMAGE}..."
docker push "${BACKEND_IMAGE}"

echo ""
echo "==> Pushing ${FRONTEND_IMAGE}..."
docker push "${FRONTEND_IMAGE}"

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
