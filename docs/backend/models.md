# Database Models

## Overview

This document describes the SQLAlchemy ORM models that define the database schema for Viewport.

## Entity-Relationship Diagram

```
┌─────────────┐
│    User     │
├─────────────┤
│ id (PK)     │
│ email       │
│ password    │
│ display_name│
└──────┬──────┘
       │ owns (1-to-many)
       │
       ▼
┌──────────────────┐
│   Gallery        │
├──────────────────┤
│ id (PK)          │
│ owner_id (FK)    │
│ name             │
│ cover_photo_id   │
│ created_at       │
└────────┬─────────┘
         │ contains (1-to-many)
         ├─────────────────┬──────────────────┐
         │                 │                  │
         ▼                 ▼                  ▼
    ┌─────────────┐  ┌─────────────┐
    │   Photo     │  │ ShareLink   │
    ├─────────────┤  ├─────────────┤
    │ id (PK)     │  │ id (PK)     │
    │ gallery_id  │  │ gallery_id  │
    │ object_key  │  │ expires_at  │
    │ thumb_key   │  │ views       │
    │ file_size   │  │ downloads   │
    │ width/height│  │             │
    └─────────────┘  └─────────────┘
```

## Models

### User

Represents a photographer/user account.

```python
class User(Base):
    __tablename__ = "users"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    
    # Relationships
    galleries: Mapped[list["Gallery"]] = relationship(
        "Gallery",
        back_populates="owner",
        cascade="all, delete-orphan"
    )
```

**Fields:**
- `id` (UUID, Primary Key): Unique identifier
- `email` (String, Unique): Email address for login
- `password_hash` (String): Bcrypt hashed password
- `display_name` (String, Optional): User's display name
- `created_at` (DateTime): Account creation timestamp

**Relationships:**
- `galleries`: List of galleries owned by user (1-to-many)

**Constraints:**
- Email must be unique
- Email must be valid format (validated in Pydantic schema)

**Indexes:**
- `email` - for fast login lookups

---

### Gallery

Represents a collection of photos owned by a user.

```python
class Gallery(Base):
    __tablename__ = "galleries"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False, default="")
    cover_photo_id: Mapped[UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("photos.id", name="galleries_cover_photo_id_fkey", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="galleries")
    photos: Mapped[list["Photo"]] = relationship(
        "Photo",
        back_populates="gallery",
        cascade="all, delete-orphan"
    )
    share_links: Mapped[list["ShareLink"]] = relationship(
        "ShareLink",
        back_populates="gallery",
        cascade="all, delete-orphan"
    )
    cover_photo: Mapped["Photo | None"] = relationship(
        "Photo",
        primaryjoin="Gallery.cover_photo_id==Photo.id",
        foreign_keys="Gallery.cover_photo_id",
        uselist=False,
        viewonly=True,
    )
```

**Fields:**
- `id` (UUID, Primary Key): Unique identifier
- `owner_id` (UUID, Foreign Key): References User.id
- `name` (String): Custom name for the gallery
- `cover_photo_id` (UUID, Foreign Key, Optional): References Photo.id for cover image
- `created_at` (DateTime): Gallery creation timestamp
- `updated_at` (DateTime): Last update timestamp

**Relationships:**
- `owner`: User who owns this gallery (many-to-one)
- `photos`: Photos in this gallery (1-to-many)
- `share_links`: Share links for this gallery (1-to-many)
- `cover_photo`: Cover photo for display (many-to-one, viewonly)

**Cascade Behavior:**
- Delete user → Delete all their galleries and associated photos/links
- Delete gallery → Delete all its photos and share links

**Indexes:**
- `owner_id` - for fast user gallery lookups

---

### Photo

Represents an individual photo file.

```python
class Photo(Base):
    __tablename__ = "photos"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    gallery_id: Mapped[UUID] = mapped_column(
        ForeignKey("galleries.id", ondelete="CASCADE"),
        index=True
    )
    object_key: Mapped[str] = mapped_column(String, nullable=False)
    thumbnail_object_key: Mapped[str] = mapped_column(String, nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    
    # Relationships
    gallery: Mapped["Gallery"] = relationship("Gallery", back_populates="photos")
```

**Fields:**
- `id` (UUID, Primary Key): Unique identifier
- `gallery_id` (UUID, Foreign Key): References Gallery.id
- `object_key` (String): S3 object key for the original image (e.g., 'gallery_id/filename.jpg')
- `thumbnail_object_key` (String): S3 object key for the thumbnail (e.g., 'gallery_id/thumbnails/filename.jpg')
- `file_size` (Integer): File size in bytes
- `width` (Integer, Optional): Image width in pixels
- `height` (Integer, Optional): Image height in pixels
- `uploaded_at` (DateTime): Upload timestamp

**Relationships:**
- `gallery`: Parent gallery (many-to-one)

**Indexes:**
- `gallery_id` - for fast photo lookups by gallery

**Storage:**
- Original images stored in S3/MinIO with object_key
- Thumbnails stored in S3/MinIO with thumbnail_object_key
- Only metadata is stored in database

---

### ShareLink

Represents a shareable public link for a gallery.

```python
class ShareLink(Base):
    __tablename__ = "share_links"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    gallery_id: Mapped[UUID] = mapped_column(
        ForeignKey("galleries.id", ondelete="CASCADE"),
        index=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(nullable=True)
    views: Mapped[int] = mapped_column(default=0)
    zip_downloads: Mapped[int] = mapped_column(default=0)
    single_downloads: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    
    # Relationships
    gallery: Mapped["Gallery"] = relationship("Gallery", back_populates="share_links")
```

**Fields:**
- `id` (UUID, Primary Key): Used as the public share link identifier
- `gallery_id` (UUID, Foreign Key): References Gallery.id
- `expires_at` (DateTime, Optional): Link expiration date (NULL = never expires)
- `views` (Integer): Counter for gallery views
- `zip_downloads` (Integer): Counter for ZIP file downloads
- `single_downloads` (Integer): Counter for individual file downloads
- `created_at` (DateTime): Link creation timestamp

**Relationships:**
- `gallery`: Associated gallery (many-to-one)

**Indexes:**
- `gallery_id` - for finding links by gallery

**Behavior:**
- When `expires_at` is in the past, the link is considered expired
- Counters are incremented on each access
- UUID is used as the public identifier (not a separate slug)

---

## Relationships & Cascading

### Cascade Delete
When a parent entity is deleted, related children are also deleted:

- **User → Gallery**: Delete user → Delete all galleries
- **Gallery → Photo**: Delete gallery → Delete all photos
- **Gallery → ShareLink**: Delete gallery → Delete all share links

### Orphan Delete
If a Photo is removed from a Gallery (relationship cleared), it's automatically deleted.

## Model Mixins & Base Classes

All models inherit from `Base`:

```python
from sqlalchemy.orm import declarative_base

Base = declarative_base()
```

## Common Queries

### Find all galleries for a user
```python
galleries = db.query(Gallery).filter_by(owner_id=user_id).all()
```

### Find all photos in a gallery
```python
photos = db.query(Photo).filter_by(gallery_id=gallery_id).all()
```

### Find active share links
```python
import datetime
active_links = db.query(ShareLink).filter(
    (ShareLink.expires_at == None) | 
    (ShareLink.expires_at > datetime.datetime.utcnow())
).all()
```

### Get photos by share link
```python
share_link = db.query(ShareLink).filter_by(id=share_id).first()
if share_link:
    photos = db.query(Photo).filter_by(gallery_id=share_link.gallery_id).all()
```

### Count downloads
```python
share_link = db.query(ShareLink).filter_by(id=share_id).first()
total_downloads = share_link.zip_downloads + share_link.single_downloads
```

## Database Constraints

### Unique Constraints
- User.email - Only one account per email

### Foreign Key Constraints
- Gallery.owner_id → User.id (ON DELETE CASCADE)
- Photo.gallery_id → Gallery.id (ON DELETE CASCADE)
- ShareLink.gallery_id → Gallery.id (ON DELETE CASCADE)

### Not Null Constraints
- All `id` fields (primary keys)
- All `_id` foreign keys
- User.email, User.password_hash
- Gallery.owner_id, Gallery.name, Gallery.created_at
- Photo.gallery_id, Photo.object_key, Photo.thumbnail_object_key, Photo.file_size
- ShareLink.gallery_id

### Default Values
- All `id` fields default to `uuid.uuid4()`
- All `created_at` fields default to `datetime.datetime.utcnow()`
- ShareLink counters default to `0`

## Indexing Strategy

**Indexed Columns:**
- `users.email` - Login queries
- `galleries.owner_id` - User's galleries
- `photos.gallery_id` - Gallery's photos
- `share_links.gallery_id` - Gallery's links

**Not Indexed (but could be):**
- `share_links.id` - Already primary key
- `share_links.expires_at` - If querying expired links frequently

## Migrations

Database schema changes use Alembic migrations. See [Migrations Guide](../development/migrations.md) for details.

### Current Schema Version
- Check `alembic_version` table in database
- Latest version available in `src/viewport/alembic/versions/`

## Performance Considerations

### N+1 Query Prevention
Use `joinedload()` to prevent N+1 queries:

```python
galleries = db.query(Gallery)\
    .options(joinedload(Gallery.owner))\
    .filter_by(owner_id=user_id)\
    .all()
```

### Pagination
Always paginate large result sets:

```python
page = 1
size = 20
offset = (page - 1) * size
galleries = db.query(Gallery)\
    .filter_by(owner_id=user_id)\
    .offset(offset)\
    .limit(size)\
    .all()
```

### Counter Updates
Counters on ShareLink use atomic operations to prevent race conditions:

```python
db.query(ShareLink).filter_by(id=share_id).update({
    ShareLink.views: ShareLink.views + 1
})
db.commit()
```

---

For migration instructions, see [Migrations Guide](../development/migrations.md).  
For API schema definitions, see [API Reference](../api/reference.md).
