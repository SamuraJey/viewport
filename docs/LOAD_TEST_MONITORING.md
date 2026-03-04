# Load Testing Monitoring Guide

## Quick Start

### 1. Run Backend
```bash
uvicorn viewport.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Start Monitor (in separate terminal)
```bash
python performance_tests/monitor_load.py
```

### 3. Run Load Test (in third terminal)
```bash
cd performance_tests
locust -f locustfile_optimized.py --host=http://localhost:8000
```

Then open http://localhost:8089 and start the load test.

---

## Monitoring Endpoints

### `/monitoring/health` - Full health check
Returns comprehensive metrics:
- **Connection Pool**: checked_in, checked_out, overflow, utilization %
- **Threads**: active count and list
- **Event Loop**: running status, task count
- **Warnings**: automatic alerts when limits approached

Example:
```bash
curl http://localhost:8000/monitoring/health | jq
```

### `/monitoring/pool` - Quick pool status
Returns just connection pool stats for fast polling:
```bash
curl http://localhost:8000/monitoring/pool
```

Example response:
```json
{
  "checked_in": 18,
  "checked_out": 2,
  "overflow": 0,
  "size": 20,
  "utilization_pct": 5.0
}
```

---

## Real-Time Monitoring Script

### Basic Usage
```bash
python performance_tests/monitor_load.py
```

### Custom URL
```bash
python performance_tests/monitor_load.py --url http://192.168.1.50:8000
```

### Custom Refresh Interval
```bash
python performance_tests/monitor_load.py --interval 1  # Update every second
```

### Output Example
```
================================================================================
                     VIEWPORT LOAD TEST MONITORING
================================================================================
Monitoring: http://localhost:8000/monitoring/health
Refresh interval: 2s
Press Ctrl+C to stop


[14:23:45] Status: ✅ HEALTHY

📊 CONNECTION POOL:
   Checked Out:      2 / 40  (5.0%)
   Checked In:      18 (idle)
   Overflow:         0
   Pool Size:       20

🧵 THREADS:
   Active Count:   8

🔄 EVENT LOOP:
   Running:        True
   Task Count:     3
```

---

## Warning Thresholds

The monitoring system automatically warns when:

### 🔴 Critical Issues
- **Connection pool > 80% utilized**: Risk of exhaustion
- **Using overflow connections**: Temporary connections in use
- **Thread count > 50**: Possible thread leak

### Example Warning Output
```
[14:25:12] Status: ⚠️  WARNING

⚠️  WARNINGS:
   ⚠️  Connection pool usage HIGH: 35/40
   ⚠️  Using overflow connections: 5

📊 CONNECTION POOL:
   Checked Out:     35 / 40  (87.5%)
   Checked In:       0 (idle)
   Overflow:         5
   Pool Size:       20
```

---

## What to Watch During Load Testing

### 1. Connection Pool Utilization
- **Healthy**: < 50% utilization
- **Warning**: > 80% utilization
- **Critical**: Overflow > 0 (using temporary connections)
- **Failed**: checked_out = total_capacity (pool exhausted)

### 2. Thread Count
- **Healthy**: < 20 threads
- **Warning**: > 50 threads
- **Critical**: Continuously growing

### 3. Event Loop Tasks
- **Healthy**: < 10 tasks
- **Warning**: > 50 tasks
- **Critical**: Continuously growing

### 4. Response Time Patterns
Watch for:
- Sudden spikes in response time → connection pool bottleneck
- Gradual increase over time → connection leak
- Timeouts → complete pool exhaustion

---

## Using with Prometheus (Advanced)

The `/metrics` endpoint exposes Prometheus metrics:

```bash
curl http://localhost:8000/metrics
```

Import the dashboard into Grafana for historical tracking.

---

## Troubleshooting

### Monitor shows errors
Backend is likely down or not responding. Check:
```bash
curl http://localhost:8000/
```

### High utilization during low load
Possible connection leak. Check server logs for "Long-lived session" warnings.

### Overflow connections used
Pool size may be too small, or requests are slow. Investigate:
1. Slow queries (check DB logs)
2. Blocking operations in async code
3. Increase pool_size in `src/viewport/models/db.py`

### Thread count growing
Possible thread leak. Check for:
1. Background tasks not completing
2. Deadlocks
3. Blocking I/O in async context

---

## Load Test Workflow

1. **Start backend** in one terminal
2. **Start monitor** in second terminal
3. **Run Locust** in third terminal
4. **Watch monitor output** while ramping up users
5. **Look for warnings** as load increases
6. **Note when problems start** (connection pool, threads, response times)
7. **Stop test if critical warnings** appear

### Success Criteria
After 30+ minutes at target load:
- ✅ Connection pool utilization < 80%
- ✅ No overflow connections
- ✅ Thread count stable
- ✅ Event loop task count stable
- ✅ No warnings in monitor output
- ✅ Response times consistent

### Failure Indicators
- ❌ Connection pool utilization > 90%
- ❌ Overflow connections increasing
- ❌ Thread count continuously growing
- ❌ Response times degrading over time
- ❌ Timeouts or 502 errors
