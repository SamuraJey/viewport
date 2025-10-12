#!/bin/bash
# Celery queue management script

case "$1" in
  purge)
    echo "Purging all tasks from Celery queue..."
    docker exec viewport_celery_worker uv run celery -A src.viewport.background_tasks purge -f
    ;;

  stats)
    echo "Celery worker statistics..."
    docker exec viewport_celery_worker uv run celery -A src.viewport.background_tasks inspect stats
    ;;

  active)
    echo "Active tasks..."
    docker exec viewport_celery_worker uv run celery -A src.viewport.background_tasks inspect active
    ;;

  scheduled)
    echo "Scheduled tasks..."
    docker exec viewport_celery_worker uv run celery -A src.viewport.background_tasks inspect scheduled
    ;;

  queue-length)
    echo "Queue length..."
    docker exec viewport_redis redis-cli LLEN celery
    ;;

  *)
    echo "Usage: $0 {purge|stats|active|scheduled|queue-length}"
    exit 1
    ;;
esac
