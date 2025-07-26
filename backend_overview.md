# Backend API & Project Structure Overview

This document provides a comprehensive overview of the backend API|| POST   | /galleries/{gallery_id}/photos    | Upload photo (≤ 15 MB) | Bearer JWT |
| POST   | /galleries/{gallery_id}/share-links | Generate share link  | Bearer JWT |OST   | /galleries/{gallery_id}/photo## Authentication & Authorization
- Register and login to receive JWT tokens.
- Pass the `access_token` in the `Authorization` header for protected endpoints.
- Access tokens expire in 30 minutes, refresh tokens expire in 7 days.
- Some endpoints (public gallery/photo/download) do not require authentication.
- Gallery and photo operations are restricted to the owner of the gallery.

---

## File Uploads & Downloads
- Upload photos via `POST /galleries/{gallery_id}/photos` (multipart/form-data, ≤ 15 MB, only JPG/JPEG/PNG).
- File validation includes both extension and magic byte checks.
- Files are stored in S3-compatible storage (MinIO for development).
- Download single photos or all as ZIP via public endpoints.
- ZIP files are generated on-the-fly and streamed to the client.

---

## Share Links & Expiration
- Share links can have optional expiration dates.
- Expired links return 404 errors.
- All access to share links is tracked (views, downloads).
- Share link UUIDs are used as public identifiers.oad photo (≤ 15 MB) | Bearer JWT |
| POST   | /galleries/{gallery_id}/share-links | Generate share link  | Bearer JWT |nd project structure for the photo portfolio site. It is intended for frontend developers to understand how to interact with the backend, use API endpoints, and navigate the codebase.

---

## Project Structure

```
project-root/
├── src/
│   └── viewport/        # Main backend application code
│       ├── api/         # FastAPI route handlers (auth, gallery, photo, public, sharelink)
│       ├── models/      # SQLAlchemy models (User, Gallery, Photo, ShareLink)
│       ├── schemas/     # Pydantic schemas for request/response validation
│       ├── alembic/     # Database migrations
│       ├── auth_utils.py, db.py, logger.py, metrics.py, minio_utils.py  # Utility modules
│       ├── main.py      # FastAPI application entry point
│       └── ...
├── tests/               # Pytest-based tests for API endpoints and logic
├── config/              # Configuration files
├── product_requirements_document.md  # Product requirements and API reference
├── tasks_1.md           # Development tasks/roadmap
├── Dockerfile, docker-compose.yml  # Deployment configuration
└── ...
```

---

## Authentication API

### Register
- **POST** `/auth/register`
- **Description:** Register a new photographer account.
- **Auth:** No
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "yourpassword"
  }
  ```
- **Response (201):**
  ```json
  {
    "id": "uuid",
    "email": "user@example.com"
  }
  ```
- **Error (400):**
  ```json
  { "detail": "Email already registered" }
  ```

### Login
- **POST** `/auth/login`
- **Description:** Log in and receive JWT tokens.
- **Auth:** No
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "yourpassword"
  }
  ```
- **Response (200):**
  ```json
  {
    "id": "uuid",
    "email": "user@example.com",
    "tokens": {
      "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
      "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
      "token_type": "bearer"
    }
  }
  ```
- **Error (401):**
  ```json
  { "detail": "Invalid email or password" }
  ```

### Get Current User
- **GET** `/me`
- **Description:** Get info about the authenticated user.
- **Auth:** Bearer JWT required
- **Headers:**
  - `Authorization: Bearer <access_token>`
- **Response (200):**
  ```json
  {
    "id": "uuid",
    "email": "user@example.com"
  }
  ```
- **Error (401/403):**
  ```json
  { "detail": "Not authenticated" }
  ```

---

## Main API Endpoints

| Method | Path                              | Description            | Auth       |
| ------ | --------------------------------- | ---------------------- | ---------- |
| POST   | /auth/register                    | Register user          | —          |
| POST   | /auth/login                       | Login, get JWT         | —          |
| GET    | /me                               | Get current user info  | Bearer JWT |
| GET    | /galleries                        | List user galleries    | Bearer JWT |
| POST   | /galleries                        | Create gallery         | Bearer JWT |
| POST   | /galleries/{id}/photos            | Upload photo (≤ 15 MB) | Bearer JWT |
| POST   | /galleries/{id}/share-links       | Generate share link    | Bearer JWT |
| GET    | /s/{share_id}                     | Get gallery thumbnails | Public     |
| GET    | /s/{share_id}/photos/{photo_id}   | Get original photo     | Public     |
| GET    | /s/{share_id}/download/all        | Download all as ZIP    | Public     |
| GET    | /s/{share_id}/download/{photo_id} | Download single photo  | Public     |

---

## Detailed API Endpoints

### Gallery Management

#### List Galleries
- **GET** `/galleries`
- **Description:** Get paginated list of user's galleries.
- **Auth:** Bearer JWT required
- **Query Parameters:**
  - `page`: Page number (default: 1, min: 1)
  - `size`: Items per page (default: 10, min: 1, max: 100)
- **Response (200):**
  ```json
  {
    "galleries": [
      {
        "id": "uuid",
        "owner_id": "uuid", 
        "created_at": "2025-07-26T12:00:00Z"
      }
    ],
    "total": 5,
    "page": 1,
    "size": 10
  }
  ```

#### Create Gallery
- **POST** `/galleries`
- **Description:** Create a new gallery for the authenticated user.
- **Auth:** Bearer JWT required
- **Request Body:** `{}` (empty object)
- **Response (201):**
  ```json
  {
    "id": "uuid",
    "owner_id": "uuid",
    "created_at": "2025-07-26T12:00:00Z"
  }
  ```

### Photo Management

#### Upload Photo
- **POST** `/galleries/{gallery_id}/photos`
- **Description:** Upload a photo to a specific gallery.
- **Auth:** Bearer JWT required
- **Content-Type:** `multipart/form-data`
- **Body:** File upload (max 15MB, JPG/JPEG/PNG only)
- **Response (201):**
  ```json
  {
    "id": "uuid",
    "gallery_id": "uuid",
    "url_s3": "https://s3.../bucket/filename.jpg",
    "file_size": 1024576,
    "uploaded_at": "2025-07-26T12:00:00Z"
  }
  ```
- **Errors:**
  - **404:** Gallery not found or not owned by user
  - **413:** File too large (>15MB)

### Share Link Management

#### Create Share Link
- **POST** `/galleries/{gallery_id}/share-links`
- **Description:** Generate a shareable link for a gallery.
- **Auth:** Bearer JWT required
- **Request Body:**
  ```json
  {
    "expires_at": "2025-08-26T12:00:00Z"  // optional
  }
  ```
- **Response (201):**
  ```json
  {
    "id": "uuid",
    "gallery_id": "uuid",
    "expires_at": "2025-08-26T12:00:00Z",
    "views": 0,
    "zip_downloads": 0,
    "single_downloads": 0,
    "created_at": "2025-07-26T12:00:00Z"
  }
  ```

### Public Gallery Access

#### View Gallery
- **GET** `/s/{share_id}`
- **Description:** Get list of photos in a shared gallery with thumbnails.
- **Auth:** Public (no authentication required)
- **Response (200):**
  ```json
  {
    "photos": [
      {
        "photo_id": "uuid",
        "thumbnail_url": "https://s3.../bucket/photo.jpg",
        "full_url": "https://s3.../bucket/photo.jpg"
      }
    ]
  }
  ```
- **Side Effect:** Increments view counter

#### View Single Photo
- **GET** `/s/{share_id}/photos/{photo_id}`
- **Description:** Redirect to full-size photo URL.
- **Auth:** Public
- **Response:** `302 Redirect` to S3 URL

#### Download All Photos
- **GET** `/s/{share_id}/download/all`
- **Description:** Download all photos in gallery as ZIP file.
- **Auth:** Public
- **Response:** ZIP file stream
- **Side Effect:** Increments zip_downloads counter

#### Download Single Photo
- **GET** `/s/{share_id}/download/{photo_id}`
- **Description:** Download a specific photo.
- **Auth:** Public
- **Response:** File stream
- **Side Effect:** Increments single_downloads counter

---

## Endpoint Documentation Template

For each endpoint, use the following format:

### Endpoint
`<HTTP_METHOD> /path/to/endpoint`

#### Description
Short description of what this endpoint does.

#### Authentication
- Required: Yes/No (Bearer JWT/Public)

#### Request
- **Headers:**  
  - `Authorization: Bearer <token>` (if required)
- **Body:**  
  - JSON or multipart/form-data example

#### Response
- **Success (Status code):**
  - JSON example
- **Error (Status code):**
  - JSON example

#### Example
```http
POST /galleries
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
Content-Type: application/json

{}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "owner_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "created_at": "2025-07-26T12:00:00Z"
}
```

---

## Models Overview

- **User:** id (UUID), email, password_hash, created_at
- **Gallery:** id (UUID), owner_id (FK to User), created_at
- **Photo:** id (UUID), gallery_id (FK to Gallery), url_s3, file_size, uploaded_at
- **ShareLink:** id (UUID), gallery_id (FK to Gallery), expires_at (nullable), views, zip_downloads, single_downloads, created_at

### Model Relationships
- User has many Galleries (one-to-many)
- Gallery has many Photos (one-to-many, cascade delete)
- Gallery has many ShareLinks (one-to-many, cascade delete)

---

## Error Handling
- All errors are returned as JSON with a `detail` field.
- Common status codes: 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found).

---

## Authentication & Authorization
- Register and login to receive JWT tokens.
- Pass the `access_token` in the `Authorization` header for protected endpoints.
- Some endpoints (public gallery/photo/download) do not require authentication.

---

## File Uploads & Downloads
- Upload photos via `POST /galleries/{gallery_id}/photos` (multipart/form-data, ≤ 15 MB, only JPG/JPEG/PNG).
- Download single photos or all as ZIP via public endpoints.

---

## Additional Notes
- See `product_requirements_document.md` for full requirements and user stories.
- See `tests/` for example requests and expected behaviors.
- For questions about specific endpoints, refer to the API template above and the relevant handler in `src/app/api/`.

---

*Last updated: 2025-07-26*
