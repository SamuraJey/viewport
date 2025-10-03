# Техническое задание: Ограничение на общий объем файлов пользователя

## Версия: 1.0
## Дата: 3 октября 2025 г.
## Статус: Draft

---

## 1. Обзор и цели

### 1.1 Основная цель
Внедрить систему ограничения на общий объем файлов (storage quota) для каждого пользователя фотопортфолио-сайта, чтобы контролировать использование хранилища и предотвратить неограниченное потребление ресурсов.

### 1.2 Бизнес-задачи
- Контроль расходов на S3/MinIO хранилище
- Возможность монетизации через тарифные планы с разными лимитами
- Предсказуемость роста инфраструктуры
- Защита от злоупотреблений (массовая загрузка файлов)

### 1.3 Технические задачи
- Добавить поля для учета использования хранилища в модель User
- Реализовать подсчет текущего использования при загрузке/удалении файлов
- Добавить проверки квоты перед загрузкой
- Предоставить API для получения информации об использовании хранилища
- Обновить фронтенд для отображения использования квоты

---

## 2. Стейкхолдеры

- **Фотографы (пользователи)** – должны понимать свои лимиты и текущее использование
- **Владелец продукта** – контролирует стратегию монетизации
- **Backend разработчики** – реализуют логику квот
- **Frontend разработчики** – отображают информацию о квотах
- **DevOps** – мониторят использование хранилища

---

## 3. Область применения (Scope)

### 3.1 Включено в текущую итерацию

✅ **Backend:**
- Добавление полей `storage_used` (BigInt) и `storage_quota` (BigInt) в модель User
- Миграция базы данных (Alembic)
- Автоматический подсчет использованного хранилища при загрузке файлов
- Автоматическое уменьшение счетчика при удалении файлов/галерей
- Проверка квоты перед загрузкой (single + batch upload)
- API эндпоинт для получения информации об использовании: GET `/users/me/storage`
- Функция пересчета использования хранилища: POST `/admin/users/{user_id}/recalculate-storage` (для админов)
- Конфигурация дефолтной квоты через переменные окружения
- Обработка ошибок 507 "Insufficient Storage"

✅ **Frontend:**
- Отображение использования хранилища на странице профиля
- Progress bar с визуализацией использования квоты
- Предупреждения при приближении к лимиту (>80%, >95%)
- Понятные сообщения об ошибках при превышении квоты

✅ **Testing:**
- Unit тесты для подсчета использования
- Integration тесты для проверки квот при загрузке
- Тесты на граничные случаи (ровно квота, превышение на 1 байт)
- Тесты на корректность уменьшения при удалении

### 3.2 Исключено (будущие итерации)

❌ Не включено сейчас:
- Тарифные планы (plans/subscriptions)
- Административная панель для управления квотами пользователей
- Email уведомления о приближении к лимиту
- Детальная история использования хранилища (аудит лог)
- Возможность покупки дополнительного места
- Групповые квоты для team accounts
- Квоты на количество галерей/фотографий (только размер)

---

## 4. Пользовательские истории

| ID       | Роль               | История                                                                                | Критерии приёмки                                                                                        |
| -------- | ------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **SQ-1** | Фотограф           | Как фотограф, я хочу видеть, сколько места я использую и какой у меня лимит            | На странице профиля отображается: "Использовано: 450 MB из 5 GB (9%)" с progress bar                    |
| **SQ-2** | Фотограф           | Как фотограф, я хочу получить предупреждение, когда приближаюсь к лимиту               | При >80% показывается warning, при >95% показывается alert                                              |
| **SQ-3** | Фотограф           | Как фотограф, я не должен иметь возможность загрузить файл, который превысит мой лимит | При попытке загрузки возвращается 507 с сообщением "Недостаточно места (осталось X MB, требуется Y MB)" |
| **SQ-4** | Фотограф           | Как фотограф, при удалении фотографий мой счетчик использования должен уменьшаться     | После удаления фото счетчик `storage_used` уменьшается на размер удаленного файла                       |
| **SQ-5** | Фотограф           | Как фотограф, при batch upload я хочу видеть, какие файлы не загрузились из-за квоты   | API возвращает детальный ответ: успешные и неуспешные загрузки с причинами                              |
| **SQ-6** | Система            | Как система, я должна корректно отслеживать использование при создании thumbnails      | Размер thumbnails также учитывается в `storage_used`                                                    |
| **SQ-7** | Администратор      | Как админ, я хочу пересчитать использование хранилища для пользователя                 | Эндпоинт POST `/admin/users/{user_id}/recalculate-storage` пересчитывает все файлы                      |
| **SQ-8** | Новый пользователь | Как новый пользователь при регистрации я получаю дефолтную квоту                       | `storage_quota` устанавливается в значение из env переменной (по умолчанию 5 GB)                        |

---

## 5. Функциональные требования

### 5.1 Модель данных

#### 5.1.1 Изменения в модели User

**Файл:** `src/viewport/models/user.py`

Добавить поля:

```python
from sqlalchemy import BigInteger

class User(Base):
    # ... существующие поля ...

    # Storage quota in bytes (default 5GB = 5 * 1024 * 1024 * 1024)
    storage_quota = mapped_column(
        BigInteger,
        nullable=False,
        default=5368709120,  # 5 GB
        server_default="5368709120"
    )

    # Current storage usage in bytes
    storage_used = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        server_default="0"
    )
```

**Обоснование типов:**
- `BigInteger` (64-bit) вместо `Integer` (32-bit):
  - Integer max: ~2.1 GB (2^31 - 1 bytes)
  - BigInteger max: ~9.2 exabytes (2^63 - 1 bytes)
  - Достаточно для любых реалистичных сценариев

#### 5.1.2 Миграция базы данных

**Команда создания миграции:**
```bash
alembic revision --autogenerate -m "Add storage quota fields to users"
```

**Содержание миграции:**
```python
def upgrade():
    op.add_column('users', sa.Column(
        'storage_quota',
        sa.BigInteger(),
        nullable=False,
        server_default='5368709120'  # 5 GB
    ))
    op.add_column('users', sa.Column(
        'storage_used',
        sa.BigInteger(),
        nullable=False,
        server_default='0'
    ))

def downgrade():
    op.drop_column('users', 'storage_used')
    op.drop_column('users', 'storage_quota')
```

**После миграции для существующих пользователей:**
- Запустить скрипт пересчета `storage_used` для всех существующих пользователей
- Или выполнить SQL запрос для подсчета:

```sql
UPDATE users u
SET storage_used = (
    SELECT COALESCE(SUM(p.file_size), 0)
    FROM photos p
    JOIN galleries g ON p.gallery_id = g.id
    WHERE g.owner_id = u.id
);
```

### 5.2 Настройки через Environment Variables

**Файл:** `src/viewport/auth_utils.py` или новый `src/viewport/storage_settings.py`

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class StorageSettings(BaseSettings):
    """Storage and quota settings"""

    # Default storage quota for new users (in bytes)
    default_storage_quota: int = 5 * 1024 * 1024 * 1024  # 5 GB

    # Maximum file size for single upload (in bytes)
    max_file_size: int = 15 * 1024 * 1024  # 15 MB

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

storage_settings = StorageSettings()
```

**Environment Variables:**
```bash
# .env
DEFAULT_STORAGE_QUOTA=5368709120  # 5 GB in bytes
MAX_FILE_SIZE=15728640            # 15 MB in bytes
```

### 5.3 Backend API изменения

#### 5.3.1 Обновление UserRepository

**Файл:** `src/viewport/repositories/user_repository.py`

Добавить методы:

```python
class UserRepository(BaseRepository):
    # ... существующие методы ...

    def get_storage_info(self, user_id: uuid.UUID) -> dict[str, int] | None:
        """Get user's storage quota and usage information"""
        user = self.get_user_by_id(user_id)
        if not user:
            return None

        return {
            "storage_used": user.storage_used,
            "storage_quota": user.storage_quota,
            "storage_available": user.storage_quota - user.storage_used,
            "usage_percentage": round((user.storage_used / user.storage_quota) * 100, 2)
        }

    def check_storage_available(
        self,
        user_id: uuid.UUID,
        required_bytes: int
    ) -> tuple[bool, int]:
        """
        Check if user has enough storage space

        Returns:
            (has_space: bool, available_bytes: int)
        """
        user = self.get_user_by_id(user_id)
        if not user:
            return False, 0

        available = user.storage_quota - user.storage_used
        return available >= required_bytes, available

    def increment_storage_used(
        self,
        user_id: uuid.UUID,
        bytes_added: int
    ) -> bool:
        """Increment user's storage usage"""
        user = self.get_user_by_id(user_id)
        if not user:
            return False

        user.storage_used += bytes_added
        self.db.commit()
        self.db.refresh(user)
        return True

    def decrement_storage_used(
        self,
        user_id: uuid.UUID,
        bytes_removed: int
    ) -> bool:
        """Decrement user's storage usage"""
        user = self.get_user_by_id(user_id)
        if not user:
            return False

        # Prevent negative values
        user.storage_used = max(0, user.storage_used - bytes_removed)
        self.db.commit()
        self.db.refresh(user)
        return True

    def recalculate_storage_used(self, user_id: uuid.UUID) -> int | None:
        """
        Recalculate total storage used by counting all user's photos
        Returns new storage_used value or None if user not found
        """
        from sqlalchemy import func
        from src.viewport.models.gallery import Gallery, Photo

        # Calculate total file size from all photos in user's galleries
        stmt = (
            select(func.coalesce(func.sum(Photo.file_size), 0))
            .select_from(Photo)
            .join(Gallery, Photo.gallery_id == Gallery.id)
            .where(Gallery.owner_id == user_id)
        )

        total_size = self.db.execute(stmt).scalar()

        user = self.get_user_by_id(user_id)
        if not user:
            return None

        user.storage_used = total_size or 0
        self.db.commit()
        self.db.refresh(user)
        return user.storage_used

    def update_user_quota(
        self,
        user_id: uuid.UUID,
        new_quota_bytes: int
    ) -> User | None:
        """Update user's storage quota (admin operation)"""
        user = self.get_user_by_id(user_id)
        if not user:
            return None

        user.storage_quota = new_quota_bytes
        self.db.commit()
        self.db.refresh(user)
        return user
```

#### 5.3.2 Обновление GalleryRepository

**Файл:** `src/viewport/repositories/gallery_repository.py`

Изменить методы `create_photo` и `delete_photo`:

```python
def create_photo(
    self,
    gallery_id: uuid.UUID,
    owner_id: uuid.UUID,  # НОВЫЙ параметр
    object_key: str,
    thumbnail_object_key: str,
    file_size: int,
    width: int | None = None,
    height: int | None = None
) -> Photo:
    """Create photo and update owner's storage usage"""
    photo = Photo(
        gallery_id=gallery_id,
        object_key=object_key,
        thumbnail_object_key=thumbnail_object_key,
        file_size=file_size,
        width=width,
        height=height
    )
    self.db.add(photo)
    self.db.commit()
    self.db.refresh(photo)

    # Update user's storage usage
    from src.viewport.repositories.user_repository import UserRepository
    user_repo = UserRepository(self.db)
    user_repo.increment_storage_used(owner_id, file_size)

    return photo

def delete_photo(
    self,
    photo_id: uuid.UUID,
    gallery_id: uuid.UUID,
    owner_id: uuid.UUID
) -> bool:
    """Delete photo and update owner's storage usage"""
    from src.viewport.minio_utils import delete_object

    photo = self.get_photo_by_id_and_owner(photo_id, owner_id)
    if not photo or photo.gallery_id != gallery_id:
        return False

    file_size = photo.file_size

    # Delete from MinIO
    delete_object(photo.object_key)
    if photo.thumbnail_object_key != photo.object_key:
        delete_object(photo.thumbnail_object_key)

    # Delete from database
    self.db.delete(photo)
    self.db.commit()

    # Update user's storage usage
    from src.viewport.repositories.user_repository import UserRepository
    user_repo = UserRepository(self.db)
    user_repo.decrement_storage_used(owner_id, file_size)

    return True
```

#### 5.3.3 Новые API эндпоинты

**Файл:** `src/viewport/api/user.py` (новый или обновить `auth.py`)

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.viewport.auth_utils import get_current_user
from src.viewport.db import get_db
from src.viewport.repositories.user_repository import UserRepository
from src.viewport.schemas.user import StorageInfoResponse

router = APIRouter(prefix="/users", tags=["users"])

def get_user_repository(db: Session = Depends(get_db)) -> UserRepository:
    return UserRepository(db)

@router.get("/me/storage", response_model=StorageInfoResponse)
def get_my_storage_info(
    repo: UserRepository = Depends(get_user_repository),
    current_user = Depends(get_current_user),
):
    """Get current user's storage quota and usage information"""
    storage_info = repo.get_storage_info(current_user.id)
    if not storage_info:
        raise HTTPException(status_code=404, detail="User not found")

    return StorageInfoResponse(**storage_info)
```

**Схемы (Pydantic):**

**Файл:** `src/viewport/schemas/user.py` (новый)

```python
from pydantic import BaseModel, Field

class StorageInfoResponse(BaseModel):
    """Storage quota and usage information"""
    storage_used: int = Field(..., description="Storage used in bytes")
    storage_quota: int = Field(..., description="Total storage quota in bytes")
    storage_available: int = Field(..., description="Available storage in bytes")
    usage_percentage: float = Field(..., description="Usage percentage (0-100)")

    # Helper properties for frontend (optional)
    @property
    def storage_used_mb(self) -> float:
        return round(self.storage_used / (1024 * 1024), 2)

    @property
    def storage_quota_mb(self) -> float:
        return round(self.storage_quota / (1024 * 1024), 2)

    @property
    def storage_used_gb(self) -> float:
        return round(self.storage_used / (1024 * 1024 * 1024), 2)

    @property
    def storage_quota_gb(self) -> float:
        return round(self.storage_quota / (1024 * 1024 * 1024), 2)
```

Обновить `MeResponse`:

```python
class MeResponse(BaseModel):
    id: str
    email: EmailStr
    display_name: str | None = None
    storage_used: int  # NEW
    storage_quota: int  # NEW
    usage_percentage: float  # NEW
```

#### 5.3.4 Обновление photo upload эндпоинтов

**Файл:** `src/viewport/api/photo.py`

Изменения в `upload_photo`:

```python
@router.post("/{gallery_id}/photos", response_model=PhotoResponse, status_code=status.HTTP_201_CREATED)
def upload_photo(
    gallery_id: UUID,
    file: UploadFile = File(...),
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user = Depends(get_current_user)
):
    # Check gallery ownership
    gallery = repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    # Validate file size
    contents = file.file.read()
    file_size = len(contents)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 15MB)")

    # NEW: Check storage quota
    user_repo = UserRepository(repo.db)
    has_space, available = user_repo.check_storage_available(
        current_user.id,
        file_size
    )

    if not has_space:
        available_mb = round(available / (1024 * 1024), 2)
        required_mb = round(file_size / (1024 * 1024), 2)
        raise HTTPException(
            status_code=507,  # Insufficient Storage
            detail=f"Insufficient storage space. Available: {available_mb} MB, Required: {required_mb} MB"
        )

    # ... rest of upload logic ...

    # Update create_photo call to include owner_id
    photo = repo.create_photo(
        gallery_id,
        current_user.id,  # NEW parameter
        object_key,
        thumbnail_object_key,
        file_size,
        width=width,
        height=height
    )

    return PhotoResponse.from_db_photo(photo)
```

Аналогичные изменения в `upload_photos_batch`:

```python
@router.post("/{gallery_id}/photos/batch", response_model=PhotoUploadResponse)
def upload_photos_batch(
    gallery_id: UUID,
    files: Annotated[list[UploadFile], File()],
    repo: GalleryRepository = Depends(get_gallery_repository),
    current_user = Depends(get_current_user)
):
    gallery = repo.get_gallery_by_id_and_owner(gallery_id, current_user.id)
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    user_repo = UserRepository(repo.db)
    results = []
    successful_uploads = 0
    failed_uploads = 0

    for file in files:
        try:
            contents = file.file.read()
            file_size = len(contents)

            # Check individual file size
            if file_size > MAX_FILE_SIZE:
                results.append(PhotoUploadResult(
                    filename=file.filename or "unknown",
                    success=False,
                    error=f"File too large (max 15MB), got {file_size / (1024 * 1024):.1f}MB"
                ))
                failed_uploads += 1
                continue

            # NEW: Check storage quota for each file
            has_space, available = user_repo.check_storage_available(
                current_user.id,
                file_size
            )

            if not has_space:
                available_mb = round(available / (1024 * 1024), 2)
                required_mb = round(file_size / (1024 * 1024), 2)
                results.append(PhotoUploadResult(
                    filename=file.filename or "unknown",
                    success=False,
                    error=f"Insufficient storage. Available: {available_mb} MB, Required: {required_mb} MB"
                ))
                failed_uploads += 1
                continue

            # ... upload logic ...

            # Update create_photo call
            photo = repo.create_photo(
                gallery_id,
                current_user.id,  # NEW
                object_key,
                thumbnail_object_key,
                file_size,
                width=w,
                height=h
            )

            photo_response = PhotoResponse.from_db_photo(photo)
            results.append(PhotoUploadResult(
                filename=file.filename or "unknown",
                success=True,
                photo=photo_response
            ))
            successful_uploads += 1

        except Exception as e:
            results.append(PhotoUploadResult(
                filename=file.filename or "unknown",
                success=False,
                error=str(e)
            ))
            failed_uploads += 1
        finally:
            file.file.seek(0)

    return PhotoUploadResponse(
        results=results,
        total_files=len(files),
        successful_uploads=successful_uploads,
        failed_uploads=failed_uploads
    )
```

#### 5.3.5 Административные эндпоинты (опционально)

**Файл:** `src/viewport/api/admin.py` (новый)

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.viewport.auth_utils import get_current_user, require_admin
from src.viewport.db import get_db
from src.viewport.repositories.user_repository import UserRepository

router = APIRouter(prefix="/admin", tags=["admin"])

def get_user_repository(db: Session = Depends(get_db)) -> UserRepository:
    return UserRepository(db)

@router.post("/users/{user_id}/recalculate-storage")
def recalculate_user_storage(
    user_id: str,
    repo: UserRepository = Depends(get_user_repository),
    current_user = Depends(require_admin),  # Admin only!
):
    """Recalculate storage usage for a user (admin only)"""
    from uuid import UUID

    try:
        user_uuid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    new_usage = repo.recalculate_storage_used(user_uuid)
    if new_usage is None:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "user_id": user_id,
        "storage_used": new_usage,
        "message": "Storage usage recalculated successfully"
    }

@router.patch("/users/{user_id}/quota")
def update_user_quota(
    user_id: str,
    new_quota_bytes: int,
    repo: UserRepository = Depends(get_user_repository),
    current_user = Depends(require_admin),
):
    """Update user's storage quota (admin only)"""
    from uuid import UUID

    try:
        user_uuid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    if new_quota_bytes < 0:
        raise HTTPException(status_code=400, detail="Quota cannot be negative")

    user = repo.update_user_quota(user_uuid, new_quota_bytes)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "user_id": user_id,
        "storage_quota": user.storage_quota,
        "message": "Quota updated successfully"
    }
```

**Примечание:** Реализация `require_admin` зависит от вашей системы ролей. Простой вариант:

```python
# В auth_utils.py
def require_admin(current_user = Depends(get_current_user)):
    """Check if current user is admin (implement your logic)"""
    # Вариант 1: проверка email
    if current_user.email not in ["admin@viewport.com"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

    # Вариант 2: добавить поле is_admin в User модель
    # if not current_user.is_admin:
    #     raise HTTPException(status_code=403, detail="Admin access required")
    # return current_user
```

### 5.4 Учет размера thumbnails

При создании thumbnails их размер также должен учитываться:

```python
# В upload_photo и upload_photos_batch после создания thumbnail:

thumbnail_size = len(thumbnail_bytes)
total_size = file_size + thumbnail_size

# Проверять квоту для total_size
has_space, available = user_repo.check_storage_available(
    current_user.id,
    total_size  # Оригинал + thumbnail
)

# И при создании фото указывать total_size
photo = repo.create_photo(
    gallery_id,
    current_user.id,
    object_key,
    thumbnail_object_key,
    total_size,  # Общий размер
    width=width,
    height=height
)
```

**Альтернативный подход:** Хранить размер thumbnail отдельно в модели Photo:

```python
class Photo(Base):
    # ...
    file_size = mapped_column(Integer, nullable=False)  # Оригинал
    thumbnail_size = mapped_column(Integer, nullable=True)  # Thumbnail
```

### 5.5 Регистрация нового пользователя

**Файл:** `src/viewport/api/auth.py`

При создании пользователя устанавливать дефолтную квоту:

```python
def register_user(request: RegisterRequest, repo: UserRepository = Depends(get_user_repository)):
    # ... validation logic ...

    # Create user
    user = repo.create_user(email, password_hash)

    # Set default quota from settings
    from src.viewport.storage_settings import storage_settings
    repo.update_user_quota(user.id, storage_settings.default_storage_quota)

    # ... return response ...
```

Или напрямую в `create_user`:

```python
class UserRepository(BaseRepository):
    def create_user(self, email: str, password_hash: str) -> User:
        from src.viewport.storage_settings import storage_settings

        user = User(
            id=uuid.uuid4(),
            email=email,
            password_hash=password_hash,
            storage_quota=storage_settings.default_storage_quota,
            storage_used=0,
        )
        self.db.add(user)
        # ...
```

---

## 6. Frontend требования

### 6.1 Компонент StorageQuota

**Местоположение:** `frontend/src/components/StorageQuota.tsx`

```tsx
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

interface StorageInfo {
  storage_used: number;
  storage_quota: number;
  storage_available: number;
  usage_percentage: number;
}

export const StorageQuota: React.FC = () => {
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStorageInfo();
  }, []);

  const loadStorageInfo = async () => {
    try {
      const data = await api.getStorageInfo();
      setStorage(data);
    } catch (error) {
      console.error('Failed to load storage info:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!storage) return null;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getColorClass = (percentage: number): string => {
    if (percentage >= 95) return 'bg-red-500';
    if (percentage >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getAlertMessage = (): string | null => {
    if (storage.usage_percentage >= 95) {
      return 'Critical: You have used 95% of your storage. Please delete some photos.';
    }
    if (storage.usage_percentage >= 80) {
      return 'Warning: You have used 80% of your storage.';
    }
    return null;
  };

  return (
    <div className="storage-quota-container p-4 border rounded-lg">
      <h3 className="text-lg font-semibold mb-2">Storage Usage</h3>

      {/* Alert message */}
      {getAlertMessage() && (
        <div className={`alert mb-3 p-2 rounded ${
          storage.usage_percentage >= 95 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
        }`}>
          {getAlertMessage()}
        </div>
      )}

      {/* Storage info */}
      <div className="mb-2 text-sm">
        <span>{formatBytes(storage.storage_used)}</span>
        <span> of </span>
        <span>{formatBytes(storage.storage_quota)}</span>
        <span className="ml-2 text-gray-600">
          ({storage.usage_percentage.toFixed(1)}%)
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
        <div
          className={`h-full ${getColorClass(storage.usage_percentage)} transition-all duration-300`}
          style={{ width: `${Math.min(storage.usage_percentage, 100)}%` }}
        />
      </div>

      {/* Available space */}
      <div className="mt-2 text-sm text-gray-600">
        Available: {formatBytes(storage.storage_available)}
      </div>
    </div>
  );
};
```

### 6.2 Обновление API Service

**Файл:** `frontend/src/services/api.ts`

```typescript
export const api = {
  // ... existing methods ...

  async getStorageInfo(): Promise<StorageInfo> {
    const response = await fetch('/api/users/me/storage', {
      headers: {
        'Authorization': `Bearer ${getAccessToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch storage info');
    }

    return response.json();
  },
};
```

### 6.3 Обработка ошибки 507

**Файл:** `frontend/src/services/photoService.ts`

```typescript
export const uploadPhoto = async (galleryId: string, file: File) => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`/api/galleries/${galleryId}/photos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAccessToken()}`,
      },
      body: formData,
    });

    if (response.status === 507) {
      const error = await response.json();
      throw new StorageQuotaError(error.detail);
    }

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    return response.json();
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      // Show user-friendly message
      toast.error(`Insufficient storage: ${error.message}`);
    }
    throw error;
  }
};

class StorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}
```

### 6.4 Интеграция в Profile Page

```tsx
// ProfilePage.tsx
import { StorageQuota } from '../components/StorageQuota';

export const ProfilePage: React.FC = () => {
  return (
    <div className="profile-page">
      <h1>Profile</h1>

      {/* Storage quota widget */}
      <StorageQuota />

      {/* Other profile info */}
      {/* ... */}
    </div>
  );
};
```

---

## 7. Тестирование

### 7.1 Backend Unit Tests

**Файл:** `tests/test_storage_quota.py`

```python
import pytest
from uuid import uuid4

class TestStorageQuota:
    def test_new_user_has_default_quota(self, client, db):
        """Test that new user gets default storage quota"""
        # Register new user
        response = client.post("/auth/register", json={
            "email": "test@example.com",
            "password": "password123",
            "invite_code": "testinvitecode"
        })
        assert response.status_code == 201

        # Check storage quota is set
        user_repo = UserRepository(db)
        user = user_repo.get_user_by_email("test@example.com")
        assert user.storage_quota == 5 * 1024 * 1024 * 1024  # 5 GB
        assert user.storage_used == 0

    def test_upload_increments_storage_used(
        self,
        authenticated_client,
        gallery_id_fixture
    ):
        """Test that uploading a photo increments storage_used"""
        # Get initial storage
        storage_before = authenticated_client.get("/users/me/storage").json()

        # Upload a photo
        file_content = b"x" * 1000  # 1 KB
        files = {"file": ("test.jpg", file_content, "image/jpeg")}
        response = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/photos",
            files=files
        )
        assert response.status_code == 201

        # Check storage increased
        storage_after = authenticated_client.get("/users/me/storage").json()
        assert storage_after["storage_used"] > storage_before["storage_used"]

    def test_delete_decrements_storage_used(
        self,
        authenticated_client,
        gallery_id_fixture
    ):
        """Test that deleting a photo decrements storage_used"""
        # Upload a photo
        file_content = b"x" * 1000
        files = {"file": ("test.jpg", file_content, "image/jpeg")}
        upload_response = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/photos",
            files=files
        )
        photo_id = upload_response.json()["id"]

        storage_before = authenticated_client.get("/users/me/storage").json()

        # Delete the photo
        response = authenticated_client.delete(
            f"/galleries/{gallery_id_fixture}/photos/{photo_id}"
        )
        assert response.status_code == 204

        # Check storage decreased
        storage_after = authenticated_client.get("/users/me/storage").json()
        assert storage_after["storage_used"] < storage_before["storage_used"]

    def test_upload_rejected_when_quota_exceeded(
        self,
        authenticated_client,
        gallery_id_fixture,
        db
    ):
        """Test that upload is rejected when quota would be exceeded"""
        # Set user's quota to very low value
        user_repo = UserRepository(db)
        current_user = authenticated_client.current_user  # Assume we store this
        user_repo.update_user_quota(current_user.id, 1000)  # 1 KB quota

        # Try to upload a 2 KB file
        file_content = b"x" * 2000
        files = {"file": ("test.jpg", file_content, "image/jpeg")}
        response = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/photos",
            files=files
        )

        # Should be rejected with 507
        assert response.status_code == 507
        assert "insufficient storage" in response.json()["detail"].lower()

    def test_batch_upload_respects_quota(
        self,
        authenticated_client,
        gallery_id_fixture,
        db
    ):
        """Test that batch upload respects quota"""
        # Set quota to allow only 1 file
        user_repo = UserRepository(db)
        current_user = authenticated_client.current_user
        user_repo.update_user_quota(current_user.id, 1500)  # 1.5 KB

        # Try to upload 2 files of 1 KB each
        files = [
            ("files", ("photo1.jpg", b"x" * 1000, "image/jpeg")),
            ("files", ("photo2.jpg", b"x" * 1000, "image/jpeg")),
        ]
        response = authenticated_client.post(
            f"/galleries/{gallery_id_fixture}/photos/batch",
            files=files
        )

        assert response.status_code == 200
        data = response.json()
        assert data["successful_uploads"] == 1
        assert data["failed_uploads"] == 1
        assert "insufficient storage" in data["results"][1]["error"].lower()

    def test_recalculate_storage_used(self, authenticated_client, db):
        """Test recalculation of storage usage"""
        user_repo = UserRepository(db)
        current_user = authenticated_client.current_user

        # Manually corrupt storage_used
        user_repo.increment_storage_used(current_user.id, 999999)

        # Recalculate
        new_usage = user_repo.recalculate_storage_used(current_user.id)

        # Should be corrected based on actual photos
        assert new_usage >= 0

    def test_storage_info_endpoint(self, authenticated_client):
        """Test /users/me/storage endpoint"""
        response = authenticated_client.get("/users/me/storage")
        assert response.status_code == 200

        data = response.json()
        assert "storage_used" in data
        assert "storage_quota" in data
        assert "storage_available" in data
        assert "usage_percentage" in data
        assert data["storage_available"] == (
            data["storage_quota"] - data["storage_used"]
        )
```

### 7.2 Frontend Tests

**Файл:** `frontend/src/__tests__/components/StorageQuota.test.tsx`

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { StorageQuota } from '../../components/StorageQuota';
import { api } from '../../services/api';

jest.mock('../../services/api');

describe('StorageQuota', () => {
  it('displays storage information correctly', async () => {
    const mockStorageInfo = {
      storage_used: 1073741824, // 1 GB
      storage_quota: 5368709120, // 5 GB
      storage_available: 4294967296, // 4 GB
      usage_percentage: 20,
    };

    (api.getStorageInfo as jest.Mock).mockResolvedValue(mockStorageInfo);

    render(<StorageQuota />);

    await waitFor(() => {
      expect(screen.getByText(/1.00 GB/)).toBeInTheDocument();
      expect(screen.getByText(/5.00 GB/)).toBeInTheDocument();
      expect(screen.getByText(/20.0%/)).toBeInTheDocument();
    });
  });

  it('shows warning when usage is above 80%', async () => {
    const mockStorageInfo = {
      storage_used: 4294967296,
      storage_quota: 5368709120,
      storage_available: 1073741824,
      usage_percentage: 85,
    };

    (api.getStorageInfo as jest.Mock).mockResolvedValue(mockStorageInfo);

    render(<StorageQuota />);

    await waitFor(() => {
      expect(screen.getByText(/Warning: You have used 80%/)).toBeInTheDocument();
    });
  });

  it('shows critical alert when usage is above 95%', async () => {
    const mockStorageInfo = {
      storage_used: 5100273459,
      storage_quota: 5368709120,
      storage_available: 268435661,
      usage_percentage: 96,
    };

    (api.getStorageInfo as jest.Mock).mockResolvedValue(mockStorageInfo);

    render(<StorageQuota />);

    await waitFor(() => {
      expect(screen.getByText(/Critical:/)).toBeInTheDocument();
    });
  });
});
```

### 7.3 Integration Tests

```python
# tests/test_storage_integration.py

def test_full_upload_delete_cycle_updates_storage(
    authenticated_client,
    gallery_id_fixture
):
    """Test complete cycle: upload -> check -> delete -> check"""
    # Initial state
    storage_initial = authenticated_client.get("/users/me/storage").json()
    initial_used = storage_initial["storage_used"]

    # Upload
    file_content = b"x" * 5000
    files = {"file": ("test.jpg", file_content, "image/jpeg")}
    upload_resp = authenticated_client.post(
        f"/galleries/{gallery_id_fixture}/photos",
        files=files
    )
    assert upload_resp.status_code == 201
    photo_id = upload_resp.json()["id"]

    # Check storage increased
    storage_after_upload = authenticated_client.get("/users/me/storage").json()
    assert storage_after_upload["storage_used"] > initial_used

    # Delete
    delete_resp = authenticated_client.delete(
        f"/galleries/{gallery_id_fixture}/photos/{photo_id}"
    )
    assert delete_resp.status_code == 204

    # Check storage back to initial (or close to it)
    storage_after_delete = authenticated_client.get("/users/me/storage").json()
    assert abs(storage_after_delete["storage_used"] - initial_used) < 100
```

---

## 8. Метрики и мониторинг

### 8.1 Метрики для сбора

- Средний процент использования хранилища пользователями
- Количество пользователей, превысивших 80% квоты
- Количество отклоненных загрузок из-за квоты (507 ошибки)
- Общий объем использованного хранилища в системе
- Распределение пользователей по тарифам (после введения планов)

### 8.2 Алерты

- Alert при среднем использовании >70% (может указывать на необходимость повышения дефолтной квоты)
- Alert при частых 507 ошибках (плохой UX)
- Alert при расхождении между `storage_used` и фактическим размером файлов в S3

### 8.3 Логирование

Логировать события:
- Превышение квоты (status=507)
- Изменение квоты пользователя (admin action)
- Пересчет использования хранилища
- Критическое использование хранилища (>95%)

---

## 9. Безопасность

### 9.1 Предотвращение обхода ограничений

- Все проверки квоты на backend (не доверять frontend)
- Транзакционность: инкремент/декремент `storage_used` в одной транзакции с созданием/удалением Photo
- Защита от race conditions при параллельных загрузках
- Валидация: `storage_used` не может быть отрицательным

### 9.2 Защита от злоупотреблений

- Rate limiting на upload endpoints
- Проверка типов файлов (не только по расширению, но и по magic bytes)
- Максимальный размер одного файла (уже есть: 15 MB)
- Защита админских эндпоинтов (/admin/*) требованием роли

---

## 10. Документация

### 10.1 API документация (OpenAPI/Swagger)

Обновить Swagger схему:
- Добавить описание новых эндпоинтов
- Документировать новую ошибку 507
- Примеры запросов/ответов

### 10.2 Документация для пользователей

Создать FAQ:
- "Какой у меня лимит хранилища?"
- "Что делать, если квота заполнена?"
- "Учитываются ли thumbnails в моей квоте?"
- "Как удалить фотографии, чтобы освободить место?"

### 10.3 README для разработчиков

Добавить секцию:
- Как настроить дефолтную квоту
- Как пересчитать использование для всех пользователей
- Как изменить квоту конкретного пользователя

---

## 11. План внедрения (Rollout Plan)

### Фаза 1: Подготовка (1-2 дня)
- [ ] Создать feature branch `feature/storage-quota`
- [ ] Обновить модель User, создать миграцию
- [ ] Настроить environment variables

### Фаза 2: Backend разработка (3-4 дня)
- [ ] Реализовать методы в UserRepository
- [ ] Обновить GalleryRepository (create_photo, delete_photo)
- [ ] Добавить проверки квоты в photo upload endpoints
- [ ] Создать API эндпоинты для storage info
- [ ] Написать unit тесты

### Фаза 3: Frontend разработка (2-3 дня)
- [ ] Создать компонент StorageQuota
- [ ] Обновить API service
- [ ] Интегрировать в Profile page
- [ ] Обработка ошибки 507
- [ ] Написать frontend тесты

### Фаза 4: Интеграция и тестирование (2 дня)
- [ ] Integration тесты
- [ ] Тестирование на dev окружении
- [ ] Проверка performance (загрузка с проверкой квоты)
- [ ] Тестирование edge cases

### Фаза 5: Миграция production (1 день)
- [ ] Применить миграцию на production БД
- [ ] Запустить скрипт пересчета `storage_used` для существующих пользователей
- [ ] Мониторинг после деплоя
- [ ] Проверка корректности работы

### Фаза 6: Документация и коммуникация (1 день)
- [ ] Обновить API документацию
- [ ] Создать release notes
- [ ] Уведомить пользователей о новых лимитах (email/notification)
- [ ] Обновить FAQ

**Общая оценка: 10-13 дней**

---

## 12. Риски и митигации

| Риск                                                        | Вероятность | Влияние     | Митигация                                                                          |
| ----------------------------------------------------------- | ----------- | ----------- | ---------------------------------------------------------------------------------- |
| Расхождение между `storage_used` и реальным размером файлов | Средняя     | Высокое     | Реализовать функцию пересчета, запускать периодически (cron job)                   |
| Race condition при параллельных загрузках                   | Низкая      | Среднее     | Использовать database locks или optimistic locking                                 |
| Performance деградация при проверке квоты                   | Низкая      | Низкое      | Квота хранится в User таблице (indexed), запрос быстрый                            |
| Пользователи недовольны лимитами                            | Средняя     | Среднее     | Установить щедрую дефолтную квоту (5 GB), собрать feedback, возможность расширения |
| Неправильный подсчет размера thumbnails                     | Средняя     | Низкое      | Тщательное тестирование, unit тесты на разные размеры изображений                  |
| Миграция ломает production                                  | Низкая      | Критическое | Тестирование миграции на staging, backup БД перед миграцией                        |

---

## 13. Будущие улучшения (Future Enhancements)

### 13.1 Тарифные планы
- Модель SubscriptionPlan (Free, Pro, Business)
- Разные квоты для разных планов
- Интеграция с платежной системой (Stripe)

### 13.2 Уведомления
- Email при достижении 80%, 90%, 95% квоты
- Push notifications
- История уведомлений

### 13.3 Analytics
- Dashboard с визуализацией использования хранилища
- Детальная история загрузок/удалений
- Прогноз заполнения квоты

### 13.4 Оптимизация хранилища
- Автоматическая компрессия изображений
- Интеллектуальное создание thumbnails (разные размеры)
- Архивация старых фотографий в cold storage

### 13.5 Групповые квоты
- Shared storage для team accounts
- Распределение квоты между участниками команды

---

## 14. Определения и термины

- **Storage Quota** – максимально допустимый объем хранилища для пользователя (в байтах)
- **Storage Used** – текущий объем использованного хранилища (в байтах)
- **Storage Available** – доступный объем (quota - used)
- **Usage Percentage** – процент использования квоты ((used / quota) * 100)
- **Thumbnail** – уменьшенная версия изображения для быстрой загрузки
- **Recalculation** – пересчет использованного хранилища на основе реальных файлов в БД

---

## 15. Приложения

### Приложение A: SQL запрос для первичного пересчета

```sql
-- Обновить storage_used для всех пользователей на основе их фотографий
UPDATE users u
SET storage_used = (
    SELECT COALESCE(SUM(p.file_size), 0)
    FROM photos p
    INNER JOIN galleries g ON p.gallery_id = g.id
    WHERE g.owner_id = u.id
)
WHERE EXISTS (
    SELECT 1
    FROM galleries g
    WHERE g.owner_id = u.id
);

-- Проверка результатов
SELECT
    u.email,
    u.storage_used,
    u.storage_quota,
    ROUND((u.storage_used::numeric / u.storage_quota::numeric) * 100, 2) as usage_percent
FROM users u
ORDER BY usage_percent DESC
LIMIT 10;
```

### Приложение B: Пример конфигурации .env

```bash
# Storage Settings
DEFAULT_STORAGE_QUOTA=5368709120  # 5 GB in bytes
MAX_FILE_SIZE=15728640            # 15 MB in bytes

# For different plans (future)
# FREE_PLAN_QUOTA=5368709120       # 5 GB
# PRO_PLAN_QUOTA=53687091200       # 50 GB
# BUSINESS_PLAN_QUOTA=107374182400 # 100 GB
```

### Приложение C: Скрипт для массового пересчета

```python
# scripts/recalculate_all_storage.py
"""
Script to recalculate storage_used for all users
Run: python -m scripts.recalculate_all_storage
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from src.viewport.models.user import User
from src.viewport.repositories.user_repository import UserRepository
import os

def recalculate_all():
    database_url = os.getenv("DATABASE_URL")
    engine = create_engine(database_url)

    with Session(engine) as db:
        repo = UserRepository(db)

        # Get all users
        users = db.query(User).all()

        print(f"Recalculating storage for {len(users)} users...")

        for user in users:
            old_usage = user.storage_used
            new_usage = repo.recalculate_storage_used(user.id)

            if new_usage != old_usage:
                print(f"User {user.email}: {old_usage} -> {new_usage}")

        print("Done!")

if __name__ == "__main__":
    recalculate_all()
```

---

## 16. Контакты и ответственные

- **Product Owner:** [Имя]
- **Backend Lead:** [Имя]
- **Frontend Lead:** [Имя]
- **QA Lead:** [Имя]
- **DevOps:** [Имя]

---

## 17. История изменений документа

| Версия | Дата       | Автор        | Изменения        |
| ------ | ---------- | ------------ | ---------------- |
| 1.0    | 2025-10-03 | AI Assistant | Первая версия ТЗ |

---

## Подписи и утверждение

- [ ] Product Owner: _______________  Дата: _______
- [ ] Technical Lead: _______________  Дата: _______
- [ ] Security Review: _______________  Дата: _______
