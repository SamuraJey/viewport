#!/bin/sh
set -eu
: "${RELEASE_SHA:?missing RELEASE_SHA: run via release-poller}"
: "${RELEASE_TAG:?missing RELEASE_TAG}"
: "${RELEASE_ID:?missing RELEASE_ID}"
case "$RELEASE_ID" in *[!0-9]*|'') exit 1;; esac
: "${FORGEJO_CLONE_URL:?missing FORGEJO_CLONE_URL}"
: "${VITE_API_URL:?missing VITE_API_URL: required for the production frontend}"
case "$VITE_API_URL" in https://?*) ;; *) echo 'VITE_API_URL must be an absolute HTTPS URL' >&2; exit 1;; esac
ci_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
NPM_REGISTRY=${NPM_REGISTRY:-https://registry.npmjs.org}
NPM_FALLBACK_REGISTRIES=${NPM_FALLBACK_REGISTRIES-https://npm-mirror.gitverse.ru}
NPM_INSTALL_TIMEOUT=${NPM_INSTALL_TIMEOUT:-180}
case "$NPM_INSTALL_TIMEOUT" in *[!0-9]*|'') echo 'NPM_INSTALL_TIMEOUT must be positive seconds' >&2; exit 1;; esac
test "$NPM_INSTALL_TIMEOUT" -gt 0
for npm_fallback in $NPM_FALLBACK_REGISTRIES; do
  case "$npm_fallback" in https://?*) ;; *) echo 'NPM_FALLBACK_REGISTRIES must contain HTTPS URLs' >&2; exit 1;; esac
done
case "$NPM_REGISTRY" in https://?*) ;; *) echo 'NPM_REGISTRY must be an absolute HTTPS URL' >&2; exit 1;; esac
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
frontend_dockerfile=
cleanup() {
  rm -rf "$source_dir"
  if test -n "$frontend_dockerfile"; then rm -f "$frontend_dockerfile"; fi
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

# Inject the installer from main so existing release tags get the same fallback
# policy without modifying their checkout, lockfile, install flags or cache mounts.
frontend_dockerfile=$(mktemp /tmp/viewport-frontend.XXXXXX)
install_script=$(base64 < "$ci_dir/npm-ci.sh" | tr -d '\n')
awk -v install_script="$install_script" -f "$ci_dir/prepare-frontend.awk" \
  "$source_dir/Dockerfile.frontend" > "$frontend_dockerfile" || {
  echo 'Cannot configure npm fallback: expected a RUN npm ci instruction' >&2
  exit 1
}

# Use the NAS Docker Engine's built-in builder and persistent cache.
# Registry transport is configured on the NAS daemon, including HTTP registries.
# The CI step's resource limits do not limit daemon-side build work.
# Both contexts are the monorepo root. Backend runtime is also used by Celery.
docker buildx build --builder default --progress plain --push \
  --file "$source_dir/Dockerfile.backend" --target runtime \
  --label "org.opencontainers.image.revision=$RELEASE_SHA" \
  --label "org.opencontainers.image.version=$RELEASE_TAG" \
  -t "$REGISTRY/viewport/backend:$RELEASE_SHA" \
  -t "$REGISTRY/viewport/backend:$RELEASE_TAG" \
  -t "$REGISTRY/viewport/backend:release-$RELEASE_ID" "$source_dir"

# Registry attempts share the release Dockerfile's npm download cache.
docker buildx build --builder default --progress plain --push \
  --file "$frontend_dockerfile" --target runtime \
  --build-arg "CI_NPM_REGISTRIES=$NPM_REGISTRY $NPM_FALLBACK_REGISTRIES" \
  --build-arg "CI_NPM_INSTALL_TIMEOUT=$NPM_INSTALL_TIMEOUT" \
  --build-arg "VITE_API_URL=$VITE_API_URL" \
  --label "org.opencontainers.image.revision=$RELEASE_SHA" \
  --label "org.opencontainers.image.version=$RELEASE_TAG" \
  -t "$REGISTRY/viewport/frontend:$RELEASE_SHA" \
  -t "$REGISTRY/viewport/frontend:$RELEASE_TAG" \
  -t "$REGISTRY/viewport/frontend:release-$RELEASE_ID" "$source_dir"
