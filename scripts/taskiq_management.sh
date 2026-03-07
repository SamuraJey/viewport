#!/bin/bash
# Taskiq queue management script
# Provides comprehensive task queue monitoring and management for Taskiq

set -e

REDIS_CONTAINER="viewport_redis"
REDIS_PORT=6379
QUEUE_NAME="viewport_tasks"
CONSUMER_GROUP="viewport_workers"
RESULT_DB=1
SCHEDULE_DB=2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_header() {
  echo -e "${YELLOW}=== $1 ===${NC}"
}

print_ok() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

# Check if Redis container is running
check_redis() {
  if ! docker ps | grep -q $REDIS_CONTAINER; then
    print_error "Redis container '$REDIS_CONTAINER' is not running"
    exit 1
  fi
}

case "$1" in
  stream-len)
    check_redis
    print_header "Task Stream Length"
    LEN=$(docker exec $REDIS_CONTAINER redis-cli XLEN $QUEUE_NAME)
    echo "Queue: $QUEUE_NAME"
    echo "Length: $LEN"
    ;;

  pending)
    check_redis
    print_header "Pending Tasks (Last 20)"
    docker exec $REDIS_CONTAINER redis-cli XREVRANGE $QUEUE_NAME + - COUNT 20
    ;;

  groups)
    check_redis
    print_header "Consumer Groups"
    docker exec $REDIS_CONTAINER redis-cli XINFO GROUPS $QUEUE_NAME
    ;;

  consumers)
    check_redis
    print_header "Consumers"
    docker exec $REDIS_CONTAINER redis-cli XINFO CONSUMERS $QUEUE_NAME $CONSUMER_GROUP
    ;;

  results-count)
    check_redis
    print_header "Results in Backend (DB $RESULT_DB)"
    COUNT=$(docker exec $REDIS_CONTAINER redis-cli -n $RESULT_DB DBSIZE | awk '{print $NF}')
    echo "Stored results: $COUNT"
    ;;

  schedules-list)
    check_redis
    print_header "Scheduled Tasks (DB $SCHEDULE_DB)"
    docker exec $REDIS_CONTAINER redis-cli -n $SCHEDULE_DB KEYS "schedules:*"
    ;;

  stats)
    check_redis
    print_header "Queue Statistics"
    echo ""
    echo "Stream Metrics:"
    docker exec $REDIS_CONTAINER redis-cli XINFO STREAM $QUEUE_NAME | grep -E "length|first-entry|last-entry|groups"
    echo ""
    print_header "Consumer Group Info"
    docker exec $REDIS_CONTAINER redis-cli XINFO GROUPS $QUEUE_NAME
    ;;

  purge)
    check_redis
    print_header "Purging Task Queue"
    echo "WARNING: This will delete all pending tasks in the queue!"
    echo "Proceed? (y/N)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
      docker exec $REDIS_CONTAINER redis-cli DEL $QUEUE_NAME
      print_ok "Queue purged"
    else
      echo "Purge cancelled"
    fi
    ;;

  purge-results)
    check_redis
    print_header "Purging Result Backend"
    echo "WARNING: This will delete all stored task results!"
    echo "Proceed? (y/N)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
      docker exec $REDIS_CONTAINER redis-cli -n $RESULT_DB FLUSHDB
      print_ok "Results purged"
    else
      echo "Purge cancelled"
    fi
    ;;

  drain)
    check_redis
    print_header "Draining Task Queue"
    echo "Waiting for all pending tasks to be acknowledged..."
    echo "(This waits for tasks pending acknowledgement)"
    # Drain pending messages that haven't been acknowledged
    docker exec $REDIS_CONTAINER redis-cli XPENDING $QUEUE_NAME $CONSUMER_GROUP
    echo "Note: Use 'purge' to force delete tasks"
    ;;

  reset-group)
    check_redis
    print_header "Resetting Consumer Group"
    echo "WARNING: This will reset the consumer group '$CONSUMER_GROUP'!"
    echo "Proceed? (y/N)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
      # Delete the consumer group
      docker exec $REDIS_CONTAINER redis-cli XGROUP DESTROY $QUEUE_NAME $CONSUMER_GROUP 2>/dev/null || true
      # Recreate it from latest
      docker exec $REDIS_CONTAINER redis-cli XGROUP CREATE $QUEUE_NAME $CONSUMER_GROUP $ MKSTREAM
      print_ok "Consumer group reset to latest"
    else
      echo "Reset cancelled"
    fi
    ;;

  help|--help|-h|"")
    cat << 'EOF'
Taskiq Queue Management Script

Usage: taskiq_management.sh <command>

Commands:
  stream-len          Show the number of tasks in queue
  pending             Display last 20 pending tasks
  groups              Show consumer groups information
  consumers           Show active consumers in the worker group
  results-count       Count stored task results
  schedules-list      List scheduled tasks
  stats               Display comprehensive queue statistics
  purge               Delete all tasks from queue (DESTRUCTIVE)
  purge-results       Delete all stored results (DESTRUCTIVE)
  drain               Show pending unacknowledged messages
  reset-group         Reset consumer group to latest (DESTRUCTIVE)
  help                Show this help message

Examples:
  ./taskiq_management.sh stream-len
  ./taskiq_management.sh pending
  ./taskiq_management.sh stats
  ./taskiq_management.sh purge

Environment Variables:
  REDIS_CONTAINER     Redis container name (default: viewport_redis)
  QUEUE_NAME          Task queue name (default: viewport_tasks)
  CONSUMER_GROUP      Consumer group name (default: viewport_workers)
EOF
    ;;

  *)
    print_error "Unknown command: $1"
    echo "Use 'taskiq_management.sh help' for usage information"
    exit 1
    ;;
esac
