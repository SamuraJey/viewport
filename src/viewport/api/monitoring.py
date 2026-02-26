"""Real-time monitoring endpoint for load testing diagnostics."""

import asyncio
import threading
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from viewport.models.db import get_db

router = APIRouter(prefix="/monitoring", tags=["monitoring"])


@router.get("/health")
def get_health_metrics(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Get real-time health metrics for connection pool, threads, and event loop.

    Use this during load testing to monitor:
    - Connection pool exhaustion (checked_out approaching pool_size + max_overflow)
    - Thread count growth
    - Event loop task backlog
    """
    # 1. Connection Pool Status
    pool = db.get_bind().pool
    pool_status = {
        "size": pool.size(),  # Current pool size
        "checked_in": pool.checkedin(),  # Idle connections available
        "checked_out": pool.checkedout(),  # Active connections in use
        "overflow": pool.overflow(),  # Temporary connections beyond pool_size
        "limit": {
            "pool_size": pool._pool.maxsize if hasattr(pool, "_pool") else "N/A",
            "max_overflow": getattr(pool, "_max_overflow", "N/A"),
            "total_capacity": pool.size() + getattr(pool, "_max_overflow", 0),
        },
        "utilization_pct": round(pool.checkedout() / (pool.size() + getattr(pool, "_max_overflow", 0)) * 100, 1),
    }

    # 2. Thread Status
    thread_status = {
        "active_count": threading.active_count(),
        "threads": [
            {
                "name": t.name,
                "daemon": t.daemon,
                "alive": t.is_alive(),
            }
            for t in threading.enumerate()
        ],
    }

    # 3. Event Loop Status (if available)
    try:
        loop = asyncio.get_running_loop()
        event_loop_status = {
            "running": loop.is_running(),
            "closed": loop.is_closed(),
            "task_count": len(asyncio.all_tasks(loop)),
            "tasks": [
                {
                    "name": task.get_name(),
                    "done": task.done(),
                    "cancelled": task.cancelled(),
                }
                for task in list(asyncio.all_tasks(loop))[:10]  # First 10 tasks only
            ],
        }
    except RuntimeError:
        event_loop_status = {"error": "No event loop running in this thread"}

    # 4. Warnings
    warnings = []
    if pool.checkedout() > (pool.size() * 0.8):
        warnings.append(f"⚠️  Connection pool usage HIGH: {pool.checkedout()}/{pool.size() + getattr(pool, '_max_overflow', 0)}")
    if pool.overflow() > 0:
        warnings.append(f"⚠️  Using overflow connections: {pool.overflow()}")
    if threading.active_count() > 50:
        warnings.append(f"⚠️  High thread count: {threading.active_count()}")

    return {
        "status": "healthy" if not warnings else "warning",
        "warnings": warnings,
        "connection_pool": pool_status,
        "threads": thread_status,
        "event_loop": event_loop_status,
    }


@router.get("/pool")
def get_pool_stats(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Quick connection pool status check."""
    pool = db.get_bind().pool
    return {
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "size": pool.size(),
        "utilization_pct": round(pool.checkedout() / (pool.size() + getattr(pool, "_max_overflow", 0)) * 100, 1),
    }
