# Backend Documentation

This folder contains comprehensive documentation for the Viewport backend application built with FastAPI and Python 3.13.

## Contents

### 📋 [Project Structure](./structure.md)
Overview of the backend source code organization, module responsibilities, and design patterns.

### 🗄️ [Database Models](./models.md)
SQLAlchemy ORM models, relationships, and database schema documentation.

### 🔐 [Authentication & Authorization](./auth.md)
JWT token management, password hashing, user authentication flow, and authorization patterns.

### 💾 [Storage & File Handling](./storage.md)
S3 integration, file upload validation, image processing, and download generation.

### 📦 [Storage Quotas](./quotas.md)
Quota counters (`storage_quota`, `storage_used`, `storage_reserved`), upload accounting lifecycle, and cleanup/background consistency flows.

### ⚙️ [Configuration](./configuration.md)
Environment variables, settings management, and environment-specific configurations.

### 🔄 [Background Tasks](./celery.md)
Celery task queue setup, task definitions, and asynchronous job processing.

### 🧪 [Testing](./testing.md)
Unit tests, integration tests, fixtures, and test coverage guidelines.

### 📊 [Metrics & Monitoring](./monitoring.md)
Prometheus metrics, logging configuration, and application observability.

### 🐛 [Troubleshooting](./troubleshooting.md)
Common issues and solutions for backend development and deployment.

## Quick Navigation

- **Getting Started?** → See [Local Setup Guide](../development/local-setup.md)
- **Building APIs?** → See [API Reference](../api/reference.md)
- **Need Database Migrations?** → See [Migrations Guide](../development/migrations.md)
- **Deploying?** → See [Deployment Guide](../deployment/docker.md)

## Tech Stack

- **Framework:** FastAPI 0.116+
- **Runtime:** Python 3.13
- **Database:** PostgreSQL with SQLAlchemy
- **ORM:** SQLAlchemy 2.0+
- **Authentication:** PyJWT
- **Password Hashing:** Bcrypt
- **Storage:** Boto3 (S3)
- **Task Queue:** Celery with Redis
- **Image Processing:** Pillow
- **API Monitoring:** Prometheus FastAPI Instrumentator

## Key Concepts

### Request/Response Validation
All API endpoints use Pydantic schemas for automatic request validation and response serialization.

### Database Access
Repository pattern is used for data access, providing a clean abstraction over SQLAlchemy.

### Async Operations
FastAPI's async support is leveraged for I/O-bound operations like database queries and S3 requests.

### Error Handling
Consistent error responses with proper HTTP status codes and detailed error messages.

### Security
JWT-based authentication, CORS configuration, and input validation on all endpoints.

## Development Workflow

1. **Make changes** to backend code
2. **Run tests** to ensure functionality
3. **Database changes?** Create Alembic migration
4. **Start dev server** with `uvicorn --reload`
5. **Test endpoints** via `/docs` Swagger UI

## Important Files

- `main.py` - Application entry point and FastAPI setup
- `db.py` - Database connection and session management
- `auth_utils.py` - JWT and password utilities
- `s3_utils.py` - S3 file operations
- `celery_app.py` - Celery task queue configuration
- `cache_utils.py` - Redis caching utilities
- `metrics.py` - Prometheus metrics setup
- `logger.py` - Application logging configuration

---

For questions or issues, refer to the specific documentation files or check [Troubleshooting](./troubleshooting.md).
