# TrueNAS release builds

Woodpecker runs `ci/build.sh` from `main`. The release poller supplies
`RELEASE_SHA`, `RELEASE_TAG` and `RELEASE_ID`; the script clones the Forgejo mirror
and verifies the commit and tag before building.

Both builds use `docker buildx build --builder default --progress plain --push`.
This uses BuildKit inside the NAS Docker Engine, without creating or deleting a
separate BuildKit container. Build cache remains in the daemon across pipelines.
Backend and frontend are built sequentially from the release's root Dockerfiles
with target `runtime`. The backend runtime is also used by both Celery workers.

## npm registry fallback

Woodpecker tries `https://registry.npmjs.org` first and
`https://npm-mirror.gitverse.ru` second. Configure the primary with
`NPM_REGISTRY` and the ordered, space-separated alternatives with
`NPM_FALLBACK_REGISTRIES`. Set the latter to an empty string to disable fallback.
Only HTTPS registry URLs are accepted.

Each complete `npm ci` attempt has a `NPM_INSTALL_TIMEOUT` budget (180 seconds by
default), followed by at most 10 seconds before forced termination. Individual
HTTP requests have a 20-second timeout and one retry after one second. With the
default two registries, installation takes at most about 6 minutes 20 seconds
before failing if neither works. This budget includes dependency lifecycle scripts;
increase it for unusually slow cold installs. Registry failures and transitions
are printed in the build log. Every registry failing still fails the build.

For compatibility with existing release tags, `ci/build.sh` uses
`ci/prepare-frontend.awk` to inject the current `ci/npm-ci.sh` installer from
`main` into a temporary frontend Dockerfile. Both legacy `RUN npm ci` and
`RUN --mount=... npm ci` instructions retain their original install flags and
error handling. The release checkout and lockfile remain unchanged. The
temporary Dockerfile is removed on exit; no second Dockerfile is maintained.

Current frontend builds cache npm downloads in `/root/.npm`; fallback attempts
reuse successful downloads via `--prefer-offline`. Host `node_modules` is
excluded from the build context. npm replaces default npmjs tarball URLs with
the registry for the current attempt and retains lockfile integrity checks.
Lockfiles committed with third-party tarball URLs require separate review;
the installer does not rewrite arbitrary package hosts.

To recover the failed release, get these CI files onto the Woodpecker pipeline's
`main` branch, then rerun that release pipeline. A new application release tag
is not required: the application source still comes from `RELEASE_SHA`, while
the fallback installer comes from `main`. This does not fix unrelated problems
in an older release's Dockerfile.

Offline fallback checks (success, registry failure, timeout, total failure and
legacy Dockerfile compatibility):

```sh
python -m unittest discover -s ci -p 'test_*.py' -v
```

Set `forgejo_clone_url`, `registry_address` and `vite_api_url` as Woodpecker
repository secrets allowed for manual events. Infrastructure addresses are not
stored in the public pipeline. The NAS Docker daemon must already support the
registry's transport; an HTTP registry needs its insecure-registry configuration.
This pipeline does not modify the NAS daemon configuration.

There is no separate 2 GiB / 1 CPU builder limit. The Woodpecker step's memory
limit applies to the client container, not daemon-side build work. One workflow
at a time is retained, but Docker can run parallel operations inside a build.
Daemon build cache/images persist; arrange retention independently of this script.

Images receive the release tag, full SHA and `release-<ID>` tags. No latest tag is
published. Tests run on GitHub and TrueNAS Apps are updated manually after the
whole pipeline succeeds. The script removes only its temporary source checkout,
including when cloning or building fails.

## Frontend static server

The frontend runtime uses the official `nginx:1.31.8-alpine-slim` image, pinned
by its multi-platform digest in `Dockerfile.frontend`. It upgrades the previous
1.31.4 mainline release while removing optional image-filter, GeoIP, XSLT, njs
and ACME packages. The server only serves Vite assets and falls back to
`index.html` for SPA routes; no optional nginx modules are required.

Local amd64 verification passed Docker build, `nginx -t`, HTTP index and nested
SPA route checks, and JavaScript asset delivery with the correct MIME type.
Using `docker image inspect --format '{{.Size}}'` on the same Docker installation,
the complete frontend image shrank from 98,438,693 to 25,361,038 bytes (74.2%).
