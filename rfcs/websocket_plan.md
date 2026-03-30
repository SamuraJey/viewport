# План: Real-time уведомления о прогрессе генерации превью через WebSocket

## Проблема
После загрузки фото пользователь не видит статус генерации превью (thumbnail). Celery задачи обрабатывают фото в фоне, но фронтенд не получает уведомлений о прогрессе.

## Решение
Использовать **Redis Pub/Sub + FastAPI WebSocket** для передачи real-time статусов с Celery воркеров на фронтенд.

## Архитектура

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Celery Worker  │────▶│   Redis Pub/Sub │────▶│ FastAPI Backend │
│  (thumbnail     │     │   channel:      │     │   WebSocket     │
│   generation)   │     │  thumbnails:    │     │   endpoint      │
│                 │     │  {gallery_id}   │     │                 │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                                               ┌─────────────────┐
                                               │    Frontend     │
                                               │  GalleryPage    │
                                               │  (progress bar) │
                                               └─────────────────┘
```

## Формат сообщений

```typescript
// Событие прогресса для галереи
interface ThumbnailProgressEvent {
  type: "thumbnail_progress";
  gallery_id: string;
  total: number;           // Всего фото в очереди на обработку
  completed: number;       // Обработано успешно
  failed: number;          // Не удалось
  in_progress: number;     // В процессе
  percentage: number;      // 0-100%
}

// Событие завершения обработки конкретного фото
interface ThumbnailStatusEvent {
  type: "thumbnail_status";
  gallery_id: string;
  photo_id: string;
  status: "success" | "failed";
}

// Событие завершения всей очереди
interface ThumbnailCompleteEvent {
  type: "thumbnail_complete";
  gallery_id: string;
  total: number;
  successful: number;
  failed: number;
}
```

## Компоненты

### Backend

1. **Redis Pub/Sub сервис** (`src/viewport/services/pubsub_service.py`)
   - Publish messages to Redis channels
   - Subscribe to channels асинхронно

2. **WebSocket endpoint** (`src/viewport/api/websocket.py`)
   - JWT authentication через query param или first message
   - Subscribe to `thumbnails:{gallery_id}` channel
   - Forward messages to connected clients

3. **Celery task updates** (`src/viewport/background_tasks.py`)
   - `update_state()` с custom PROGRESS state
   - Publish progress to Redis после каждого обработанного фото

4. **Thumbnail progress tracker** (`src/viewport/services/thumbnail_progress.py`)
   - Track batch progress per gallery
   - Atomic counters в Redis для concurrent workers

### Frontend

5. **WebSocket hook** (`frontend/src/hooks/useWebSocket.ts`)
   - Reconnection logic с exponential backoff
   - Token refresh handling

6. **Thumbnail progress hook** (`frontend/src/hooks/useThumbnailProgress.ts`)
   - Subscribe to gallery-specific events
   - State management для progress UI

7. **Progress component** (`frontend/src/components/gallery/ThumbnailProgress.tsx`)
   - Progress bar с процентом
   - Показывает "Генерация превью: 42% (21/50)"
   - Auto-hide when 100% complete

## Todos

### Backend
- [ ] `redis-pubsub` - Создать PubSubService для Redis publish/subscribe
- [ ] `ws-endpoint` - Добавить WebSocket endpoint с JWT auth
- [ ] `celery-progress` - Интегрировать progress tracking в Celery tasks
- [ ] `progress-tracker` - Создать ThumbnailProgressTracker с atomic Redis counters
- [ ] `backend-tests` - Тесты для WebSocket и pub/sub

### Frontend
- [ ] `ws-hook` - Создать useWebSocket hook с reconnection
- [ ] `progress-hook` - Создать useThumbnailProgress hook
- [ ] `progress-ui` - Компонент ThumbnailProgress для GalleryPage
- [ ] `gallery-integration` - Интегрировать progress в GalleryPage
- [ ] `frontend-tests` - Тесты для WebSocket hooks

## Детали реализации

### 1. Redis Pub/Sub Service

```python
# src/viewport/services/pubsub_service.py
import json
from typing import AsyncIterator
import redis.asyncio as redis

class PubSubService:
    def __init__(self, redis_url: str):
        self.redis = redis.from_url(redis_url)

    async def publish(self, channel: str, message: dict) -> None:
        await self.redis.publish(channel, json.dumps(message))

    async def subscribe(self, channel: str) -> AsyncIterator[dict]:
        pubsub = self.redis.pubsub()
        await pubsub.subscribe(channel)
        async for message in pubsub.listen():
            if message["type"] == "message":
                yield json.loads(message["data"])
```

### 2. WebSocket Endpoint

```python
# src/viewport/api/websocket.py
from fastapi import WebSocket, WebSocketDisconnect, Query
from viewport.auth_utils import decode_access_token

@router.websocket("/ws/galleries/{gallery_id}/thumbnails")
async def thumbnail_progress_ws(
    websocket: WebSocket,
    gallery_id: str,
    token: str = Query(...),
):
    # Validate token and gallery access
    user = await decode_access_token(token)
    if not user or not await user_owns_gallery(user.id, gallery_id):
        await websocket.close(code=4001)
        return

    await websocket.accept()

    channel = f"thumbnails:{gallery_id}"
    async for event in pubsub.subscribe(channel):
        await websocket.send_json(event)
```

### 3. Progress Tracking in Celery

```python
# src/viewport/background_tasks.py
@celery_app.task(bind=True, ...)
def create_thumbnails_batch_task(self, photos: list[dict]) -> dict:
    gallery_id = photos[0]["gallery_id"]
    tracker = ThumbnailProgressTracker(gallery_id, len(photos))

    for photo_data in photos:
        _process_single_photo(photo_data, ...)
        tracker.increment_completed()
        # Publish progress event
        tracker.publish_progress()

    tracker.publish_complete()
    return result_tracker.to_dict()
```

### 4. ThumbnailProgressTracker

```python
# src/viewport/services/thumbnail_progress.py
class ThumbnailProgressTracker:
    def __init__(self, gallery_id: str, batch_size: int):
        self.gallery_id = gallery_id
        self.redis_key = f"thumb_progress:{gallery_id}"
        # Initialize in Redis: total, completed, failed, in_progress

    def increment_completed(self, success: bool = True):
        # Atomic HINCRBY
        pass

    def publish_progress(self):
        # Get current stats and publish to channel
        pass
```

### 5. Frontend WebSocket Hook

```typescript
// frontend/src/hooks/useWebSocket.ts
export function useWebSocket(url: string, options?: WebSocketOptions) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [lastMessage, setLastMessage] = useState<unknown>(null);

  // Reconnection with exponential backoff
  // Token refresh on 4001 close code

  return { status, lastMessage, sendMessage };
}
```

### 6. Frontend Progress Component

```tsx
// frontend/src/components/gallery/ThumbnailProgress.tsx
export function ThumbnailProgress({ galleryId }: { galleryId: string }) {
  const { progress, isActive } = useThumbnailProgress(galleryId);

  if (!isActive) return null;

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
      <div className="flex items-center gap-2">
        <Loader2 className="animate-spin" />
        <span>Генерация превью: {progress.percentage}%</span>
        <span className="text-muted">({progress.completed}/{progress.total})</span>
      </div>
      <Progress value={progress.percentage} className="mt-2" />
    </div>
  );
}
```

## Fallback без WebSocket

Если WebSocket недоступен (firewall, proxy):
- Показать статический текст "Превью генерируются в фоне"
- Polling endpoint для получения progress (interval 5s) как fallback
- Auto-refresh photo grid через 30 секунд после upload complete

## Edge Cases

1. **Multiple batches** - отдельный трекинг для каждого batch, суммирование на уровне gallery
2. **Browser tab close** - WebSocket gracefully disconnects, progress продолжается в фоне
3. **Reconnection** - при reconnect получить текущий progress из Redis
4. **Worker crash** - reconcile task исправит статусы через 10 минут
5. **Multiple galleries** - отдельные WebSocket connections per gallery

## Миграции БД

Не требуются - используем Redis для transient progress state.

## Зависимости

### Backend
- `redis[hiredis]>=5.0` (уже есть через Celery broker)

### Frontend
- Нативный WebSocket API (без дополнительных библиотек)

## Тестирование

- Unit тесты для PubSubService
- Integration тесты для WebSocket endpoint (pytest + websocket client)
- Frontend: mock WebSocket для hook тестов
- E2E: Playwright тест upload → progress → complete flow

## Порядок реализации

1. Backend: Redis Pub/Sub service + progress tracker
2. Backend: WebSocket endpoint с auth
3. Backend: Integration в Celery tasks
4. Frontend: WebSocket hook
5. Frontend: Progress hook + UI component
6. Integration в GalleryPage
7. Tests
8. Documentation
