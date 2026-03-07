# ADR: Celery → Taskiq Migration (Big-Bang)

## Status
Accepted (2026-03-04)

## Context
Viewport выполняет фоновые операции обработки фото и maintenance-задачи через Redis-backed queue. Для async-first интеграции с FastAPI lifecycle и унификации DI принято перейти на Taskiq.

## Scope
- In scope:
  - migration брокера/воркера/планировщика на Taskiq;
  - сохранение текущей бизнес-логики и инвариантов по квотам/статусам;
  - перенос periodic scheduling в label schedules;
  - обновление docker-compose и dev-команд.
- Out of scope (phase 2):
  - отсутствуют; async DB/S3 ресурсы и прямой Taskiq-style enqueue уже используются в runtime-коде.

## Invariants (must not break)
- `PENDING -> SUCCESSFUL` всегда сопровождается переносом байт из `storage_reserved` в `storage_used`.
- `PENDING -> FAILED` всегда освобождает `storage_reserved`.
- Для cleanup/delete сохраняется порядок `S3 delete -> DB mutation`.
- Reconcile задачи остаются идемпотентными.

## Decision
- Broker: `RedisStreamBroker`.
- Result backend: `RedisAsyncResultBackend` с коротким TTL (`TASKIQ_RESULT_TTL_SECONDS`, default `3600`).
- Scheduling: `TaskiqScheduler + LabelScheduleSource`.
- Cutover strategy: Big-Bang (без dual-write).

## Runtime topology
- `taskiq_worker`: `taskiq worker src.viewport.tkq:broker --workers 4`
- `taskiq_scheduler`: `taskiq scheduler src.viewport.tkq:scheduler`
- Redis остаётся единым backend для broker/results.

## Rollout runbook
1. Остановить legacy Celery worker/beat.
2. Убедиться, что Celery queue дренирована и нет in-flight задач.
3. Запустить `taskiq_worker` и `taskiq_scheduler`.
4. Выполнить smoke:
   - enqueue thumbnail через `/batch-confirm`;
   - gallery delete enqueue;
   - проверить hourly/10-min/daily schedule labels.
5. Наблюдать ошибки task execution и backlog stream в Redis.

## Rollback
1. Остановить `taskiq_worker` и `taskiq_scheduler`.
2. Вернуть команды контейнеров на legacy Celery.
3. Выполнить повторный drain/health-check очереди.
4. Запустить Celery worker/beat.

## Verification checklist
- `just test tests/test_background_tasks.py -k "thumbnail or reconcile"`
- `just test tests/test_cleanup_task.py`
- `just test tests/test_photo_api.py -k "batch_confirm or delete_photo"`
- `docker-compose up -d redis postgres s3-service app taskiq_worker taskiq_scheduler`

## Notes
- DI bridge для Taskiq lives in `src/viewport/dependencies.py` (`get_task_context`, `get_task_db_session`, `get_task_s3_client`).
- Broker lifecycle hooks in `src/viewport/tkq.py` подготавливают shared state.
- Legacy compatibility wrapper around Taskiq was removed; app code imports tasks directly from `src/viewport/tasks/` or `src/viewport/tasks/__init__.py` and uses native `kiq`.
