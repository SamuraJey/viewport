# План: функция «Отбор фотографий»

## Проблема и подход

Нужно спроектировать и подготовить реализацию новой функции клиентского отбора фото поверх текущей архитектуры share links (public gallery + owner dashboard), без ломки существующих публичных сценариев.

Подход: расширить модель share links конфигурацией отбора и клиентскими сессиями выбора, добавить public API для клиента, owner API для фотографа, затем расширить публичный и back-office UI. Подробный технический RFC сохранен в `rfcs/rfc_photo_selection.md`.


## Текущее состояние (проверено)

- Публичная галерея по share-link уже работает, но read-only (`/s/{share_id}` и `PublicGalleryPage`).
- Share links имеют lifecycle и аналитику; есть owner dashboard и detail pages.
- Есть устоявшиеся паттерны репозиториев (`AsyncSession`) и Pydantic-схем.
- В проекте уже есть инфраструктура тестов backend/frontend и demo mode, который нужно обновлять синхронно с основным API.


## Todos

1. `clarify-product-decisions` — зафиксировать спорные продуктовые решения (модель списков, семантика лимита, стратегия восстановления клиента, объем MVP-экспортов).
2. `design-selection-data-model` — финализировать SQLAlchemy-модели/связи и ограничения для configs/sessions/items.
3. `create-selection-migrations` — добавить и проверить Alembic-миграции по workflow проекта.
4. `implement-public-selection-api` — реализовать public endpoints для config/sessions/items/submit.
5. `implement-owner-selection-api` — реализовать owner endpoints для настройки, просмотра и управления списками.
6. `implement-selection-exports-notifications` — реализовать CSV/lightroom exports и триггеры уведомлений (email/telegram через Celery).
7. `implement-public-selection-ui` — добавить UI отбора в `PublicGalleryPage` (выбор, счетчик, фильтр, комментарии, submit).
8. `implement-owner-selection-ui` — добавить UI управления списками и настройками для фотографа.
9. `sync-demo-mode-and-types` — обновить `types/*`, сервисы и `demoService` под новые контракты.
10. `add-tests-and-docs` — покрыть backend/frontend тестами, обновить документацию.


## Зависимости работ

- `design-selection-data-model` зависит от `clarify-product-decisions`.
- `create-selection-migrations` зависит от `design-selection-data-model`.
- `implement-public-selection-api` зависит от `create-selection-migrations`.
- `implement-owner-selection-api` зависит от `create-selection-migrations`.
- `implement-selection-exports-notifications` зависит от `implement-owner-selection-api`.
- `implement-public-selection-ui` зависит от `implement-public-selection-api`.
- `implement-owner-selection-ui` зависит от `implement-owner-selection-api`.
- `sync-demo-mode-and-types` зависит от `implement-public-selection-ui` и `implement-owner-selection-ui`.
- `add-tests-and-docs` зависит от завершения основных backend/frontend задач.


## Notes

- Бизнес-требования содержат признаки multi-client сценариев (несколько параллельных списков в одном проекте), это ключевая развилка архитектуры.
- Важно сохранить текущие правила публичного доступа: inactive link -> `404`, expired link -> `410`.
- Для MVP целесообразно начать с CSV + текстового экспорта для Lightroom/Capture One, а PDF/XMP вынести в следующую фазу при необходимости.
- Зафиксировано: одна конфигурация и один список отбора на одну share-ссылку; для разных клиентов используются отдельные share-ссылки.
- Зафиксировано: лимит отбора в MVP — `не более N`.
- Зафиксировано: восстановление клиентской сессии в MVP только по resume-токену (cookie/localStorage), без email-based восстановления.
- Зафиксировано: экспорты в MVP — только CSV + текстовый экспорт для Lightroom/Capture One; PDF/XMP вынесены за пределы MVP.
