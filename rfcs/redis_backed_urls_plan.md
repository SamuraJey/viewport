# План: Кеширование presigned URL в Redis (ValKey) для консистентности между процессами

## Проблема

Текущая реализация кеширования presigned URL (`src/viewport/cache_utils.py`) использует **in-memory dict** (`_url_cache`), что приводит к:

1. **Несогласованности между воркерами** — каждый процесс uvicorn имеет свой изолированный кеш
2. **Избыточной генерации URL** — при масштабировании (несколько воркеров) один и тот же URL генерируется многократно
3. **Потере кеша при перезапуске** — весь кеш теряется при перезапуске процесса

## Текущее состояние

- **Redis/ValKey уже развёрнут** в `docker-compose.yml` (valkey/valkey:9-alpine на порту 6379)
- **Библиотека redis-py 7.x** уже в зависимостях (`pyproject.toml`)
- **Celery использует тот же Redis** как брокер (`CELERY_BROKER_URL`)
- Presigned URLs генерируются в `AsyncS3Client.generate_presigned_url()` с TTL 2 часа, кешируются с 10-минутным буфером

## Подход

Заменить in-memory кеш на Redis-backed реализацию с использованием `redis.asyncio` клиента. Клиент будет инициализироваться в lifespan и использоваться через DI.

---

## Задачи

### 1. redis-service-module
**Использовать единый RedisService с настройками и DI**

- Использовать существующий `src/viewport/services/redis_service.py`:
  - `RedisSettings(BaseSettings)` — URL из env `REDIS_URL` (default: `redis://localhost:6379/1`)
  - Использовать отдельную БД (`/1`) от Celery (`/0`) для изоляции
  - `RedisService.create()` создаёт инфраструктурный Redis wrapper с connection pool
  - Глобальный instance доступен через `set_redis_service()` / `get_redis_service()` и DI `Depends(get_redis)`
  - Graceful shutdown: `await service.close()` в lifespan
- Не добавлять совместимый legacy Redis shim: он удалён, новые интеграции должны идти только через `RedisService`.

### 2. redis-cache-utils
**Переписать cache_utils.py для работы с Redis**

- Заменить `_url_cache` dict на Redis operations:
  - `cache_presigned_url(redis, cache_key, url, expires_in)` → `SETEX` с TTL
  - `get_cached_presigned_url(redis, cache_key)` → `GET`
  - `clear_presigned_url_cache(redis, cache_key)` → `DEL`
  - `clear_presigned_urls_batch(redis, cache_keys)` → `DEL` multiple keys
- Использовать JSON или просто строки для хранения (URL — это строка, TTL управляется Redis)
- Prefix для ключей: `presign:` для namespace isolation

### 3. integrate-lifespan
**Интегрировать Redis клиент в lifespan приложения**

- В `main.py`:
  - Инициализировать Redis client в lifespan (после S3)
  - Закрыть при shutdown
  - Сохранить в глобальный instance через `set_redis_service()`

### 4. update-s3-service
**Обновить s3_service.py для использования Redis cache**

- Изменить методы `generate_presigned_url()` и batch-версии:
  - Принимать Redis client как параметр или получать через DI
  - Вызывать асинхронные версии cache functions
- Рассмотреть: передавать redis client в методы или сделать его атрибутом AsyncS3Client

### 5. update-tests
**Обновить тесты**

- Mock Redis в тестах (или использовать fakeredis/testcontainers)
- Обновить существующие тесты s3_service и cache_utils
- Добавить интеграционные тесты для Redis cache

### 6. update-documentation
**Обновить документацию**

- Обновить `.github/copilot-instructions.md`:
  - Убрать упоминание "not Redis-backed"
  - Добавить информацию о Redis cache для presigned URLs
- Обновить `docs/` при необходимости

---

## Зависимости задач

```
redis-service-module
       ↓
redis-cache-utils ← integrate-lifespan
       ↓
update-s3-service
       ↓
update-tests
       ↓
update-documentation
```

---

## Технические детали

### Redis ключи

```
presign:{bucket}:{object_key}:{disposition_hash}
```

Где `disposition_hash` — хеш от `response_content_disposition` (или пустая строка).

### TTL стратегия

- Presigned URL живёт 2 часа (7200 сек)
- В кеше храним с буфером 10 минут: TTL = 7200 - 600 = 6600 сек
- Redis автоматически удалит expired записи

### Connection Pooling

```python
redis_service = await RedisService.create(settings)
set_redis_service(redis_service)
```

### Graceful Degradation

При недоступности Redis — fallback на генерацию URL без кеширования (log warning, не fail).

---

## Риски и митигация

| Риск | Митигация |
|------|-----------|
| Redis недоступен | Graceful degradation — работаем без кеша |
| Большой объём ключей | TTL автоматически чистит; можно добавить `maxmemory-policy volatile-lru` |
| Сетевые задержки | Redis на localhost, задержки минимальны (~0.5ms) |

---

## Критерии готовности

- [ ] Redis client инициализируется в lifespan
- [ ] Presigned URLs кешируются в Redis с корректным TTL
- [ ] Несколько воркеров видят один и тот же кеш
- [ ] Тесты проходят
- [ ] Документация обновлена
