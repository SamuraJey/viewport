# Runbook: API Latency

Alert: `ViewportAPILatencyHigh`

## Meaning

API p95 latency exceeded the draft threshold.

## First checks

1. Open `Viewport API` and inspect slow route candidates.
2. Check Postgres connection saturation and Redis/RustFS latency/error panels.
3. Look for upload, ZIP generation, or public share traffic spikes.
4. Use Tempo traces when app instrumentation is enabled; search slow traces around the alert window.

## Mitigation

Reduce load, disable expensive non-critical flows if available, or scale app/dependency resources after confirming the bottleneck.
