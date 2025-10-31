# API Documentation

This folder contains detailed API reference documentation, authentication guides, and usage examples.

## Contents

### 📖 [API Reference](./reference.md)
Complete list of all API endpoints with request/response examples.

### 🔐 [Authentication](./authentication.md)
JWT token management, login flow, and securing endpoints.

### ⚠️ [Error Handling](./errors.md)
Error codes, error responses, and error handling strategies.

### 📋 [Request/Response Schemas](./schemas.md)
Pydantic schema documentation and data structures.

### 🔗 [Examples & Workflows](./examples.md)
Real-world API usage examples and common workflows.

### 🗃️ [Data Models](./models.md)
Database model documentation and relationships.

## Quick Overview

### Base URL
```
Development:  http://localhost:8000
Production:   https://api.yourdomain.com
```

### API Documentation (Interactive)
- Swagger UI: `{BASE_URL}/docs`
- ReDoc: `{BASE_URL}/redoc`

## Authentication

All protected endpoints require JWT token in `Authorization` header:

```
Authorization: Bearer <access_token>
```

See [Authentication Guide](./authentication.md) for detailed information.

## Response Format

### Success Response
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "created_at": "2025-07-26T12:00:00Z"
}
```

### Error Response
```json
{
  "detail": "Error message describing what went wrong"
}
```

## Pagination

List endpoints support pagination:

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `size` (optional, default: 10, max: 100) - Items per page

**Response:**
```json
{
  "items": [...],
  "total": 50,
  "page": 1,
  "size": 10
}
```

## Rate Limiting

- **Authentication endpoints:** 5 requests per minute per IP
- **General endpoints:** 100 requests per minute per user
- **File upload:** 20 requests per hour per user

## Versioning

Current API version: **v1**

No version prefix in URL (assuming v1). Future versions will use:
- `/api/v2/...`

## Endpoints Overview

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login and get tokens
- `POST /auth/refresh` - Refresh access token
- `GET /me` - Get current user

### Gallery Management
- `GET /galleries` - List user's galleries
- `POST /galleries` - Create new gallery
- `GET /galleries/{id}` - Get gallery details
- `DELETE /galleries/{id}` - Delete gallery

### Photo Management
- `POST /galleries/{id}/photos` - Upload photo
- `GET /galleries/{id}/photos` - List gallery photos
- `DELETE /galleries/{id}/photos/{photo_id}` - Delete photo

### Share Links
- `POST /galleries/{id}/share-links` - Create share link
- `GET /galleries/{id}/share-links` - List share links
- `DELETE /galleries/{id}/share-links/{link_id}` - Delete share link

### Public Access
- `GET /s/{share_id}` - View shared gallery
- `GET /s/{share_id}/photos/{photo_id}` - View photo
- `GET /s/{share_id}/download/all` - Download gallery as ZIP
- `GET /s/{share_id}/download/{photo_id}` - Download single photo

## HTTP Status Codes

| Code | Meaning                                   |
| ---- | ----------------------------------------- |
| 200  | OK - Request successful                   |
| 201  | Created - Resource created                |
| 204  | No Content - Successful, no response body |
| 400  | Bad Request - Invalid input               |
| 401  | Unauthorized - Missing/invalid auth       |
| 403  | Forbidden - Not authorized for resource   |
| 404  | Not Found - Resource doesn't exist        |
| 409  | Conflict - Resource already exists        |
| 413  | Payload Too Large - File too large        |
| 422  | Unprocessable Entity - Validation error   |
| 429  | Too Many Requests - Rate limited          |
| 500  | Internal Server Error                     |
| 503  | Service Unavailable                       |

## Content Types

### Request
- `application/json` - JSON data
- `multipart/form-data` - File uploads

### Response
- `application/json` - JSON data
- `image/jpeg`, `image/png` - Direct file download
- `application/zip` - ZIP file download

## CORS Policy

Allowed origins configured in backend:
- Development: `http://localhost:5173`
- Production: `https://yourdomain.com`

## Testing API

### Using cURL
```bash
# Get galleries
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:8000/galleries

# Create gallery
curl -X POST http://localhost:8000/galleries \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{}'
```

### Using Thunder Client / Postman
Import the [API collection](./postman-collection.json)

### Using Python Requests
```python
import requests

headers = {"Authorization": f"Bearer {access_token}"}
response = requests.get("http://localhost:8000/galleries", headers=headers)
galleries = response.json()
```

## Common Workflows

1. **Register and Login**
   → See [Examples & Workflows](./examples.md#register-and-login)

2. **Upload Photos**
   → See [Examples & Workflows](./examples.md#upload-photos)

3. **Share Gallery**
   → See [Examples & Workflows](./examples.md#create-and-share-gallery)

4. **Download Photos**
   → See [Examples & Workflows](./examples.md#download-photos)

## WebSocket APIs

Currently not implemented. Planned for real-time features:
- Live upload progress
- Real-time gallery updates
- Chat/notifications

## Webhook Events

Webhooks not yet implemented. Planned for:
- Gallery created
- Photo uploaded
- Link shared
- File downloaded

---

For complete endpoint documentation, see [API Reference](./reference.md).  
For authentication details, see [Authentication Guide](./authentication.md).  
For practical examples, see [Examples & Workflows](./examples.md).
