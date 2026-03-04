# AVIF Thumbnails Update

## Overview
Обновлена система генерации thumbnails для использования современного формата **AVIF** вместо JPEG. Это обеспечивает:

- **Лучшую компрессию** - AVIF обеспечивает примерно 50-80% лучшее сжатие, чем JPEG при той же качестве
- **Сохранение качества** - качество по умолчанию увеличено с 80 до 75 (AVIF скала 0-100), что сопоставимо с JPEG качеством
- **Современный формат** - AVIF - это современный, разработанный Alliance for Open Media формат, поддерживаемый во всех современных браузерах

## Изменённые файлы

### 1. `src/viewport/s3_utils.py`

#### `create_thumbnail()` функция
- **Формат**: теперь сохраняет в AVIF вместо JPEG
- **Параметры AVIF**:
  - `quality=75` (0-100 шкала, по умолчанию 75 от Pillow)
  - `speed=6` (0=медленнее/лучше, 10=быстрее; по умолчанию 6 - сбалансированный трейдофф)
  - `subsampling: 4:2:0` (по умолчанию, хорошо для веба)
- **Сохранённые оптимизации**: сохранены все оптимизации из JPEG версии (draft mode для JPEG, EXIF transpose, LANCZOS resampling)

#### `generate_thumbnail_object_key()` функция
- **Расширение файла**: теперь все thumbnails получают расширение `.avif` независимо от исходного формата
- **Пример**: `gallery_id/photo.jpg` → `gallery_id/thumbnails/photo.avif`

#### `upload_fileobj()` функция
- **Новый параметр**: добавлена поддержка `cache_control` параметра для установки Cache-Control заголовка
- Используется при загрузке thumbnails с `cache_control="public, max-age=31536000, immutable"`

### 2. `src/viewport/background_tasks.py`

#### `_process_single_photo()` функция
- **Content-Type**: изменён с `image/jpeg` на `image/avif` при загрузке thumbnail в S3
- **Cache-Control**: добавлен заголовок `public, max-age=31536000, immutable` (1 год, никогда не меняется)
  - Это предотвращает условные запросы браузера (304 Not Modified)
  - Thumbnails кэшируются локально на клиенте на 1 год

### 3. `src/viewport/s3_service.py`

#### `upload_fileobj()` метод
- **Новый параметр**: добавлена поддержка `cache_control` параметра в async версии

## Технические детали

### Поддержка AVIF в Pillow 12.1.0
Согласно документации Pillow 12.1.0, поддержка AVIF включает:

**Параметры сохранения:**
- `quality` - Integer, 0-100, по умолчанию 75
- `subsampling` - Опции: 4:0:0, 4:2:0, 4:2:2, 4:4:4 (по умолчанию 4:2:0)
- `speed` - Quality/speed trade-off (0=медленнее/лучше, 10=быстрее). По умолчанию 6
- `codec` - AV1 codec (aom, rav1e, svt, auto). По умолчанию auto
- `alpha_premultiplied` - Кодировать с premultiplied alpha (по умолчанию False)

**Ограничения:**
- Поддерживается только 8-bit AVIF сохранение
- Все AVIF изображения декодируются как 8-bit RGB(A)

### HTTP Cache-Control для Thumbnails
Thumbnails имеют следующий Cache-Control заголовок:
```
Cache-Control: public, max-age=31536000, immutable
```

Значение:
- `public` - может быть кэширован любым кэшем (браузер, CDN, proxies)
- `max-age=31536000` - 1 год (31536000 секунд) - максимальное время кэширования
- `immutable` - содержимое никогда не меняется, браузер не будет делать условные запросы даже после истечения срока кэша

Это решает проблему 304 Not Modified ответов и предотвращает ненужные запросы к S3.

## Обратная совместимость

### Старые thumbnails
Старые JPEG thumbnails в S3 останутся нетронутыми. Новые thumbnails будут создаваться в AVIF формате.

### Фронтенд
Убедитесь, что фронтенд поддерживает AVIF формат. Современные браузеры поддерживают AVIF:
- Chrome 85+
- Firefox 113+
- Safari 16.4+
- Edge 85+

При необходимости обеспечить fallback, используйте картинку:
```html
<picture>
  <source srcset="image.avif" type="image/avif">
  <img src="image.jpg" alt="...">
</picture>
```

## Тестирование

1. Запустите Taskiq worker и scheduler: `docker-compose up taskiq_worker taskiq_scheduler`
2. Загрузите новое фото через фронтенд
3. Проверьте, что thumbnail был создан в AVIF формате:
   ```bash
   aws s3api head-object \
     --endpoint-url http://localhost:9000 \
     --bucket viewport \
     --key gallery-id/thumbnails/filename.avif
   ```
4. Проверьте Content-Type:
   ```bash
   aws s3api head-object \
     --endpoint-url http://localhost:9000 \
     --bucket viewport \
     --key gallery-id/thumbnails/filename.avif \
     --query 'ContentType'
   # Должно вывести: "image/avif"
   ```

## Производительность

AVIF обычно дает:
- **файлы меньше на 30-50%** по сравнению с JPEG при том же качестве
- **примерно такое же время кодирования** как JPEG (может быть немного медленнее в зависимости от codec)
- **faster веб-сервис** благодаря меньшему размеру файла (быстрая передача, меньше нагрузка на S3)

## Откат

Если потребуется откатиться на JPEG:
1. Измените `format="AVIF"` обратно на `format="JPEG"` в `create_thumbnail()`
2. Измените `generate_thumbnail_object_key()` обратно на использование исходного расширения файла
3. Измените Content-Type обратно на `image/jpeg` в `_process_single_photo()`

Старые AVIF thumbnails можно удалить массово через S3 утилиты если требуется.
