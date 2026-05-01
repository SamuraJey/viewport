# Viewport Documentation Index

Welcome to the comprehensive documentation for the Viewport photo portfolio sharing platform. This guide will help you understand the project structure, set up your development environment, and contribute to the codebase.

## 📍 Getting Started

### New to Viewport?
1. **[Project Overview](../README.md)** - High-level project description and features
2. **[Architecture Overview](./ARCHITECTURE.md)** - System architecture and design
3. **[Local Setup Guide](./development/local-setup.md)** - Set up development environment

### Want to contribute?
1. **[Contributing Guide](./development/contributing.md)** - Code standards and PR process
2. **[Development Guide](./development/README.md)** - Development workflows and tools
3. **[Code Standards](./development/code-standards.md)** - Coding conventions

### Deploying Viewport?
1. **[Deployment Guide](./deployment/README.md)** - Deployment overview
2. **[Docker Setup](./deployment/docker.md)** - Container configuration
3. **[Production Checklist](./deployment/production.md)** - Production deployment

## 📚 Documentation Structure

### 🎯 [API Documentation](./api/README.md)
Complete API reference for frontend and third-party integrations.

- [API Reference](./api/reference.md) - All endpoints with examples
- [Authentication](./api/authentication.md) - JWT and login flow
- [Error Handling](./api/errors.md) - Error codes and handling
- [Examples](./api/examples.md) - Real-world usage examples

### ⚙️ [Backend Documentation](./backend/README.md)
Backend architecture, models, and implementation details.

- [Project Structure](./backend/structure.md) - Backend code organization
- [Database Models](./backend/models.md) - SQLAlchemy ORM models
- [Projects and Galleries](./projects-and-galleries.md) - Project-first organization and scoped sharing
- [Authentication & Auth](./backend/auth.md) - JWT implementation
- [File Storage](./backend/storage.md) - S3 integration
- [Storage Quotas](./backend/quotas.md) - Quota enforcement and upload accounting
- [Configuration](./backend/configuration.md) - Environment setup

### 🎨 [Frontend Documentation](./frontend/README.md)
Frontend architecture, components, and state management.

- [Project Structure](./frontend/structure.md) - React code organization
- [Architecture](./frontend/architecture.md) - Design patterns and architecture
- [Components Guide](./frontend/components.md) - Reusable components
- [State Management](./frontend/state-management.md) - Zustand stores
- [Styling](./frontend/styling.md) - Tailwind CSS and theming

### 🐳 [Deployment Documentation](./deployment/README.md)
Infrastructure, deployment, and operations guides.

- [Docker Setup](./deployment/docker.md) - Container configuration
- [Database Config](./deployment/database.md) - PostgreSQL setup
- [S3 Setup](./deployment/s3-setup.md) - Object storage
- [Environment Variables](./deployment/environments.md) - Configuration
- [Production](./deployment/production.md) - Production deployment

### 🛠️ [Development Guide](./development/README.md)
Development workflows, testing, and best practices.

- [Local Setup](./development/local-setup.md) - Development environment
- [Contributing](./development/contributing.md) - Contribution guidelines
- [Testing Guide](./development/testing.md) - Test strategy
- [Database Migrations](./development/migrations.md) - Schema changes
- [Git Workflow](./development/git-workflow.md) - Git conventions

## 🗺️ Navigation by Role

### 👨‍💼 Project Manager
- [Project Overview](../README.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Roadmap](../product_requirements_document_backend.md)

### 👨‍💻 Backend Developer
1. [Backend Overview](./backend/README.md)
2. [Local Setup](./development/local-setup.md)
3. [Project Structure](./backend/structure.md)
4. [Database Models](./backend/models.md)
5. [API Reference](./api/reference.md)
6. [Contributing Guide](./development/contributing.md)

### 🎨 Frontend Developer
1. [Frontend Overview](./frontend/README.md)
2. [Local Setup](./development/local-setup.md)
3. [Project Structure](./frontend/structure.md)
4. [Components Guide](./frontend/components.md)
5. [State Management](./frontend/state-management.md)
6. [Contributing Guide](./development/contributing.md)

### 🚀 DevOps / Infrastructure
1. [Deployment Guide](./deployment/README.md)
2. [Docker Setup](./deployment/docker.md)
3. [Database Configuration](./deployment/database.md)
4. [S3 Setup](./deployment/s3-setup.md)
5. [Production Deployment](./deployment/production.md)
6. [Monitoring](./deployment/monitoring.md)

### 🔧 Full Stack Developer
- All of the above sections

## 🎯 Common Tasks

### I want to...

**Set up the project locally**
→ [Local Setup Guide](./development/local-setup.md)

**Start the development servers**
→ [Development Guide](./development/README.md#common-commands)

**Create a new API endpoint**
→ [Backend Structure](./backend/structure.md) + [API Examples](./api/examples.md)

**Build a new React component**
→ [Components Guide](./frontend/components.md)

**Add a database migration**
→ [Migrations Guide](./development/migrations.md)

**Understand project-first gallery organization**
→ [Projects and Galleries](./projects-and-galleries.md)

**Deploy to production**
→ [Production Deployment](./deployment/production.md)

**Write tests**
→ [Testing Guide](./development/testing.md)

**Fix an issue**
→ [Troubleshooting](./development/troubleshooting.md)

**Contribute a feature**
→ [Contributing Guide](./development/contributing.md)

## 📊 Project Statistics

- **Backend:** Python 3.13, FastAPI, SQLAlchemy, PostgreSQL
- **Frontend:** React 19, TypeScript, Tailwind CSS, Vite
- **Infrastructure:** Docker, PostgreSQL, Redis, S3
- **Testing:** pytest, Vitest, pytest-cov
- **Documentation:** Markdown, diagrams, code examples

## 🔗 Quick Links

### Important Files
- [README.md](../README.md) - Project overview
- [pyproject.toml](../pyproject.toml) - Python dependencies
- [frontend/package.json](../frontend/package.json) - JavaScript dependencies
- [docker-compose.yml](../docker-compose.yml) - Development services
- [alembic.ini](../alembic.ini) - Database migrations config

### Documentation Files
- [Backend PRD](../product_requirements_document_backend.md)
- [Frontend PRD](../product_requirements_document_frontend.md)
- [Backend Overview](../backend_overview.md)
- [Backend Tasks](../tasks_backend.md)
- [Frontend Tasks](../tasks_frontend.md)

## ❓ FAQ

### Where can I find the API documentation?
→ `/docs` endpoint at runtime or [API Reference](./api/reference.md)

### How do I set up the development environment?
→ [Local Setup Guide](./development/local-setup.md)

### What's the deployment process?
→ [Production Deployment](./deployment/production.md)

### Where can I find database schema?
→ [Database Models](./backend/models.md)

### How do I contribute?
→ [Contributing Guide](./development/contributing.md)

### Where's the authentication implementation?
→ [Authentication Guide](./backend/auth.md)

### How do I handle file uploads?
→ [Storage Guide](./backend/storage.md)

### What about state management?
→ [State Management Guide](./frontend/state-management.md)

## 🆘 Need Help?

1. **Check the relevant documentation** - Most answers are in the guides above
2. **Check Troubleshooting** - [Backend](./backend/troubleshooting.md), [Frontend](./frontend/troubleshooting.md), [Development](./development/troubleshooting.md)
3. **Review Examples** - [API Examples](./api/examples.md)
4. **Ask in discussions** - GitHub Discussions
5. **Report issue** - GitHub Issues

## 📝 Documentation Maintenance

This documentation is kept up-to-date as the project evolves. If you find outdated information:
1. Create an issue
2. Submit a PR with corrections
3. Update the relevant `.md` file

Last Updated: November 2025

---

**Pro Tip:** Bookmark this page and return often as you develop!
