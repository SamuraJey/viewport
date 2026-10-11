# План полного перехода Viewport на same origin

Статус: предложение к реализации. Обновлено 2026-10-11.
Заменяет первоначальный вариант перехода только загрузок. Имя файла сохранено для существующих ссылок. Изменения инфраструктуры и кода этим документом не применяются.

## Цель

Все новые браузерные обращения frontend, API и S3 обслуживаются одним HTTPS origin. Загрузки, изображения, thumbnails, posters, playback и скачивания используют существующий Traefik. Backend и Celery обращаются к RustFS по внутреннему endpoint; передача обычных объектов не проходит через FastAPI. ZIP остаётся существующим API-потоком.

Для S3 разделить внутренний адрес и публичный endpoint подписания. Перенос API под `/api` выполнить отдельным этапом той же миграции, чтобы можно было независимо проверить и откатить обе части.

Результат: убрать CORS round trip OPTIONS для загрузок и API на основном домене. GET медиа обычно уже не требует preflight; его перенос нужен для единой маршрутизации. Общий выигрыш измерять на полном пакете с текущим параллелизмом, не складывать длительности всех запросов как последовательное время.

## Что проверено в коде и документации

| Источник | Текущее поведение и следствие |
| --- | --- |
| `src/viewport/s3_utils.py` | `S3Settings` читает `S3_*`, один endpoint; sync-клиент Celery использует path-style. Нужна отдельная настройка публичного endpoint. |
| `src/viewport/s3_service.py` | Один `_endpoint_url` обслуживает сетевые операции и `_get_presign_client()`. Последний подписывает GET, PUT и UploadPart: переключить его целиком на публичный endpoint. |
| `src/viewport/s3_service.py` | GET поддерживает подписанный `ResponseContentDisposition`; отдельного override Content-Type пока нет. PUT подписывает размер, MIME и pending tagging. |
| `src/viewport/main.py`, `services/presigned_cache.py`, `docs/s3-credentials.md` | При старте создаются bucket CORS и кеш; namespace включает endpoint. После разделения namespace должен учитывать публичный endpoint. |
| `src/viewport/api/photo.py` | Multipart create/complete/abort, tagging и quota остаются серверными. Части 16 MiB, URL на час. Приватное скачивание возвращает 303 на presigned URL. |
| `src/viewport/api/public.py` | Публичное скачивание тоже возвращает 303; ZIP передаётся StreamingResponse. |
| `frontend/src/services/photoService.ts` | Отдельный XHR без API interceptor, прогресс, abort/retry; multipart читает ETag, timeout попытки 120 секунд. |
| `frontend/src/lib/api.ts`, `lib/apiUrlValidation.ts`, `frontend/vite.config.ts` | Production принимает абсолютный HTTPS `VITE_API_URL`, включая `/api`. Dev уже проксирует API; S3 proxy отсутствует. |
| `src/viewport/sharelink_access.py`, `api/selection.py` | Share-access и selection cookies имеют Path `/`. На общем origin они будут отправляться также на S3-путь. |
| `frontend/src/pages/PublicGalleryPage.tsx` | Пользовательские ссылки имеют `/share/...`; backend API использует `/s/...`. Эти пространства путей нельзя смешать. |
| `docker-compose.yml`, `nginx.conf.example` | Workers используют внутренний S3 DNS. Конфигурации Traefik нет; пример nginx подменяет Host, что требует сверки с подписанным host. |
| `docs/photo-upload-ux.md`, `backend/quotas.md`, `deployment/README.md`, `plans/PLAN_VIDEO.md` | Описывают текущие upload, quota и видео. В deployment index есть ссылки на отсутствующие руководства, они не являются проверенной конфигурацией прода. |

Домены, версия Traefik, provider, внешняя сеть и фактические middleware неизвестны. Ниже условные адреса и bucket `viewport`; перед реализацией подставить реальные параметры.

## Целевая маршрутизация

| Браузерный URL | Назначение |
| --- | --- |
| `https://app.example.com/api/...` | FastAPI; Traefik удаляет только `/api` |
| `https://app.example.com/viewport/<key>?X-Amz-...` | RustFS, путь и Host сохраняются |
| `https://app.example.com/share/...` и остальные UI routes | Frontend SPA |

`/viewport/` — реальное имя bucket в path-style URL. Не вводить дополнительный `/storage` с StripPrefix. При нескольких bucket перечислить разрешённые пути явно и проверить конфликты с UI/API.

Origin — схема, host и порт; одинаковый proxy за разными доменами не делает origin общим. Cross-origin PUT и слушатели `xhr.upload` вызывают preflight. См. [same-origin](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy) и [XHR upload](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/upload).

## Этап 1. Инвентаризация и baseline

1. Зафиксировать frontend/API/S3 домены, aliases, TLS, версии Traefik/RustFS, provider, entrypoints, priorities, внешнюю Docker-сеть, middleware, CSP, CDN и service worker (если есть).
2. Проверить Host/path/query rewriting, forward auth, redirects, ограничения тела, timeouts, обработку Range и proxy cache.
3. Снять HAR загрузки пакета фото и multipart видео, открытия private/public gallery, playback и скачивания: OPTIONS, duration, throughput, 4xx/5xx, 206 и ETag. Не публиковать подписанные query и cookies.
4. Проверить состояние и MIME существующих объектов: старые оригиналы/производные могут иметь отличающиеся метаданные. Bucket остаётся приватным, прежние ключи и credentials сохраняются.
5. Выбрать канонический frontend origin. Один статический public endpoint не будет same-origin для нескольких разных доменов; aliases переводить на канонический домен до открытия UI. Если aliases обязательны, отдельно спроектировать доверенный allowlist origin и соответствующие namespaces кеша.

## Этап 2. Разделить внутренний и публичный S3 endpoint

Предлагаемые настройки backend и workers:

```dotenv
S3_ENDPOINT=http://s3-service:9000
S3_PUBLIC_ENDPOINT=https://app.example.com
S3_BUCKET=viewport
```

Для локального backend вне Docker внутренний endpoint — `http://127.0.0.1:9000`. Credentials, region и signature version сохраняются. `S3_PUBLIC_ENDPOINT` заменяет предложенный ранее `S3_UPLOAD_ENDPOINT`: отдельная настройка только для upload больше не нужна.

Доработки:

1. В `S3Settings` добавить optional `public_endpoint`. Отсутствие значения означает совместимый fallback на `endpoint`. Валидировать absolute origin без path/query/fragment/userinfo; в production HTTPS, для dev разрешить HTTP. Не выводить endpoint из непроверенного Host/X-Forwarded-Host.
2. В `AsyncS3Client` оставить `_get_s3_client()` на внутреннем endpoint. `_get_presign_client()` использовать для всех публичных GET/PUT/UploadPart на эффективном public endpoint с прежними path-style, credentials и SigV4.
3. Проверить все одиночные/пакетные helpers генерации GET и disposition, картинки cover/preview, public и project listings, private/public downloads: в выдаче не должно быть внутренних адресов или старого S3 host.
4. Create/complete/abort multipart, HEAD объекта, tagging, CORS, delete и чтение оригиналов для ZIP/processing выполняются через внутренний клиент. Sync-клиент `s3_utils.py` не переключать на публичный endpoint.
5. Public endpoint используется для локального вычисления подписи и не должен создавать сетевой маршрут server → внешний Traefik → RustFS. Сохранить ленивое создание/закрытие presign-клиента и ограниченные пулы.
6. Presigned URL сразу генерировать для frontend host. Не менять URL после подписания: host, canonical URI и query участвуют в SigV4. См. [AWS signature](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-query-string-auth.html).
7. Сохранить API payload, Content-Length/Content-Type/tagging, upload IDs, TTL, квоту, bounded pools и свежие upload intents при retry. Миграция БД не требуется.

### Namespace Redis и совместимость

Fingerprint должен учитывать эффективный **public** endpoint, credentials, region, signature version и параметры, влияющие на URL чтения. Изменение только внутреннего endpoint при прежнем публичном не должно выдавать ссылки на внутренний адрес или бессмысленно переключать namespace.

Обновить тесты namespace и документацию `docs/s3-credentials.md`. Не очищать Redis целиком: новый namespace обходит старые записи. Если добавляется режим подписания ResponseContentType, включить его в cache identity либо версионировать namespace, чтобы прежние ссылки без override не возвращались из кеша.

Проверить все пути invalidation после delete/rename/rotation и одинаковую signing-конфигурацию процессов, использующих этот кеш. Уже выданная ссылка не меняется после переключения; старый домен обслуживает её до истечения срока, с учётом завершения начатого запроса.

## Этап 3. Маршруты Traefik для S3

Шаблон dynamic configuration; значения и syntax сверить с установленной версией:

```yaml
http:
  routers:
    viewport-media:
      rule: "Host(`app.example.com`) && PathPrefix(`/viewport/`) && (Method(`GET`) || Method(`HEAD`) || Method(`PUT`))"
      entryPoints: [websecure]
      priority: 200
      tls: {}
      service: viewport-media
      middlewares: [viewport-media-headers]
  services:
    viewport-media:
      loadBalancer:
        passHostHeader: true
        servers:
          - url: "http://s3-service:9000"
  middlewares:
    viewport-media-headers:
      headers:
        customRequestHeaders:
          Cookie: ""
        customResponseHeaders:
          X-Content-Type-Options: nosniff
```

На public S3 route не нужны DELETE и multipart lifecycle POST: их выполняет backend внутри сети. HEAD разрешён маршрутом, но GET-подпись не превращается в HEAD-подпись; если browser-коду понадобится HEAD, добавить отдельный presign для head_object.

Router должен иметь явный приоритет выше frontend catch-all. Предусмотреть отказ для неподдерживаемых методов на bucket-пути, чтобы ошибочные запросы не получали SPA HTML. Для Docker provider оформить эквивалентные labels и доступ в S3 сеть. См. [правила Traefik](https://doc.traefik.io/traefik/routing/routers/) и [передача Host](https://doc.traefik.io/traefik/v3.0/routing/services/).

Сохранить Host frontend, исходные URI/query и signed headers. Запретить StripPrefix/ReplacePath/Host override/redirect для S3; не копировать Host из nginx-примера. Не подключать proxy retry PUT, compression/transformation тела, buffering всего upload или кеш без проверки подписи.

Сохранять Range/If-Range, 206/416, Content-Range, Accept-Ranges, ETag и Content-Disposition для playback и скачиваний. Проверить read/write/response timeouts и body limits с учётом медленной загрузки, 16 MiB частей, 120-секундной попытки и долгих GET; глобальные entrypoint настройки затрагивают другие routes тоже. Проверить sanitization и URL encoding на текущих object keys и uploadId. См. [entrypoints](https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/).

Удалять Cookie только в S3 middleware, не в API. Не добавлять bearer Authorization API к presigned запросам. Bucket остаётся приватным, RustFS проверяет подписи и expiration. Убедиться, что никакой общий proxy cache не выдаёт объект после истечения/без подписи; на время миграции не вводить новый shared cache. Browser cache и текущую политику URL expiration проверить отдельно.

## Этап 4. Проверить безопасную выдачу медиа на origin приложения

GET теперь возвращает пользовательские файлы в origin приложения. Это часть технической корректности полного перехода, особенно для старых оригиналов и незавершённых uploads.

- Проверить allowlist медиа и фактическую серверную валидацию; HTML/SVG/JS не должны выдаваться inline как активное содержимое на этом origin.
- Для thumbnails/posters/playback обеспечить корректный MIME, для оригиналов проверить соответствие MIME содержимому. Весь S3 media route получает `nosniff`; одного этого заголовка недостаточно, если сервер явно отдаёт активный MIME. См. [MIME verification](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/MIME_types).
- Скачивания сохраняют подписанный attachment disposition и корректный filename. Не ставить attachment глобально: это сломает показ изображений и видео. При проблемах с legacy MIME добавить подписанный `ResponseContentType` на нужных GET helpers и расширить cache identity; инвентаризация определяет необходимость. См. [GetObject response overrides](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html).
- Cookies приложения и S3 Set-Cookie не должны участвовать в работе media route. Проверить очищение request Cookie и отсутствие неожиданных Set-Cookie; API cookies сохраняются.
- Проверить CSP для `img-src`, `media-src`, `connect-src`, существующих blob-превью и canvas. Исключить media из frontend service worker cache и SPA fallback.

Не менять ключи и bytes оригиналов для решения маршрутизации; если нужны корректировки metadata существующих объектов, выполнить их отдельной проверяемой задачей после inventory.

## Этап 5. API на том же origin

Установить `VITE_API_URL=https://app.example.com/api` при production build. Текущий validator допускает абсолютный HTTPS URL с этим path; переход на относительное `/api` не требуется. Traefik router `Host(app...) && (Path(/api) || PathPrefix(/api/))` направляет в backend и удаляет `/api` только на API route.

Проверить FastAPI `root_path=/api` для публичных URL и документации за proxy; применять через deployment/runtime config либо явно поддержать настройкой. Не добавлять `/api` одновременно в router paths и root_path. API POST должен работать сразу по конечному HTTPS URL без redirect.

Проверки и возможные доработки:

- Обе Axios instance, refresh, публичные unlock/selection, download forms/anchors, ZIP URL и любые ручные URL должны использовать общий API base. Искать hardcoded старый домен и отдельное построение `/s`/`/photos`.
- `/share/...` остаётся маршрутом SPA, `/api/s/...` — публичным API. Проверить deep links и сохранённые публичные ссылки, формируемые `get_public_request_base_url` с доверенными forwarded headers.
- Share-access и selection cookies сейчас Path `/`; на новом host проверить Secure/SameSite, unlock, resume и logout. Старые host-only cookies не переезжают автоматически: пользователь может повторно вводить пароль ссылки. Не менять Domain на общий родитель только ради миграции.
- Доверять forwarded host/proto/client только существующему allowlist `AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS`, сверить сеть Traefik. Сохранить отключённое доверие произвольным Uvicorn proxy headers.
- Не удалять защиту и проверки origin для cookie-based операций из-за отсутствия CORS; сохранить текущие auth и password gate. SQLAdmin/session flows проверить отдельно, если публикуются на общем домене.
- ZIP остаётся StreamingResponse через API; сохранить function-scoped DB lifecycle, передачу без полного buffering и длинные stream timeouts.

Старый API-домен временно обслуживает старые сборки frontend. Не перенаправлять все POST на новый домен автоматически; после прекращения старого трафика закрыть legacy router отдельно.

## Этап 6. Локальная схема и CORS

Предпочтительна staging-проверка настоящего Traefik/RustFS. Для backend на хосте и зависимостей Compose:

```dotenv
S3_ENDPOINT=http://127.0.0.1:9000
S3_PUBLIC_ENDPOINT=http://localhost:5173
```

Добавить opt-in Vite proxy `/viewport/` к `http://127.0.0.1:9000` с `changeOrigin: false`, без rewrite. API proxy уже существует. Использовать один hostname frontend (localhost и 127.0.0.1 — разные origin). Проксировать GET/HEAD/PUT, передавать Range и ETag; dev proxy не заменяет проверку реальных подписей через Traefik.

CORS bucket с ETag exposure сохранить в переходный период: старые URL и fallback остаются cross-origin. После завершения определить отдельно, нужны ли CORS для внешних клиентов и dev; не удалять конфигурацию автоматически. Backend CORS также сокращать только после отключения старых клиентов. MaxAge уже час, но кеш OPTIONS не общий на весь bucket: [preflight cache](https://developer.mozilla.org/en-US/docs/Glossary/Preflight_request).

## Этап 7. Тесты и критерии приёмки

Unit/API:

- Fallback без public endpoint; validation; все GET/PUT/UploadPart на публичном host, все сетевые операции на внутреннем.
- GET namespace меняется при изменении public endpoint/credentials, стабилен при одинаковом signing config; cache miss/hit и invalidation не смешивают deployment.
- Реальные dispositions и условный ContentType override не теряются при пакетной генерации/кешировании.
- Private/gallery/project/public listings, single downloads, rotation derivatives, covers, posters и playback выдают правильные ссылки.
- Смешанные фото/видео в обоих порядках complete/abort; retry, quota и cancelled uploads сохраняют контракт.
- API base с `/api`, refresh, unlock/selection, redirects и cookies за trusted proxy.

Интеграционно через настоящий Traefik/RustFS и браузер:

1. PUT изображений и multipart видео, ETag, complete/abort, processing и quota успешно завершаются. OPTIONS отсутствует перед новыми same-origin S3 PUT и API запросами.
2. GET thumbnail/original, public/project share, cover и playback работают; перемотка видео получает корректный Range/206. HEAD проверять с собственной подписью, если используется.
3. Private/public download 303 остаётся на том же origin и скачивает с правильным именем; ZIP потоком работает.
4. Подпись, неверный key, истёкшие URL и неразрешённые методы отклоняются. Путь медиа не превращается в SPA HTML, cookie не доходит до S3.
5. Продолжить загрузку и чтение по старым URL, затем проверить новые URL и новую API-сборку. Учесть активные streams.
6. Повторить baseline; сравнить OPTIONS, duration и throughput. Не обещать фиксированного ускорения всех GET.

Переиспользовать `tests/test_s3_service.py`, `test_video_upload_api.py`, тесты public/download/cache/auth и fixtures Testcontainers. Выполнить Ruff/typecheck, соответствующие backend tests с реальным Docker, frontend lint/TypeScript/Vitest при изменении Vite/API config. Моки не доказывают отсутствие OPTIONS и корректность proxy SigV4.

## Выкладка и откат

1. Добавить новые S3 и API routes на staging, затем production, сохранив старые домены. Проверить приоритеты, TLS, Host, методы, Range и таймауты.
2. Развернуть backend с optional public endpoint, пока он отключён; проверить fallback.
3. Включить `S3_PUBLIC_ENDPOINT` на staging, затем на всех production backend экземплярах; процессы с кешем должны использовать согласованную конфигурацию. Workers продолжают внутренний I/O.
4. Пересобрать frontend с API URL нового origin. Проверить защищённые shares/cookies и скачивания; шаг можно откатить независимо от S3.
5. Наблюдать 403 SignatureDoesNotMatch, 413, timeouts, ETag, 206, 5xx, OPTIONS, upload duration и processing backlog.
6. При откате public endpoint вернуть на прежний **публичный S3 host**, сохранив внутренний S3_ENDPOINT. Очищать optional настройку безопасно только если fallback endpoint доступен браузеру. Вернуть предыдущую сборку/API base отдельно.
7. Сохранять оба новых и старых routes для уже выданных ссылок/старых вкладок на период TTL и активных запросов. По умолчанию GET URL два часа, PUT 15 минут, multipart один час; учитывать реально переопределённые TTL, браузерный кеш и старые сборки.
8. После отсутствия legacy трафика закрыть внешние S3/API домены и пересмотреть CORS. RustFS console/administrative endpoint не переносить под media path; его доступ определить отдельно.

Миграция БД, перенос объектов и смена bucket/credentials не требуются. После реализации обновить `docs/s3-credentials.md`, `photo-upload-ux.md`, deployment руководство и архитектурные инструкции для двух endpoint. Зафиксировать фактическую конфигурацию Traefik в репозитории вместо условного шаблона.

## Решения перед реализацией

Подставить домен, bucket, версии/provider/network/entrypoints и middleware; подтвердить канонический frontend origin, policy cookies/cache и MIME существующих объектов. Эти сведения уточняют deployment шаблон, но не меняют выбранную схему: один браузерный origin и отдельный внутренний S3 endpoint.
