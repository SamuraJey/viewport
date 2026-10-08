# План разделения Docker-образов API и Celery workers

Статус: план, реализация не начата. Этот документ не меняет сборку или deployment.

## Цель

Выделить лёгкий образ FastAPI и отдельный образ для Celery workers. API должен
принимать HTTP-запросы, работать с PostgreSQL/Redis/S3 и публиковать задачи;
медиабиблиотеки и выполнение фоновых задач остаются у workers.

На первом этапе оба Celery workers используют один worker-образ. Разделение
photo/video образов и выделение отдельного Beat-процесса в этот план не входят.
Схема БД, HTTP-контракты, имена задач, очереди и форматы сообщений сохраняются.

## Исходное состояние

- `Dockerfile.backend` строит общий production target `runtime` для API и workers.
- После оптимизаций общий образ занимает 393 651 276 байт, около 394 МБ без
  сжатия. Python base — около 128 МБ, слой `.venv` — 134 МБ, системные
  runtime-пакеты — 103 МБ, FFmpeg — 24,9 МБ, libvips — 3,58 МБ.
- `docker-compose.yml` собирает один Dockerfile без явного target для `app`,
  `celery_worker` и `celery_video_worker`.
- `docker-compose-true-nas-deploy.yml` содержит одинаковый legacy image для
  всех трёх сервисов. Его ссылки отличаются от актуальных repositories в
  `ci/build.sh`; перед изменением нужно сверить действующие настройки TrueNAS Apps.
- `ci/build.sh` последовательно публикует backend `runtime` и frontend `runtime`
  через NAS Docker Engine, с тегами release, SHA и `release-<ID>`.
- `.github/workflows/ci.yml` отдельно собирает `runtime` и `test`; полная pytest
  suite выполняется в образе с нативными медиабиблиотеками и Testcontainers.

Импортные связи, которые нужно учитывать:

| Модуль API | Импортируемые задачи |
| --- | --- |
| `src/viewport/api/photo.py` | thumbnails, videos, batch deletion, rotation |
| `src/viewport/api/gallery.py` | gallery deletion |
| `src/viewport/api/project.py` | gallery deletion |
| `src/viewport/api/selection.py` | selection notification |

Эти импорты ведут в `background_tasks.py` и `rotation_tasks.py`. Первый импортирует
Pillow, второй использует общий streaming helper из первого.
`s3_utils.py` импортирует pyvips только внутри `_get_pyvips()`: наличие модуля
в дереве импортов ещё не означает загрузку libvips при запуске HTTP-приложения.
Это необходимо подтвердить запуском API без медиабиблиотек.

`celery_app.py` содержит настройки producer/worker, `include` worker-модулей,
маршруты и Beat schedule. В `ENVIRONMENT=pytest` включён eager-режим.

## Целевая структура

Один `Dockerfile.backend`, общий исходный код, один `uv.lock` и общая версия Python.

| Target | Назначение | Registry repository | Нативные media runtime-пакеты |
| --- | --- | --- | --- |
| `runtime-api` | FastAPI/Uvicorn | `viewport/api` | Нет |
| `runtime-worker` | Photo/general и video Celery workers | `viewport/worker` | FFmpeg, libvips/AVIF, ExifTool |
| `test` | Полная backend suite | Не публикуется | Как у worker |

Оба production target запускаются от существующего `appuser`. Только API получает
HTTP healthcheck и порт 8000. Worker target не наследует Uvicorn CMD или HTTP
healthcheck: default CMD запускает основной Celery worker, а Compose задаёт
текущие параметры основного и video worker явно. Настройки Beat остаются у
основного worker; ровно один экземпляр должен запускать `--beat`.

Build-граф:

```text
python-slim -> runtime-common -> runtime-api
                            \-> worker-base -> runtime-worker
                                           \-> test

python dependencies builder -- COPY готовой .venv --> runtime-common
ffmpeg-build / vips-build    -- COPY runtime assets --> worker-base
test-deps                   -- COPY dev .venv      --> test
```

`runtime-common` не содержит media apt-пакетов или `/opt/ffmpeg`, `/opt/vips`.
Они добавляются только в `worker-base`. API не должен наследоваться от worker
и удалять файлы следующим `RUN`: такие удаления не уменьшат прежние слои.
Очистка `.venv` остаётся в builder до копирования в финальные targets.

## Этап 1. Разделить нативные runtime-зависимости

1. Выделить `runtime-common`: пользователь, WORKDIR, общие Python ENV, исходники
   и очищенная production `.venv`. Сначала сохранить весь текущий Python dependency
   set; не совмещать этот шаг с удалением Pillow/pyvips или рефакторингом задач.
2. От него построить независимые `runtime-api` и `worker-base`. В `worker-base`
   перенести установку media apt-пакетов, FFmpeg/libvips, `ldconfig`, media PATH
   и `ci/check_backend_media.py`. API не должен зависеть от media build stages
   в графе своего target; временно общий Python builder может ещё использовать
   libvips-dev для сборки pyvips, но эти build-пакеты не попадают в API runtime.
3. Проверить динамические зависимости Python extensions через `ldd` и реальный
   запуск. Оставить API только действительно необходимые системные библиотеки,
   CA certificates и поддержку часовых поясов. Отсутствие media apt-пакетов не
   должно случайно убрать библиотеку, которую использует Python extension.
4. Создать `runtime-worker` с worker CMD и `HEALTHCHECK NONE`; worker healthchecks
   описать в orchestration отдельно от HTTP readiness API.
5. Сохранить `test` на базе `worker-base`, с теми же нативными библиотеками и
   очищенными production Python extensions. Существующие fixtures не дублировать.
6. Пока потребители не переведены на явные targets, сохранить legacy `runtime`
   с прежним содержимым и API CMD. После перехода всех потребителей сделать
   финальный/default `runtime` alias для `runtime-api` и обновить документацию.

Ожидание для API с полным Python dependency set — примерно 260–280 МБ без
сжатия. Это оценка по слоям, а не результат сборки. Worker должен остаться
примерно текущего размера. Не вводить жёсткий лимит до первого измерения.

Контрольная точка: API запускается без media runtime-библиотек, выполняет HTTP
операции и ставит задачи; текущие workers обрабатывают их без изменений протокола.

## Этап 2. Отделить публикацию задач от выполнения

Этот этап уменьшает связанность и открывает возможность разделить Python
dependency sets. Его лучше делать отдельным изменением после рабочего этапа 1.

1. Выделить лёгкие контракты сообщений и имена задач в модуль без импортов
   worker-кода. Существующий `thumbnail_tasks.py` уже содержит сериализацию
   и microbatching; сохранить размер thumbnail batch 10.
2. Добавить producer-слой, например `task_publisher.py`, для публикации задач по
   существующим именам. API Celery instance не должен загружать worker `include`.
   Общие serializer, routing и broker settings вынести в конфигурацию, которая
   не импортирует обработчики. Worker сохраняет регистрацию задач и Beat schedule.
3. Перевести перечисленные API-модули с импорта декорированных task objects на
   producer. Сохранить аргументы и типы payload, очередь, порядок DB commit /
   публикации, обработку broker errors и существующий `run_in_threadpool` там,
   где синхронная публикация могла бы блокировать event loop.
4. Сохранить реальные Celery task names: `create_thumbnails_batch`,
   `process_videos_batch`, `delete_photos_batch`, `delete_gallery_data`,
   `rotate_photo`, `notify_selection_submitted`. Дополнительно инвентаризировать
   остальные registered tasks и все Beat entries перед переносом конфигурации.
5. `celery` остаётся основной очередью; `process_videos_batch` и
   `cleanup_video_temp_files` остаются в `video`. Не менять ack/retry/time-limit
   semantics, TTL/retention или периодические cleanup/reconciliation jobs.
6. Обновить тестовые mocks на producer-модуль. Учесть, что `send_task` не исполняет
   задачи через `task_always_eager`: HTTP-тесты проверяют публикацию через mock
   producer, worker-тесты продолжают напрямую исполнять registered task objects.
   Связь между двумя слоями отдельно проверяется реальным брокером и worker.
7. Проверить импорт API в отдельном контейнере и убедиться, что startup не
   импортирует `background_tasks`, `rotation_tasks`, pyvips или Pillow. Не менять
   async DB sessions HTTP и sync `task_db_session()` фоновых обработчиков.

Контрольная точка: API не зависит от worker implementations; сообщения до и после
рефакторинга совместимы с уже существующей очередью и task names.

## Этап 3. Разделить Python-зависимости при подтверждённой экономии

1. После аудита импортов и транзитивных dependencies выделить locked role sets
   `api` / `worker` через согласованный механизм uv extras/groups, с одной общей
   dependency базой. Сделать отдельные builders; не копировать полную `.venv`
   в API с последующим удалением пакетов. Обновить `pyproject.toml` и `uv.lock`
   через uv, проверить воспроизводимую locked sync обеих ролей.
2. API обязательно сохраняет FastAPI/Uvicorn, SQLAdmin с текущей локализацией,
   async SQLAlchemy/psycopg, auth/rate limiting, Redis, Celery producer,
   aioboto3/boto3/botocore и ZIP support. Синхронный boto3 также используется
   API для presigning; его нельзя объявить worker-only по названию библиотеки.
3. Кандидаты на worker-only — pyvips и Pillow, но только после устранения их
   HTTP import/use paths. Audit worker notification/storage/config dependencies
   до исключения FastAPI, aioboto3 или других пакетов из worker set.
4. Убрать libvips-dev/toolchain из dependency builder API после исключения pyvips.
   Сохранить API_mode binding и ABI совместимость pyvips в worker builder.
5. Test environment включает обе роли и dev dependencies, но не подменяет
   проверки минимального production API: тестовый образ с полной `.venv`
   способен скрыть отсутствующую runtime dependency.

Этап необязателен для первого deployment. Если экономия мала, оставить общий
Python set и завершить первоначальное разделение на этапе 1.

## Этап 4. CI, release builds и deployment

- В `docker-compose.yml` задать явные targets: `app` → `runtime-api`, оба Celery
  сервиса через общий anchor → `runtime-worker`. Сохранить текущие commands,
  environment, сети, DB/broker/S3 settings и source mounts для local workflow.
- В TrueNAS-конфигурации заменить repositories для всех трёх сервисов на новую
  пару API/worker images одного release SHA. Не переносить значения секретов
  в план, новые файлы или логи; использовать существующие механизмы конфигурации.
  Предварительно сверить Compose template и фактические TrueNAS Apps.
- В `.github/workflows/ci.yml` собирать оба production target и выполнять API
  startup/HTTP smoke именно в минимальном API image. Worker/media smoke оставить
  обязательным; полную suite/coverage запускать через `test`. Сохранить текущий
  coverage gate, xdist, Ryuk, report-only mount и изолированные Testcontainers.
- Добавить paths новых контрактов/producer/check scripts в backend change filter.
  Общие слои переиспользовать через BuildKit cache; cache write scopes разделить
  между CI jobs. Оценить текущие timeout 20 минут для production job и 30 минут
  для tests на холодной сборке, корректировать по фактическим измерениям.
- В `ci/build.sh` последовательно строить и публиковать API, worker, frontend
  из одного проверенного release SHA. Сохранить NAS builder `default`, daemon
  cache, теги SHA/release/release-ID, labels, проверку SHA/tag и cleanup checkout.
  Успех релиза означает наличие всех трёх образов; сбой после частичного push
  не должен запускать deployment.
- Legacy `viewport/backend` и старые registry references не переиспользовать
  молча под облегчённый API: старый worker может всё ещё тянуть этот repository.
  Сначала перевести consumers на новые repositories, затем отдельно решить
  срок поддержки/удаления legacy публикации.
- Worker healthchecks должны адресовать конкретный node name, чтобы ответ
  другого здорового worker не маскировал сбой контейнера. Учесть startup grace
  и влияние тяжёлых задач; HTTP healthcheck сохраняется только у API.
- Обновить `docs/backend-ci.md`, `docs/backend-image-size.md`,
  `docs/deployment/release-builds.md` и `AGENTS.md` после реализации.

## Проверки и критерии готовности

1. Оба production target собираются locked, запускаются как non-root и не
   содержат test/dev dependencies. В API отсутствуют FFmpeg/ffprobe, ExifTool,
   libvips/libheif и соответствующие media assets. На этапе 3 также отсутствуют
   pyvips/Pillow и worker modules в startup import graph.
2. API startup/lifespan и HTTP smoke проверяют auth/admin, PostgreSQL, Redis,
   S3 listing/presigning, upload confirmation и постановку rotation/deletion
   задач. Использовать минимальный API image, без host `.venv`/source mounts.
3. Раздельные API и worker containers через реальный Redis broker проходят
   image upload → thumbnail → SUCCESSFUL, multipart video → H.264/AAC + AVIF
   poster, JPEG/PNG rotation, batch/gallery deletion. Проверить микробатчи,
   quota accounting, broker failure behavior, retries и удаление temp files.
4. Worker image проходит `ci/check_backend_media.py`: EXIF, ICC, PNG/AVIF,
   scale/format/FPS, FFprobe, transcode, remux и poster. Сохранить реальные
   video codec/container проверки, включая HEVC, VP9 и AV1.
5. Worker task registry содержит все имена из API producer и Beat; queue routing
   корректен. Очередные сообщения предыдущего совместимого релиза обрабатываются
   новой worker-версией. Beat в deployment работает ровно в одном экземпляре.
6. Native/media, S3, rotation, upload, deletion, selection notification, auth и
   admin tests проходят; затем полная backend suite с текущим coverage gate.
   Контейнеры PostgreSQL/RustFS/Valkey переиспользуют существующие fixtures,
   ресурсы отдельных тестов остаются изолированными.
7. Сравнение размеров делается через `docker image inspect` и `docker history`
   для одинаковых SHA, Python base, architecture и lockfile. Отдельно измерить
   registry compressed layers, cold/warm build и startup time. Не путать размер
   видимой файловой системы, образа, BuildKit cache и registry transfers.
8. Посчитать общие уникальные слои API+worker: два image sizes нельзя просто
   сложить, если они разделяют base/venv/source layers. Разделение улучшает
   доставку API, но worker и совокупный deployment не обязаны стать меньше.

## Порядок внедрения и rollback

1. Сначала подготовить targets и проверки, сохранив legacy runtime. Этап 2 и
   разделение Python dependencies выпускать отдельно либо после контрольной
   точки этапа 1; не связывать все изменения в обязательный большой переход.
2. Собрать/протестировать и опубликовать пару images одного SHA. До переключения
   сохранить предыдущие image tags/digests и текущие runtime settings.
3. На первом deployment обновить workers раньше API, проверить регистрацию
   задач и consumer readiness. Основной worker с Beat заменять без overlap
   двух schedulers; дать текущим задачам завершиться в пределах их timeouts.
   Очереди не очищать, сообщения и payload не переписывать.
4. Обновить API на тот же релиз, пройти HTTP/upload smoke и проверить DB/S3,
   worker errors, очереди `celery`/`video`, processing failures и rotation status.
5. При проблемах откатить API и оба workers на сохранённый совместимый комплект.
   Если применены разные промежуточные версии, опираться на проверенную
   совместимость контрактов, а не только совпадение release tag.
6. DB migrations для самого разделения не нужны. Миграции, изменения payload
   и иные бизнес-изменения исключить из этого rollout.

План завершён после проверенного deployment отдельного API и worker images,
измерения размера API и подтверждения неизменных фоновых сценариев. Разделение
photo/video worker images можно рассмотреть отдельно после этого.
