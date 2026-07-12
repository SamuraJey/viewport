# Поддержка видео в галереях

## Summary

  Расширить существующую photo-модель до совместимой media-модели без переименования таблицы photos, идентификаторов photo_id и существующих URL. Оригинальное видео хранится
  неизменным для скачивания, а отдельный Celery-воркер создаёт:

  - статичный AVIF-постер для сеток и карточек;
  - браузерную MP4-версию H.264/AAC для просмотра и видео-обложек.

  Поддерживаемые входы v1: MP4, MOV, M4V, WebM, MKV, AVI, MPEG и 3GP; фактический формат проверяется через ffprobe, а не по MIME/расширению. Лимит: 500 МБ и 30 минут. В
  квоту входит только оригинал.

  ## Implementation Changes

  ### 1. Модель данных и миграция

  Расширить Photo в src/viewport/models/gallery.py:115:

  - media_type: image | video, default/backfill image;
  - source_content_type;
  - playback_object_key, nullable;
  - duration_ms, nullable;
  - processing_error, nullable;
  - использовать существующий thumbnail_object_key как thumbnail изображения или poster видео;
  - переименовать внутренний статус THUMBNAIL_CREATING в общий PROCESSING, сохранив числовое значение 4 и старый alias.

  Миграция должна:

  - не менять существующие строки и FK cover_photo_id;
  - добавить DB constraints для media_type и неотрицательной duration;
  - сохранить существующие изображения полностью работоспособными;

  Старые поля photo_count, total_photos и photo_id сохраняются, но документируются как compatibility-названия для всех готовых media.

  ### 2. Загрузка и обработка

  Расширить текущий upload API в src/viewport/api/photo.py:139:

  - изображения продолжают использовать существующий single PUT и лимит 10 МБ;
  - видео до 500 МБ загружаются multipart-частями по 16 MiB;
  - batch-presigned response получает discriminator upload_mode: single | multipart, upload_id, part_size и presigned part URLs;
  - добавить complete/abort endpoints с проверкой владельца, upload_id, ETag и суммарного размера;
  - отменённые и просроченные multipart uploads автоматически abort-ятся и освобождают reserved quota;
  - confirm остаётся идемпотентным и запускает media processing только после успешного завершения объекта.

  Multipart обязателен для файлов от 100 МБ: AWS рекомендует рассматривать его начиная с этого размера, а незавершённые uploads необходимо явно complete или abort (AWS
  multipart documentation (https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html), limits
  (https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html)).

  Добавить отдельную Celery-очередь и worker video:

  - concurrency 1, настраиваемые CPU/RAM/temp-disk limits;
  - FFmpeg/ffprobe устанавливаются в backend image;
  - worker скачивает оригинал во временный файл, не загружая 500 МБ в Python memory;
  - ffprobe проверяет наличие видеопотока, duration ≤ 1800 секунд, dimensions, rotation и допустимое количество потоков;
  - delivery output: MP4, H.264, AAC 128 kbps, yuv420p, faststart, максимум 1280×720 без upscale, до 60 fps;
  - видео без аудио разрешено;
  - poster берётся около min(5 секунд, 10% duration), при ошибке — первый декодируемый кадр, затем сохраняется в AVIF;
  - SUCCESSFUL устанавливается только после загрузки poster и playback MP4;
  - retry удаляет частичные производные и повторяет операцию идемпотентно.

  faststart размещает MP4 metadata в начале файла для более быстрого начала воспроизведения (FFmpeg formats documentation (https://ffmpeg.org/ffmpeg-formats.html)).

  Битые, подменённые, слишком длинные файлы и контейнеры без видеопотока:

  - не публикуются;
  - оригинал и частичные derivatives удаляются;
  - квота освобождается;
  - FAILED-запись временно сохраняет понятную ошибку для owner UI и позднее очищается фоновой задачей.

  Delete, gallery purge, orphan cleanup и presigned-cache invalidation должны обрабатывать original, poster и playback объекты.

  ### 3. API и frontend types

  Расширить private/public DTO:

  type MediaType = 'image' | 'video';

  interface MediaItem {
    id: string;
    media_type: MediaType;
    thumbnail_url: string;       // image thumbnail или video poster
    url: string;                 // image original или video playback
    playback_url?: string;       // только video
    duration_ms?: number;
    width?: number;
    height?: number;
    status?: 'pending' | 'processing' | 'successful' | 'failed';
    processing_error?: string;
  }

  Cover response становится типизированным descriptor:

  interface MediaCover {
    photo_id: string;
    media_type: MediaType;
    thumbnail_url: string;
    full_url: string;
    playback_url?: string;
  }

  Существующие cover_photo_thumbnail_url, thumbnail_url, full_url и маршруты /photos сохраняются для совместимости. Для видео full_url указывает на delivery MP4; оригинал
  всегда скачивается через существующий защищённый download endpoint.

  Обновить private/public/project/share-link API:

  - video участвует в sorting, pagination, search, selection/favorites и counts;
  - project shares продолжают исключать media из direct_only galleries;
  - ZIP содержит оригинальные видео с правильными расширениями;
  - single-download отдаёт оригинальный файл и сохраняет публичную аналитику;
  - gallery/project cover можно назначить только на SUCCESSFUL media с готовым poster;
  - fallback cover остаётся первым готовым элементом публичной сортировки.

  ### 4. UI и UX

  Заменить photo-only карточки на общий media renderer:

  - изображения сохраняют текущий UX;
  - видео в owner/public grid показывают poster, play badge и duration;
  - клик открывает mixed-media viewer с <video controls playsInline preload="metadata" poster>;
  - при смене slide видео ставится на паузу;
  - zoom применяется только к изображениям;
  - download всегда вызывает original-download endpoint.

  Upload flow:

  - file picker и drag-and-drop принимают согласованные видеоформаты;
  - image resize не предлагается для видео;
  - отображаются отдельные лимиты фото/видео;
  - multipart progress агрегируется по частям и поддерживает retry без повторной загрузки завершённых частей;
  - после upload owner видит Processing video, затем готовую карточку либо конкретную ошибку.

  Video cover:

  - в одиночном публичном hero галереи/проекта: poster загружается первым, затем muted autoPlay loop playsInline;
  - видео останавливается вне viewport;
  - при prefers-reduced-motion, Save-Data, autoplay error или processing failure остаётся poster;
  - dashboard/list/share-link cards используют только poster+badge, чтобы не запускать одновременно несколько роликов;
  Обновить demo mode видеопримером и теми же grid/viewer/cover сценариями.

  ### 5. Инфраструктура, документация и наблюдаемость

  - Добавить FFmpeg в Dockerfile.backend.
  - Разделить image/default и video queues в celery_app.py и docker-compose.yml; video worker получает отдельные resource limits и временный volume.
  - Проверить поддержку RustFS: multipart upload, abort, ETag completion, Range GET и seek по presigned MP4.
  - Добавить метрики: глубина video queue, duration транскодирования, ошибки по входному формату, retry count, размеры original/derivative и cleanup failures.
  - Обновить AGENTS.md архитектурным media pipeline и создать документацию в docs/ по форматам, лимитам, обработке, скачиванию оригиналов и эксплуатации worker.

  ## Test Plan

  - Migration: существующие изображения backfill-ятся как image; upgrade/head/check и migration tests проходят.
  - Upload: границы 10 МБ для изображений, 500 МБ для видео, multipart complete/abort/retry, неверные ETag и quota rollback.
  - Processing: MP4/MOV/WebM/MKV/AVI, видео без звука, portrait/rotation, битый файл, spoofed MIME, отсутствие video stream, ровно 30:00 и превышение duration.
  - Idempotency: повтор confirm/task не удваивает quota и не создаёт лишние derivatives.
  - Cleanup: удаление media/галереи очищает original, poster, playback и cover FK.
  - API: private/public/project responses, sorting, pagination, counts, direct_only, cover fallback и compatibility-поля.
  - Downloads: single download и mixed ZIP возвращают оригинальные байты и имена; публичная аналитика сохраняется.
  - Selection: video можно выбрать, прокомментировать и экспортировать с gallery context.
  - Frontend: upload validation/progress, processing/error cards, mixed viewer, keyboard accessibility, pause on navigation.
  - E2E: video gallery cover autoplay; poster fallback при reduced-motion/Save-Data; project video cover; мобильный playsInline; light/dark themes.
  - Verification gates: Ruff, mypy, backend tests, migration tests, frontend lint/tests/build и Docker smoke test с реальными RustFS + Redis + Celery video worker.

  ## Assumptions and Defaults

  - Первая версия использует один progressive MP4 derivative; HLS/adaptive bitrate не входит в scope.
  - Оригинал никогда не транскодируется и учитывается в квоте; poster/playback считаются инфраструктурными расходами.
  - Входной allowlist: MP4, MOV, M4V, WebM, MKV, AVI, MPEG/MPG и 3GP; окончательное решение о валидности принимает ffprobe.
  - Видео обложки автоматически проигрывается только на одиночных hero-поверхностях; списки используют статичный poster.
  - Незавершённые media видны владельцу как processing state, но никогда не доступны через публичные shares.