#!/bin/sh
# Run inside the frontend build stage; keep npm ci's lockfile/integrity contract.
set -eu
set -f

registries=${CI_NPM_REGISTRIES:-https://registry.npmjs.org https://npm-mirror.gitverse.ru}
install_timeout=${CI_NPM_INSTALL_TIMEOUT:-180}
case "$install_timeout" in
  *[!0-9]*|'') echo 'CI_NPM_INSTALL_TIMEOUT must be a positive number of seconds' >&2; exit 2 ;;
esac
test "$install_timeout" -gt 0 || exit 2
for registry in $registries; do
  case "$registry" in
    https://?*) ;;
    *) echo 'npm registries must be absolute HTTPS URLs' >&2; exit 2 ;;
  esac
done

last_status=1
for registry in $registries; do
  echo "Installing locked npm dependencies from $registry (limit ${install_timeout}s)"
  if timeout -k 10 "$install_timeout" npm ci "$@" \
    --registry="$registry" --replace-registry-host=npmjs \
    --prefer-offline --no-audit --no-fund \
    --fetch-timeout=20000 --fetch-retries=1 \
    --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=1000; then
    exit 0
  else
    last_status=$?
    echo "npm ci failed for $registry (exit $last_status); trying next registry if configured" >&2
  fi
done

echo 'npm ci failed for every configured registry' >&2
exit "$last_status"
