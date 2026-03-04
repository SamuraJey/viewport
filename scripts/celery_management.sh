#!/bin/bash
# Taskiq queue management script

case "$1" in
  stream-len)
    echo "Task stream length..."
    docker exec viewport_redis redis-cli XLEN viewport_tasks
    ;;

  pending)
    echo "Pending entries (last 20)..."
    docker exec viewport_redis redis-cli XREVRANGE viewport_tasks + - COUNT 20
    ;;

  groups)
    echo "Consumer groups..."
    docker exec viewport_redis redis-cli XINFO GROUPS viewport_tasks
    ;;

  consumers)
    echo "Consumers in viewport_workers group..."
    docker exec viewport_redis redis-cli XINFO CONSUMERS viewport_tasks viewport_workers
    ;;

  *)
    echo "Usage: $0 {stream-len|pending|groups|consumers}"
    exit 1
    ;;
esac
