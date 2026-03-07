## Plan: Celery → Taskiq Migration (DRAFT)

План переводит фоновые задачи Viewport с Celery на Taskiq без изменения бизнес-логики обработки фото/квот, с фокусом на безопасный Big-Bang cutover, корректный DI через `TaskiqDepends`, и совместимость с FastAPI lifespan. По аудиту: все фоновые задачи централизованы в [src/viewport/background_tasks.py](src/viewport/background_tasks.py), enqueue идет из [src/viewport/api/photo.py](src/viewport/api/photo.py#L325-L367) и [src/viewport/api/gallery.py](src/viewport/api/gallery.py#L176), расписание сейчас в [src/viewport/celery_app.py](src/viewport/celery_app.py), worker+beat совмещены в [docker-compose.yml](docker-compose.yml#L115-L125). Важно: фактический task-код сейчас использует sync SQLAlchemy session (`task_db_session`) и sync S3 client, хотя HTTP-слой FastAPI async; миграция должна сохранить это поведение на первом этапе, затем опционально перейти на async ресурсы через broker state.

**Analysis**
- Текущие задачи: `create_thumbnails_batch_task`, `cleanup_orphaned_uploads_task`, `delete_gallery_data_task`, `delete_photo_data_task`, `reconcile_storage_quotas_task`, `reconcile_successful_uploads_task` в [src/viewport/background_tasks.py](src/viewport/background_tasks.py#L209-L531).
- DI сейчас отсутствует в воркерах: DB через `task_db_session` в [src/viewport/task_utils.py](src/viewport/task_utils.py), S3 через sync `get_s3_client` в [src/viewport/s3_utils.py](src/viewport/s3_utils.py).
- Lifespan-ресурс `AsyncS3Client` живет в [src/viewport/main.py](src/viewport/main.py#L39-L64) и выдается через [src/viewport/dependencies.py](src/viewport/dependencies.py).
- Data-safety критично завязана на порядок S3→DB в cleanup/delete и на переходы `PENDING/SUCCESSFUL/FAILED` (см. [docs/backend/quotas.md](docs/backend/quotas.md)).
- Тестовая база уже есть и полезна для регрессии: [tests/test_background_tasks.py](tests/test_background_tasks.py), [tests/test_cleanup_task.py](tests/test_cleanup_task.py), [tests/test_photo_api.py](tests/test_photo_api.py#L247-L377).

**Steps**
1. Зафиксировать ADR миграции в новом документе [docs/backend/taskiq-migration.md](docs/backend/taskiq-migration.md): scope, Big-Bang окно, rollback, invariants по `PENDING`/quota/S3-ordering.
2. Добавить зависимости через `uv`: `taskiq`, `taskiq-redis`, `taskiq-fastapi`, `taskiq-scheduler`; удалить `celery` и `pytest-celery` из [pyproject.toml](pyproject.toml).
3. Создать [src/viewport/tkq.py](src/viewport/tkq.py) с `RedisStreamBroker` + `RedisAsyncResultBackend` (короткий TTL), экспортировать `broker` и `scheduler`, подключить `LabelScheduleSource` для cron-меток.
4. В [src/viewport/tkq.py](src/viewport/tkq.py) добавить lifecycle hooks: `WORKER_STARTUP/WORKER_SHUTDOWN` для инициализации shared ресурсов в `broker.state` (как минимум sessionmaker, S3 config/client factory; при фазе 2 — `AsyncS3Client`).
5. Добавить DI bridge в [src/viewport/dependencies.py](src/viewport/dependencies.py): функции-зависимости для Taskiq (`get_task_db_session`, `get_task_s3_client`, `get_task_context`) с `TaskiqDepends`-совместимыми сигнатурами.
6. Разделить задачно-ориентированную логику из [src/viewport/background_tasks.py](src/viewport/background_tasks.py) на async Taskiq tasks (например [src/viewport/tasks/photo_tasks.py](src/viewport/tasks/photo_tasks.py), [src/viewport/tasks/maintenance_tasks.py](src/viewport/tasks/maintenance_tasks.py)); сохранить idempotency и DB/S3 порядок операций.
7. Переподключить enqueue API: заменить `.delay(...)` на `await task.kiq(...)` в [src/viewport/api/photo.py](src/viewport/api/photo.py#L325-L367) и [src/viewport/api/gallery.py](src/viewport/api/gallery.py#L176); для sync endpoints использовать безопасный async bridge (через перевод endpoint в `async def`).
8. Перенести periodic scheduling: hourly cleanup, 10-min reconcile, daily quota reconcile из [src/viewport/celery_app.py](src/viewport/celery_app.py#L40-L53) в Taskiq `schedule` labels + отдельный scheduler процесс.
9. Обновить infra: в [docker-compose.yml](docker-compose.yml) заменить `celery_worker` на `taskiq_worker` (`taskiq worker src.viewport.tkq:broker`) и добавить `taskiq_scheduler` (`taskiq scheduler src.viewport.tkq:scheduler`); Redis service остается.
10. Обновить runtime команды/entrypoints в [Dockerfile-backend](Dockerfile-backend) и dev DX-команды в [Justfile](Justfile), [Makefile](Makefile) (`worker`, `scheduler`, `worker-dev`), убрать celery команды.
11. Обновить импорт/cleanup: удалить [src/viewport/celery_app.py](src/viewport/celery_app.py), зачистить Celery-упоминания в [README.md](README.md), [docs/backend/README.md](docs/backend/README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/backend/quotas.md](docs/backend/quotas.md), [docs/deployment/README.md](docs/deployment/README.md).
12. Провести cutover-runbook: остановка Celery worker/beat, дренирование очереди, запуск Taskiq worker/scheduler, smoke-check enqueue, включение мониторинга ошибок/ретраев; rollback — возврат команд контейнера на Celery и повторный дренаж.

**Code Blueprints**
- [src/viewport/tkq.py](src/viewport/tkq.py): `broker` (`RedisStreamBroker`), `result_backend` (TTL), `scheduler` (`TaskiqScheduler` + `LabelScheduleSource`), startup/shutdown hooks, task module imports для регистрации.
- DI шаблон: task-функции принимают зависимости через `TaskiqDepends` (например `session`, `s3_client`, `context`), а не создают их вручную внутри тела.
- Рефакторинг `create_thumbnails`: task signature принимает DTO batch + DI-зависимости; `_process_single_photo` и `_batch_update_photo_results` остаются как чистая бизнес-логика, retry/ack semantics переезжают в Taskiq middleware/config.
- Для сохранения data safety: `cleanup_orphaned_uploads` и delete tasks сохраняют порядок `S3 delete -> DB mutation`, а `reconcile_successful_uploads` остается idempotent requeue.

**Verification**
- Команды: `uv sync`, `just test tests/test_background_tasks.py -k "thumbnail or reconcile"`, `just test tests/test_cleanup_task.py`, `just test tests/test_photo_api.py -k "batch_confirm or delete_photo"`.
- Интеграция worker/scheduler локально: `docker-compose up -d redis postgres s3-service app taskiq_worker taskiq_scheduler`.
- DI-проверка: тест, что `TaskiqDepends` получает session/S3 из broker state и корректно закрывает ресурсы на shutdown.
- Safety-проверка: сценарий `PENDING -> SUCCESSFUL -> thumbnail fail -> FAILED` и контроль `storage_used/storage_reserved` без дрейфа.
- Leak-проверка: нагрузочный запуск batch-confirm + cleanup; мониторинг соединений DB, числа задач в Redis stream, отсутствия “зависших” `PENDING`.

**Decisions**
- Broker: `RedisStreamBroker` (подтверждено).
- Results: включены, короткий TTL.
- Cutover: Big-Bang switch (без dual-write периода).
- База по docs Context7: FastAPI integration/`TaskiqDepends` и broker startup-shutdown (`taskiq-with-fastapi`, `state-and-deps`), Redis broker patterns (`taskiq-redis`), scheduler/cron (`guide/scheduling-tasks`, `LabelScheduleSource`).
