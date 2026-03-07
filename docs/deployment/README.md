# Deployment Documentation

This folder contains comprehensive guides for deploying and maintaining Viewport in various environments.

## Contents

### 🐳 [Docker Setup](./docker.md)
Complete Docker and Docker Compose configuration for all services.

### 🗄️ [Database Configuration](./database.md)
PostgreSQL setup, connection pooling, and backup strategies.

### 💾 [S3 Setup](./s3-setup.md)
Object storage configuration for development and production.

### 🔒 [Environment Variables](./environments.md)
Configuration management and environment-specific settings.

### 🚀 [Production Deployment](./production.md)
Production checklist, SSL/TLS setup, monitoring, and best practices.

### 📊 [Monitoring & Logging](./monitoring.md)
Application monitoring, metrics collection, and log aggregation.

### 🔄 [CI/CD Pipeline](./cicd.md)
GitHub Actions workflows and deployment automation.

### 🐛 [Troubleshooting](./troubleshooting.md)
Common deployment issues and solutions.

## Quick Start Deployment

### Local Development
```bash
docker-compose up -d
# App available at http://localhost:3000
```

### Production Deployment
See [Production Deployment Guide](./production.md)

## Environment Overview

| Environment | Database                    | S3                     | Redis                  | Use Case               |
| ----------- | --------------------------- | ---------------------- | ---------------------- | ---------------------- |
| Development | PostgreSQL (Docker)         | rustfs (S3-compatible) | Redis (Docker)         | Local development      |
| Testing     | PostgreSQL (testcontainers) | Mock S3                | Redis (testcontainers) | Automated tests        |
| Staging     | PostgreSQL (managed)        | rustfs (S3-compatible) | Redis (managed)        | Pre-production testing |
| Production  | PostgreSQL (RDS/managed)    | AWS S3                 | Redis (managed)        | Live application       |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Load Balancer (Nginx)                     │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┬───────────────┐
        ▼                         ▼               ▼
   ┌─────────┐            ┌─────────────┐   ┌─────────┐
   │Frontend │            │Backend      │   │Backend  │
   │(React)  │            │(FastAPI)    │   │(FastAPI)│
   └─────────┘            └─────────────┘   └─────────┘
        │                        │               │
        └────────────┬───────────┴───────────────┘
                     │
        ┌────────────┴────────────┬───────────────┐
        ▼                         ▼               ▼
   ┌─────────┐            ┌─────────────┐   ┌─────────┐
     │Database │            │Redis Cache  │   │S3 storage│
     │PostgreSQL           │            │   │        │
   └─────────┘            └─────────────┘   └─────────┘
```

## Deployment Methods

### Docker Compose (Development/Small Deployments)
- Single-machine deployment
- All services in containers
- Easy to manage and scale locally
- See [Docker Setup](./docker.md)

### Kubernetes (Large Scale)
- Container orchestration
- Auto-scaling
- High availability
- Load balancing

### Managed Services
- Cloud-managed databases (RDS, Google Cloud SQL)
- Managed Redis (ElastiCache, MemoryStore)
- CDN for static assets (CloudFront, Cloudflare)

## Configuration Files

### Docker Compose
- `docker-compose.yml` - Development environment
- `docker-compose-true-nas-deploy.yml` - TrueNAS deployment

### Environment Files
- `.env` - Development settings
- `.env.production` - Production settings
- `.env.staging` - Staging settings

## Performance Considerations

### Database
- Connection pooling (SQLAlchemy)
- Query optimization
- Indexing strategy
- Replication for high availability

### Cache
- Redis for session/data caching
- TTL policies
- Cache invalidation

### Storage
- S3 bucket optimization
- CloudFront/CDN for images
- Lifecycle policies for old files

### Application
- Async task queue (Taskiq)
- Load balancing across instances
- Rate limiting

## Security Checklist

✅ HTTPS/TLS in production
✅ Environment variables for secrets
✅ JWT token validation
✅ CORS configuration
✅ SQL injection prevention (ORM)
✅ File upload validation
✅ Rate limiting
✅ Database access controls
✅ Regular security updates

---

Quick links:
- [Docker Setup](./docker.md)
- [Database Configuration](./database.md)
- [Environment Variables](./environments.md)
- [Production Deployment](./production.md)
- [Monitoring](./monitoring.md)

For specific deployment scenarios, see the relevant documentation file.
