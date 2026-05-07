# Runbook: Disk Space

Alert: `HostDiskSpaceLow`

## Impact

Postgres, RustFS object storage, Docker logs, Prometheus, Loki, and Tempo can fail when the host or volume fills.

## First checks

1. Identify the filesystem from the alert labels.
2. Check Docker volume usage for Postgres, RustFS, Prometheus, Loki, and Tempo.
3. Check whether logs/traces/metrics retention exceeded expected disk budget.
4. Confirm backups are healthy before deleting persistent data.

## Mitigation

Free safe temporary data, increase volume size, or reduce observability retention. Do not delete Postgres/RustFS data unless a human operator confirms backups and impact.
