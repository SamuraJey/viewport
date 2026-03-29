# 📸 Viewport - Photo Portfolio Sharing Platform

A modern, full-stack photo portfolio sharing platform that enables photographers to upload, organize, and share their work through secure, expiring share links.

## 🎯 Project Overview

**Viewport** is a web application designed for photographers to:
- 📤 Upload and organize photos into galleries
- 🔗 Generate shareable links with customizable expiration dates
- 👥 Share galleries publicly without requiring authentication
- ⬇️ Allow guests to download individual photos or entire galleries as ZIP files
- 📊 Track views and downloads with built-in metrics

## 🛠️ Tech Stack

### Backend
- **Runtime:** Python 3.13+
- **Framework:** FastAPI (async, high-performance)
- **Database:** PostgreSQL with SQLAlchemy ORM
- **Migrations:** Alembic
- **Storage:** S3-compatible (AWS S3 / rustfs)
- **Queue:** Celery with Redis
- **Authentication:** JWT (Python-JWT)
- **API Documentation:** OpenAPI/Swagger

### Frontend
- **Framework:** React 19+ with TypeScript
- **Build Tool:** Vite
- **Routing:** React Router v7
- **State Management:** Zustand
- **Styling:** Tailwind CSS v4
- **HTTP Client:** Axios
- **Testing:** Vitest + React Testing Library

### Infrastructure
- **Containerization:** Docker & Docker Compose
- **Reverse Proxy:** Nginx
- **Cache:** Redis
- **Monitoring:** Prometheus (optional)

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose (recommended)
- Or: Python 3.13+, Node.js 18+, PostgreSQL, Redis, rustfs

### Option 1: Docker (Recommended)
```bash
git clone https://github.com/SamuraJey/viewport.git
cd viewport
docker-compose up -d
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Option 2: Local Setup

**Backend:**
```bash
cd /viewport
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -e .
uvicorn viewport.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

See [Development Setup Guide](./docs/development/local-setup.md) for detailed instructions.

## 📚 Documentation

Complete documentation is organized into the following sections:

### 📖 [Getting Started](./docs/README.md)
- [Local Development Setup](./docs/development/local-setup.md)
- [Contributing Guide](./docs/development/contributing.md)
- [Architecture Overview](./docs/ARCHITECTURE.md)

### 🔌 [API Documentation](./docs/api/README.md)
- [API Reference](./docs/api/reference.md) - Complete endpoint documentation
- [Authentication](./docs/api/authentication.md)
- [Error Handling](./docs/api/errors.md)
- [Examples & Workflows](./docs/api/examples.md)

### 🎨 [Frontend Guide](./docs/frontend/README.md)
- [Component Architecture](./docs/frontend/components.md)
- [State Management](./docs/frontend/state-management.md)
- [Styling & Theming](./docs/frontend/styling.md)
- [Testing](./docs/frontend/testing.md)

### ⚙️ [Backend Guide](./docs/backend/README.md)
- [Project Structure](./docs/backend/structure.md)
- [Database Models](./docs/backend/models.md)
- [Authentication & Authorization](./docs/backend/auth.md)
- [File Handling & S3](./docs/backend/storage.md)
- [Testing](./docs/backend/testing.md)

### 🐳 [Deployment](./docs/deployment/README.md)
- [Docker Setup](./docs/deployment/docker.md)
- [Database Configuration](./docs/deployment/database.md)
- [S3/rustfs Setup](./docs/deployment/s3-setup.md)
- [Production Checklist](./docs/deployment/production.md)
- [Environment Variables](./docs/deployment/environments.md)

### 🔧 [Development](./docs/development/README.md)
- [Development Workflow](./docs/development/workflow.md)
- [Testing Guide](./docs/development/testing.md)
- [Troubleshooting](./docs/development/troubleshooting.md)
- [Database Migrations](./docs/development/migrations.md)

## 📋 Project Structure

```
viewport/
├── docs/                           # Complete project documentation
│   ├── api/                        # API reference and examples
│   ├── backend/                    # Backend architecture & guides
│   ├── frontend/                   # Frontend architecture & guides
│   ├── deployment/                 # Deployment & infrastructure
│   ├── development/                # Development guides
│   └── ARCHITECTURE.md             # Overall system architecture
│
├── src/viewport/                   # Backend source code
│   ├── api/                        # FastAPI route handlers
│   │   ├── auth.py                 # Authentication endpoints
│   │   ├── gallery.py              # Gallery management
│   │   ├── photo.py                # Photo upload & management
│   │   ├── sharelink.py            # Share link generation
│   │   └── public.py               # Public gallery access
│   ├── models/                     # SQLAlchemy ORM models
│   ├── schemas/                    # Pydantic request/response schemas
│   ├── repositories/               # Data access layer
│   ├── alembic/                    # Database migrations
│   ├── main.py                     # FastAPI application entry point
│   ├── auth_utils.py               # JWT & password utilities
│   ├── db.py                       # Database configuration
│   ├── rustfs_utils.py              # S3/rustfs utilities
│   ├── cache_utils.py              # Redis caching utilities
│   ├── metrics.py                  # Prometheus metrics
│   └── logger.py                   # Logging configuration
│
├── frontend/                       # Frontend React application
│   ├── src/
│   │   ├── components/             # Reusable React components
│   │   ├── pages/                  # Page components
│   │   ├── hooks/                  # Custom React hooks
│   │   ├── stores/                 # Zustand state stores
│   │   ├── services/               # API client services
│   │   ├── styles/                 # Global styles
│   │   ├── types/                  # TypeScript type definitions
│   │   ├── utils/                  # Utility functions
│   │   ├── App.tsx                 # Main App component
│   │   └── main.tsx                # Application entry point
│   ├── public/                     # Static assets
│   ├── package.json                # Frontend dependencies
│   ├── tsconfig.json               # TypeScript configuration
│   ├── vite.config.ts              # Vite build configuration
│   ├── tailwind.config.js          # Tailwind CSS configuration
│   └── vitest.config.ts            # Vitest testing configuration
│
├── tests/                          # Backend test suite
│   ├── unit/                       # Unit tests
│   ├── integration/                # Integration tests
│   ├── fixtures/                   # Test fixtures & mocks
│   └── conftest.py                 # Pytest configuration
│
├── config/                         # Configuration files
├── scripts/                        # Utility scripts
├── alembic.ini                     # Alembic configuration
├── docker-compose.yml              # Docker Compose services
├── Dockerfile.backend              # Backend Docker image
├── Dockerfile.frontend             # Frontend Docker image
├── Makefile                        # Development commands
└── pyproject.toml                  # Python project configuration
```

## 🎨 Key Features

### For Photographers
- ✅ Secure user authentication with JWT
- ✅ Organize photos into galleries
- ✅ Generate unique share links with optional expiration
- ✅ View analytics (views, downloads)
- ✅ Bulk and individual file downloads

### For Guests
- ✅ View galleries without authentication
- ✅ Responsive gallery grid (desktop/tablet/mobile)
- ✅ Lightbox image viewer
- ✅ Download individual photos or entire galleries
- ✅ Auto-expiring links for time-limited access

### For Developers
- ✅ Well-documented RESTful API
- ✅ Comprehensive test coverage
- ✅ Docker containerization for easy deployment
- ✅ Database migrations with Alembic
- ✅ Type-safe code with TypeScript/Pydantic

## 📊 Database Schema

The application uses PostgreSQL with the following main entities:

```
Users
  ├── Galleries (one-to-many)
  │   ├── Photos (one-to-many)
  │   └── ShareLinks (one-to-many)
  └── Auth tokens (one-to-many)
```

See [Database Models Documentation](./docs/backend/models.md) for detailed schema.

## 🧪 Testing

### Backend Tests
```bash
pytest                              # Run all tests
pytest -v                           # Verbose output
pytest --cov=src/viewport          # With coverage report
pytest -k "test_upload"             # Run specific tests
```

### Frontend Tests
```bash
npm test                            # Run tests in watch mode
npm run test:run                    # Run tests once
npm run test:coverage               # Generate coverage report
npm run test:ui                     # Open interactive UI
```

See [Testing Guide](./docs/development/testing.md) for details.

## 🚀 Deployment

### Quick Deployment
```bash
docker-compose -f docker-compose.yml up -d
```

### Production Deployment
See [Production Deployment Guide](./docs/deployment/production.md) for:
- Environment configuration
- SSL/TLS setup
- Database backups
- Monitoring & logging
- Performance optimization

## 🔒 Security

- ✅ JWT-based authentication with refresh tokens
- ✅ Password hashing with bcrypt
- ✅ File type validation (magic byte checking)
- ✅ CORS configuration
- ✅ Rate limiting (via Nginx)
- ✅ HTTPS/TLS support

See [Security Considerations](./docs/deployment/security.md) for details.

## 🤝 Contributing

We welcome contributions! Please see [Contributing Guide](./docs/development/contributing.md) for:
- Development workflow
- Code standards
- Testing requirements
- Pull request process

## 📝 License

[Add your license here]

## 💬 Support & Contact

- 📧 Email: [contact info]
- 🐛 Issues: [GitHub Issues Link]
- 💡 Discussions: [GitHub Discussions Link]

## 📚 Additional Resources

- [Product Requirements Document - Backend](./product_requirements_document_backend.md)
- [Product Requirements Document - Frontend](./product_requirements_document_frontend.md)
- [Backend Overview](./backend_overview.md)
- [Development Tasks](./tasks_backend.md)

---

**Last Updated:** November 2025
**Current Version:** 0.1.0
**Status:** Active Development
