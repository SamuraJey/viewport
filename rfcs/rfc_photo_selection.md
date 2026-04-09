# RFC: Функция «Отбор фотографий»

## 1) Цель

Реализовать полный workflow отбора фотографий в публичной галерее: клиент отмечает фото, оставляет комментарии, вводит контактные данные, отправляет выбор; фотограф получает управляемые списки, статусы, экспорт и уведомления.


## 2) Что уже есть в проекте (текущая база)

- Есть публичная галерея по ссылке (`/share/:shareId` на фронтенде, `GET /s/{share_id}` на бэкенде), но сейчас она read-only: просмотр + скачивание.
- Есть зрелая инфраструктура share links: lifecycle (`is_active`, `expires_at`), 404 для inactive и 410 для expired, owner-dashboard, аналитика по дням.
- Есть приватная галерея с server-side фильтрацией/сортировкой и покрытием тестами.
- Есть паттерны репозиториев на `AsyncSession`, Pydantic-схемы, и компоненты фронтенда для выделения/селекции (`useSelection`) и data-heavy страниц.
- Есть demo mode, который требует зеркалирования новых API-веток в `demoService`.


## 3) Технические принципы (с учетом Context7)

- FastAPI:
  - Использовать явные Pydantic-модели для query/body/cookie payloads.
  - Группировать эндпоинты в `APIRouter` по зонам доступа (public vs owner) и использовать router-level dependencies там, где уместно.
- SQLAlchemy 2.0:
  - Декларативные модели через `Mapped[...]` + `mapped_column`.
  - Явные связи one-to-many / many-to-many через association-таблицы.
  - Индексы и ограничения сразу в модели/миграции (а не только в коде сервиса).
- Совместимость:
  - Сохранить текущий контракт share-link поведения (inactive=404, expired=410).
  - Не ломать существующую public gallery.


## 4) Предлагаемая предметная модель (MVP)

Ниже модель с зафиксированным решением: **1 конфигурация + несколько независимых клиентских сессий отбора на 1 share-link**.

### 4.1 Таблица `share_link_selection_configs`

Конфигурация отбора, которую задает фотограф.

- `id` UUID PK
- `sharelink_id` UUID FK -> `share_links.id` (CASCADE, unique)
- `is_enabled` bool (master switch)
- `list_title` varchar(127) (например, «Для ретуши»)
- `limit_enabled` bool
- `limit_value` int nullable
- `limit_mode` varchar(16) (`max` или `exact`) — финальное значение после уточнения
- `allow_photo_comments` bool
- `require_name` bool default true (locked)
- `require_email` bool
- `require_phone` bool
- `require_client_note` bool (общий комментарий ко всему списку)
- `created_at`, `updated_at`

Индексы/ограничения:
- `uq_share_link_selection_configs_sharelink_id`
- check для `limit_value > 0`, когда `limit_enabled=true`

### 4.2 Таблица `share_link_selection_sessions`

Независимая клиентская сессия выбора для конкретной share-ссылки.

- `id` UUID PK
- `sharelink_id` UUID FK -> `share_links.id` (CASCADE)
- `config_id` UUID FK -> `share_link_selection_configs.id` (CASCADE)
- `client_name` varchar(127) NOT NULL
- `client_email` varchar(255) nullable
- `client_phone` varchar(32) nullable
- `client_note` text nullable
- `status` varchar(16): `in_progress | submitted | closed`
- `submitted_at` datetime nullable
- `last_activity_at` datetime
- `selected_count` int default 0 (денормализация для быстрых списков)
- `resume_token_hash` varchar(128) nullable (для возврата клиента к своему списку)
- `created_at`, `updated_at`

Индексы:
- `resume_token_hash` unique
- `sharelink_id`
- `(status, updated_at desc)` для owner dashboard

### 4.3 Таблица `share_link_selection_items`

Фото, выбранные в рамках конкретного клиентского списка.

- `session_id` UUID FK -> `share_link_selection_sessions.id` (CASCADE)
- `photo_id` UUID FK -> `photos.id` (CASCADE)
- `comment` text nullable
- `selected_at`, `updated_at`

Ограничения:
- PK `(session_id, photo_id)` — одно фото не дублируется в одном списке

Бизнес-валидация в сервисе:
- `photo.gallery_id` должен совпадать с `sharelink.gallery_id`


## 5) Backend API план

## 5.1 Public API (для клиента)

Маршрутный префикс: `/s/{share_id}/selection`

1. `GET /config`
- Вернуть конфигурацию отбора (enabled, лимиты, обязательные поля, allow comments, title).

2. `POST /session`
- Создать или восстановить клиентскую сессию отбора.
- Принимает имя/email/телефон/общий комментарий по правилам config.
- Возвращает `session_id`, статус, текущий выбор.

3. `GET /session/me`
- Восстановить текущую сессию по resume-токену (cookie/localStorage token).

4. `PUT /session/items/{photo_id}`
- Toggle выбранности фото.
- Проверка лимита и статуса (`closed/submitted` запрещают изменение).

5. `PATCH /session/items/{photo_id}`
- Обновить комментарий к фото (если `allow_photo_comments=true`).

6. `PATCH /session`
- Обновить client-level поля (например, общий комментарий).

7. `POST /session/submit`
- Финализация выбора.
- Проверка лимитов (по выбранной лимитной стратегии).
- После submit — отправка notification task.

## 5.2 Owner API (для фотографа)

1. Конфигурация:
- `GET /galleries/{gallery_id}/share-links/{sharelink_id}/selection-config`
- `PATCH /galleries/{gallery_id}/share-links/{sharelink_id}/selection-config`

2. Данные выбора по конкретной ссылке:
- `GET /share-links/{sharelink_id}/selection`
- `POST /share-links/{sharelink_id}/selection/close`
- `POST /share-links/{sharelink_id}/selection/reopen`

3. Сводный список выборов по галерее:
- `GET /galleries/{gallery_id}/selections` (одна строка = одна share-ссылка / один клиентский отбор)

4. Batch actions по галерее:
- `POST /galleries/{gallery_id}/selections/actions/close-all`
- `POST /galleries/{gallery_id}/selections/actions/open-all`

5. Экспорт/интеграции:
- `GET /share-links/{sharelink_id}/selection/export/files.csv`
- `GET /galleries/{gallery_id}/selections/export/summary.csv`
- `GET /galleries/{gallery_id}/selections/export/links.csv`
- `GET /share-links/{sharelink_id}/selection/export/lightroom.txt` (строка фильтра)


## 6) Frontend план

## 6.1 PublicGalleryPage (клиентский сценарий)

- Добавить selection mode в `PublicGalleryPage`/`PublicGalleryPhotoSection`.
- UI элементы:
  - кнопка выбора на карточке фото (heart/check)
  - live-счетчик (`Выбрано X из N` при лимите)
  - фильтр «Показать только выбранные»
  - комментарий к фото (из карточки + из lightbox)
  - форма клиента (имя обязательно, остальное по config) при первом действии выбора
  - кнопка `Готово` (submit)
- UX ограничения:
  - при достижении лимита — disable выбора новых фото (или controlled unselect+select логика)
  - после `submitted/closed` — read-only режим списка

## 6.2 Back-office (фотограф)

- Расширить `ShareLinkEditorModal` секцией/табом «Отбор фотографий».
- Добавить страницу/блок управления выборками по галерее:
  - список share-ссылок (каждая = отдельный клиентский отбор) + статус
  - просмотр выбранных фото и комментариев
  - действия close/reopen/delete (если потребуется)
  - экспорт CSV и строк для Lightroom/Capture One
- В `ShareLinksDashboardPage` добавить индикатор «Выбор завершен» на уровне ссылки (если есть submitted сессии).

## 6.3 Demo mode

- Добавить в `demoService` и типы (`types/sharelink.ts`) эквиваленты новых контрактов.
- Сохранить поведение без backend-auth для demo flow.


## 7) Уведомления

- При `submit` запускать Celery task:
  - Email (если SMTP включен)
  - Telegram (если webhook/token настроен)
- Контент уведомления: клиент, количество фото, ссылка на back-office карточку выбора.
- Идемпотентность: не слать дубль при повторном submit без изменения статуса.


## 8) Тестовая стратегия

Backend:
- Новый модуль API-тестов для public selection endpoints.
- Тесты owner selection endpoints.
- Репозиторные тесты на лимиты/статусы/валидации принадлежности фото.
- Регрессии на публичный доступ: inactive=404, expired=410 не меняются.
- Миграционные тесты по стандартному workflow проекта.

Frontend:
- Unit tests для hooks/components selection UI.
- Тесты PublicGalleryPage сценариев:
  - first select -> contact form
  - limit reached
  - selected-only filter
  - submit + read-only
- Тесты owner UI для списков и экспортных действий.
- Обновление demo-mode тестов.


## 9) Пошаговый план реализации

1. Уточнить спорные product-решения (см. раздел 11).
2. Спроектировать и добавить модели + Alembic migration.
3. Реализовать public selection API и бизнес-валидации.
4. Реализовать owner API управления списками и конфигурацией.
5. Реализовать CSV/lightroom exports.
6. Подключить notification pipeline через Celery.
7. Реализовать public frontend flow отбора.
8. Реализовать back-office frontend для фотографа.
9. Обновить demo mode, типы и интеграционные ветки сервисов.
10. Добавить тесты (backend/frontend), прогнать quality gates, обновить документацию.


## 10) Что точно не включаем в MVP

- Side-by-side сравнение фото.
- Монетизация «докупить за X».
- Этапы post-production workflow (выбор -> ретушь -> приемка).
- XMP экспорт и PDF отчет.


## 11) Принятые решения и открытые вопросы

Принятые решения:
1. Модель списков для MVP: одна конфигурация и один клиентский список на одну share-ссылку; для разных клиентов фотограф создает отдельные share-ссылки.
2. Семантика лимита для MVP: `не более N`.
3. Восстановление клиента для MVP: только resume-токен в cookie/localStorage (без восстановления по email).
4. Экспорты в MVP: только CSV + текстовый экспорт для Lightroom/Capture One.

Открытые вопросы:
На текущий момент открытых вопросов нет.
