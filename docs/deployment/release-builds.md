# TrueNAS release builds

Woodpecker runs `ci/build.sh` from `main`. The release poller supplies
`RELEASE_SHA`, `RELEASE_TAG` and `RELEASE_ID`; the script clones the Forgejo mirror
and verifies the commit and tag before building.

Both builds use `docker buildx build --builder default --progress plain --push`.
This uses BuildKit inside the NAS Docker Engine, without creating or deleting a
separate BuildKit container. Build cache remains in the daemon across pipelines.
Backend and frontend are built sequentially from the release's root Dockerfiles
with target `runtime`. The backend runtime is also used by both Celery workers.

The pipeline sets `NPM_REGISTRY=https://npm-mirror.gitverse.ru`. The build script
defaults to npmjs when run without that variable. For compatibility with older
releases, it creates a temporary frontend Dockerfile and inserts an ARG and ENV
for `npm_config_registry` immediately before the first `RUN npm ci`. The release
checkout, npm install flags and lockfile remain unchanged. npm replaces default
npmjs tarball URLs with the configured registry and retains lockfile integrity
checks. This also supports retrying an existing release after only updating CI
in `main`; it does not fix that release's other Dockerfile issues. The temporary
Dockerfile is removed on exit. No second Dockerfile is maintained in the repo.

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
