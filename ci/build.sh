#!/bin/sh
set -eu
: "${RELEASE_SHA:?missing RELEASE_SHA: run via release-poller}"
: "${RELEASE_TAG:?missing RELEASE_TAG}"
: "${RELEASE_ID:?missing RELEASE_ID}"
case "$RELEASE_ID" in *[!0-9]*|'') exit 1;; esac
: "${FORGEJO_CLONE_URL:?missing FORGEJO_CLONE_URL}"
: "${VITE_API_URL:?missing VITE_API_URL: required for the production frontend}"
case "$VITE_API_URL" in https://?*) ;; *) echo 'VITE_API_URL must be an absolute HTTPS URL' >&2; exit 1;; esac
: "${REGISTRY:?missing REGISTRY: configure registry_address in Woodpecker}"
printf '%s\n' "$REGISTRY" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9.-]*:[0-9]{1,5}$' || {
  echo 'REGISTRY must be host:port without a URL scheme or path' >&2; exit 1;
}
registry_port=${REGISTRY##*:}
test "$registry_port" -ge 1 && test "$registry_port" -le 65535 || {
  echo 'REGISTRY port must be between 1 and 65535' >&2; exit 1;
}
case "$RELEASE_SHA" in *[!0-9a-f]*|'') exit 1;; esac
test "${#RELEASE_SHA}" -eq 40 || test "${#RELEASE_SHA}" -eq 64
# This validation is duplicated in poller for manual/API-triggered pipelines.
printf '%s\n' "$RELEASE_TAG" | grep -Eq '^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$'

# Git credentials are not put in URL, command arguments, or saved config.
if test -n "${FORGEJO_READ_TOKEN:-}"; then
  auth=$(printf '%s:%s' "${FORGEJO_READ_USER:?}" "$FORGEJO_READ_TOKEN" | base64 | tr -d '\n')
  export GIT_CONFIG_COUNT=1
  export GIT_CONFIG_KEY_0=http.extraHeader
  export GIT_CONFIG_VALUE_0="Authorization: Basic $auth"
fi
export GIT_TERMINAL_PROMPT=0
source_dir=$(mktemp -d /tmp/release-source.XXXXXX)
builder="viewport-${CI_PIPELINE_NUMBER:-manual}-$$"
builder_created=false
cleanup() {
  if test "$builder_created" = true; then docker buildx rm "$builder" >/dev/null 2>&1 || true; fi
  rm -rf "$source_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
git clone --no-checkout -- "$FORGEJO_CLONE_URL" "$source_dir"
git -C "$source_dir" checkout --detach "$RELEASE_SHA"
actual_sha=$(git -C "$source_dir" rev-parse HEAD)
test "$actual_sha" = "$RELEASE_SHA"
tag_sha=$(git -C "$source_dir" rev-parse --verify "refs/tags/$RELEASE_TAG^{commit}")
test "$tag_sha" = "$RELEASE_SHA"
unset GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0 FORGEJO_READ_TOKEN auth

# BuildKit runs on the NAS with independent CPU/memory limits.
# This config is generated so changing REGISTRY cannot leave a stale port.
cat > "$source_dir/.viewport-buildkit.toml" <<EOF
[registry."$REGISTRY"]
  http = true
[worker.oci]
  max-parallelism = 1
EOF
docker buildx create --name "$builder" --driver docker-container \
  --driver-opt network=host,memory=2g,cpu-quota=100000 \
  --buildkitd-config "$source_dir/.viewport-buildkit.toml"
builder_created=true

# Both contexts are the monorepo root. Backend runtime is also used by Celery.
# Push directly through BuildKit: do not load release images into the NAS daemon.
docker buildx build --builder "$builder" --push \
  --file "$source_dir/Dockerfile.backend" --target runtime \
  --label "org.opencontainers.image.revision=$RELEASE_SHA" \
  --label "org.opencontainers.image.version=$RELEASE_TAG" \
  -t "$REGISTRY/viewport/backend:$RELEASE_SHA" \
  -t "$REGISTRY/viewport/backend:$RELEASE_TAG" \
  -t "$REGISTRY/viewport/backend:release-$RELEASE_ID" "$source_dir"

# Dockerfile, application sources and lockfile come from the exact release SHA.
docker buildx build --builder "$builder" --push \
  --file "$source_dir/Dockerfile.frontend" --target runtime \
  --build-arg "VITE_API_URL=$VITE_API_URL" \
  --label "org.opencontainers.image.revision=$RELEASE_SHA" \
  --label "org.opencontainers.image.version=$RELEASE_TAG" \
  -t "$REGISTRY/viewport/frontend:$RELEASE_SHA" \
  -t "$REGISTRY/viewport/frontend:$RELEASE_TAG" \
  -t "$REGISTRY/viewport/frontend:release-$RELEASE_ID" "$source_dir"
