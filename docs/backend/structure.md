# Backend Project Structure

## Overview

The backend follows a modular, layered architecture with clear separation of concerns. All code is located in `src/viewport/`.

## Directory Structure

```
src/viewport/
├── __init__.py                  # Package initialization
├── main.py                      # FastAPI application entry point
├── db.py                        # Database configuration and session management
├── logger.py                    # Logging configuration
├── logging_config.py            # Advanced logging setup
├── metrics.py                   # Prometheus metrics
├── auth_utils.py                # JWT and password utilities
├── cache_utils.py               # Redis caching utilities
├── minio_utils.py               # S3/MinIO file operations
├── s3_service.py                # S3 service abstraction
├── background_tasks.py          # Background task definitions
├── celery_app.py                # Celery configuration
├── dependencies.py              # FastAPI dependency injection
│
├── api/                         # API route handlers (blueprints)
│   ├── __init__.py
│   ├── auth.py                  # Authentication endpoints
│   ├── gallery.py               # Gallery management endpoints
│   ├── photo.py                 # Photo upload & management endpoints
│   ├── sharelink.py             # Share link generation endpoints
│   └── public.py                # Public gallery access endpoints
│
├── models/                      # SQLAlchemy ORM models
│   ├── __init__.py
│   ├── user.py                  # User model
│   ├── gallery.py               # Gallery and Photo models
│   └── sharelink.py             # ShareLink model
│
├── schemas/                     # Pydantic request/response schemas
│   ├── __init__.py
│   ├── auth.py                  # Auth schemas (RegisterRequest, LoginResponse, etc.)
│   ├── gallery.py               # Gallery schemas
│   ├── photo.py                 # Photo schemas
│   └── sharelink.py             # ShareLink schemas
│
├── repositories/                # Data access layer (Repository pattern)
│   ├── __init__.py
│   ├── base_repository.py       # Base repository with CRUD operations
│   ├── user_repository.py       # User-specific data access
│   ├── gallery_repository.py    # Gallery and photo data access
│   └── sharelink_repository.py  # ShareLink-specific data access
│
└── alembic/                     # Database migrations
    ├── env.py
    ├── script.py_mako
    ├── versions/                # Migration files
    │   ├── 001_initial_schema.py
    │   └── ...
    └── alembic.ini
```

## Layer Architecture

### 1. **API Layer** (`api/`)
Route handlers that define HTTP endpoints.

**Responsibilities:**
- Accept HTTP requests
- Validate query parameters and headers
- Call service/repository layer
- Return HTTP responses
- Handle errors and exceptions

**Example:**
```python
# api/gallery.py
@router.get("/galleries")
async def list_galleries(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    gallery_repo = GalleryRepository(db)
    galleries = gallery_repo.get_by_owner(current_user.id)
    return galleries
```

### 2. **Schema Layer** (`schemas/`)
Pydantic models for request/response validation.

**Responsibilities:**
- Define request body schemas
- Define response schemas
- Validate input data
- Serialize output data

**Example:**
```python
# schemas/gallery.py
class GalleryCreate(BaseModel):
    pass  # Empty for initial version

class GalleryResponse(BaseModel):
    id: UUID
    owner_id: UUID
    created_at: datetime
```

### 3. **Repository Layer** (`repositories/`)
Data access abstraction using Repository pattern.

**Responsibilities:**
- Query operations (fetch, filter, paginate)
- Create/update/delete operations
- Database-specific logic
- Abstract ORM details from higher layers

**Example:**
```python
# repositories/gallery_repository.py
class GalleryRepository(BaseRepository):
    def get_by_owner(self, owner_id: UUID) -> list[Gallery]:
        return self.session.query(Gallery).filter_by(owner_id=owner_id).all()
```

### 4. **Model Layer** (`models/`)
SQLAlchemy ORM models representing database tables.

**Responsibilities:**
- Define database schema
- Define relationships between entities
- Add business logic if needed

**Example:**
```python
# models/gallery.py
class Gallery(Base):
    __tablename__ = "galleries"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    
    owner: Mapped[User] = relationship("User", back_populates="galleries")
    photos: Mapped[list[Photo]] = relationship("Photo", back_populates="gallery", cascade="all, delete-orphan")
```

### 5. **Utility Layer**
Helper modules for common operations.

| Module            | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `auth_utils.py`   | JWT token creation/verification, password hashing              |
| `db.py`           | Database session management, connection pooling                |
| `minio_utils.py`  | S3/MinIO client initialization, file operations                |
| `cache_utils.py`  | Redis client initialization, cache operations                  |
| `logger.py`       | Application logging setup                                      |
| `metrics.py`      | Prometheus metrics registration                                |
| `dependencies.py` | FastAPI dependency injections (get_db, get_current_user, etc.) |

## Key Design Patterns

### Dependency Injection
FastAPI's `Depends()` is used for injecting dependencies:
```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/galleries")
async def list_galleries(db: Session = Depends(get_db)):
    # db is automatically injected
    pass
```

### Repository Pattern
Data access is abstracted through repository classes:
```python
# Using repository
repo = GalleryRepository(db)
gallery = repo.get_by_id(gallery_id)

# Not directly accessing ORM
# gallery = db.query(Gallery).get(gallery_id)
```

### Async/Await
Async functions for I/O-bound operations:
```python
@router.post("/galleries/{gallery_id}/photos")
async def upload_photo(
    gallery_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # Save to S3 asynchronously
    await save_file_to_s3(file)
```

### Error Handling
Consistent error responses:
```python
from fastapi import HTTPException

if not gallery:
    raise HTTPException(status_code=404, detail="Gallery not found")
```

## Module Responsibilities

### `main.py`
- FastAPI application initialization
- Router registration
- Middleware setup (CORS, logging, etc.)
- Startup/shutdown events
- API documentation setup

### `db.py`
- SQLAlchemy engine creation
- Session factory initialization
- Connection pooling configuration
- Database URL from environment

### `auth_utils.py`
- JWT token generation and validation
- Password hashing with bcrypt
- Token expiration handling
- Current user extraction from token

### `models/*`
- SQLAlchemy declarative base models
- Table definitions with columns
- Relationships between models
- Model constraints and indexes

### `schemas/*`
- Pydantic models for validation
- Request body validation
- Response serialization
- Field validators

### `repositories/*`
- CRUD operations on models
- Query filtering and pagination
- Data transformation if needed

### `api/*`
- HTTP endpoint definitions
- Request/response handling
- Authentication/authorization checks
- Error handling

## Data Flow

### Example: Uploading a Photo

```
1. Client sends POST /galleries/{id}/photos with file
   ↓
2. api/photo.py::upload_photo() receives request
   ↓
3. Validates file (size, type, magic bytes)
   ↓
4. Saves file to S3 via s3_service.py
   ↓
5. Creates Photo record via repositories/gallery_repository.py
   ↓
6. Returns Photo response schema
   ↓
7. Client receives file URL and metadata
```

## Coding Standards

### Imports Organization
```python
# 1. Standard library
import json
from datetime import datetime
from uuid import UUID

# 2. Third-party imports
from fastapi import FastAPI
from sqlalchemy import Column, String

# 3. Local imports
from .models import User
from .repositories import UserRepository
```

### Type Hints
Always use type hints:
```python
def get_gallery(gallery_id: UUID, db: Session) -> Gallery | None:
    return db.query(Gallery).filter_by(id=gallery_id).first()
```

### Docstrings
Use docstrings for public functions/classes:
```python
def get_gallery(gallery_id: UUID) -> Gallery:
    """
    Retrieve a gallery by its UUID.
    
    Args:
        gallery_id: The UUID of the gallery to retrieve
        
    Returns:
        Gallery object or raises HTTPException(404)
    """
```

## Dependencies

### Core Dependencies
- **FastAPI**: Web framework
- **SQLAlchemy**: ORM
- **Pydantic**: Data validation
- **PyJWT**: JWT tokens

### File Handling
- **Boto3**: S3 client
- **Pillow**: Image processing
- **python-multipart**: Multipart form data

### Database
- **Alembic**: Migrations
- **psycopg**: PostgreSQL driver

### Async/Queue
- **Celery**: Task queue
- **Redis**: Message broker & cache
- **aioboto3**: Async S3 client

### Monitoring
- **prometheus-fastapi-instrumentator**: Metrics collection

---

For questions about specific components, see the dedicated documentation files in this directory.
