# Runbook: RustFS/S3 Errors

Alerts: future app-side S3 error or synthetic-storage alerts.

## Impact

Uploads, thumbnails, downloads, ZIP exports, and object cleanup can fail.

## First checks

1. Check RustFS container health and disk space.
2. Verify app and worker can reach `S3_ENDPOINT` over the backend network.
3. Inspect app/worker logs for sanitized S3 operation failures.
4. Check whether failures align with large uploads, cleanup jobs, or RustFS restarts.

## Mitigation

Restore RustFS/storage health first. Avoid retry storms on destructive cleanup jobs until object-store health is stable.

Operator TODO: add a safe RustFS/S3 synthetic check using a non-production test prefix and credentials stored outside git before paging on storage probes.
