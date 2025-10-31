# System Architecture

## Overview

Viewport is a full-stack photo portfolio sharing platform with a React frontend, FastAPI backend, and PostgreSQL database. The system is designed for scalability, security, and ease of deployment.

## Architecture Diagram

```mermaid
graph TD
    A[Client Browser] --> B[React 19 SPA]
    B --> C[HTTPS]
    C --> D[Nginx Reverse Proxy]
    D --> E[FastAPI Server]
    E --> F[PostgreSQL Database]
    E --> G[Redis Cache]
    E --> H[S3 Object Store]
    
    subgraph "Frontend Components"
    B1[Authentication]
    B2[Gallery Management]
    B3[Photo Upload & Display]
    B4[Public Gallery Sharing]
    end
    
    subgraph "Nginx Features"
    D1[SSL/TLS Termination]
    D2[Load Balancing]
    D3[Rate Limiting]
    D4[Request Routing]
    end
    
    subgraph "FastAPI Features"
    E1[Authentication]
    E2[Gallery Manager]
    E3[Photo Upload]
    E4[Public Routes]
    end
    
    subgraph "Data Stores"
    F1[Users]
    F2[Galleries]
    F3[Photos]
    F4[Share Links]
    
    G1[Sessions]
    G2[Cache Layers]
    G3[Counters]
    
    H1[Photo Files]
    H2[Thumbnails]
    H3[Metadata]
    end
```

## Layered Architecture

### 1. **Presentation Layer** (Frontend - React)
- User interface
- Form handling and validation
- Client-side routing
- State management (Zustand)
- HTTP client (Axios)

### 2. **API Gateway Layer** (Nginx)
- HTTPS termination
- Request routing
- Load balancing
- Rate limiting
- Static file serving

### 3. **Application Layer** (FastAPI)
- HTTP request handling
- Business logic
- Request validation (Pydantic)
- Error handling
- Authentication/Authorization

### 4. **Service Layer**
- File operations (S3/MinIO)
- Image processing
- Caching logic
- Task queuing
- Metrics collection

### 5. **Data Access Layer** (Repository Pattern)
- Database queries
- ORM abstraction
- Data transformation

### 6. **Persistence Layer**
- PostgreSQL database
- Redis cache
- S3/MinIO storage

## Component Interaction Flow

## Component Interaction Flow

### User Registration

```mermaid
flowchart TD
    A[User submits form React] --> B[Frontend validates input React]
    B --> C[POST /auth/register Axios]
    C --> D[Nginx routes to FastAPI]
    D --> E[Pydantic validates schema]
    E --> F[Hash password bcrypt]
    F --> G[Create User in PostgreSQL]
    G --> H[Generate JWT token]
    H --> I[Return token response]
    I --> J[Frontend stores token]
    J --> K[Redirect to dashboard]
```

### Photo Upload
```mermaid
flowchart TD
    A[User selects files React] --> B[Frontend validates size, type]
    B --> C[Show progress bar]
    C --> D["POST /galleries/{id}/photos multipart"]
    D --> E[Nginx routes to FastAPI]
    E --> F[Validate file magic bytes]
    F --> G[Upload to S3]
    G --> H[Generate thumbnail]
    H --> I[Create Photo record in DB]
    I --> J[Return photo metadata]
    J --> K[Update gallery in frontend]
```

## Technology Stack

### Frontend
| Technology   | Purpose                 |
| ------------ | ----------------------- |
| React 19     | UI framework            |
| TypeScript   | Type safety             |
| Vite         | Build tool & dev server |
| React Router | Client-side routing     |
| Zustand      | State management        |
| Axios        | HTTP client             |
| Tailwind CSS | Styling                 |
| Vitest       | Testing framework       |

### Backend
| Technology  | Purpose              |
| ----------- | -------------------- |
| Python 3.13 | Programming language |
| FastAPI     | Web framework        |
| SQLAlchemy  | ORM                  |
| Pydantic    | Data validation      |
| Alembic     | Database migrations  |
| PyJWT       | JWT authentication   |
| Bcrypt      | Password hashing     |
| Boto3       | S3 client            |
| Pillow      | Image processing     |

### Infrastructure
| Technology     | Purpose             |
| -------------- | ------------------- |
| PostgreSQL     | Primary database    |
| Redis          | Cache & sessions    |
| S3             | Object storage      |
| Docker         | Containerization    |
| Nginx          | Reverse proxy       |
| Prometheus     | Metrics (optional)  |
| Docker Compose | Local orchestration |

## Data Flow

### 1. **API Request Flow**
```mermaid
flowchart TD
    A[Client Browser] --> B[Frontend React]
    B --> C[HTTP Request Axios]
    C --> D[Nginx Reverse Proxy]
    D --> E[FastAPI Application]
    E --> F[Request Validation Pydantic]
    F --> G[Authentication Check JWT]
    G --> H[Business Logic]
    H --> I[Repository Layer]
    I --> J[Database/Cache/Storage]
    J --> K[Response Serialization Pydantic]
    K --> L[HTTP Response]
    L --> M[Frontend React]
    M --> N[UI Update Re-render]
    N --> O[Client Browser Display]
```

### 2. **Database Query Flow**
```mermaid
flowchart TD
    A[FastAPI Route Handler] --> B[Repository Method]
    B --> C[SQLAlchemy Query Builder]
    C --> D[PostgreSQL Adapter psycopg]
    D --> E[Database Connection Pool]
    E --> F[PostgreSQL Server]
    F --> G[Query Execution]
    G --> H[Result Rows]
    H --> I[Mapping to ORM Models]
    I --> J[Return to Repository]
    J --> K[Return to Route Handler]
```

### 3. **File Upload Flow**
```mermaid
flowchart TD
    A[File Selection React] --> B[Validation Frontend]
    B --> C[FormData Creation]
    C --> D[Multipart Upload Axios]
    D --> E[Nginx Proxy]
    E --> F[FastAPI File Handler]
    F --> G[File Validation Magic Bytes]
    G --> H[Stream to S3/MinIO]
    H --> I[Generate Thumbnail]
    I --> J[Create Photo Record DB]
    J --> K[Cache Metadata Redis]
    K --> L[Return Metadata JSON]
    L --> M[Update Frontend]
```

## Security Architecture

### Authentication Layer
- JWT tokens (30 min expiry)
- Refresh tokens (7 day expiry)
- Secure HTTP-only cookies
- Password hashing with bcrypt (rounds: 12)

### Authorization Layer
- Role-based access control (owner checks)
- Resource ownership verification
- Public/private endpoint distinction

### Transport Security
- HTTPS/TLS encryption
- CORS policy enforcement
- Rate limiting
- Request validation

### Data Protection
- File type validation (magic bytes)
- Input sanitization (Pydantic)
- SQL injection prevention (ORM)
- CSRF token handling

## Scalability Considerations

### Horizontal Scaling
- Stateless FastAPI instances
- Load balancing via Nginx
- Shared database connection pool
- Centralized cache (Redis)
- Object storage (S3)

### Vertical Scaling
- Database optimization (indexes, queries)
- Connection pooling
- Caching strategies
- Image optimization

### Performance Optimizations
- CDN for static assets
- Image thumbnails and caching
- Lazy loading on frontend
- Database query optimization
- Async operations (Celery)

## Deployment Models

### Development
```
docker-compose up
- Single machine
- All services in containers
- MinIO for local S3
- PostgreSQL in Docker
- Redis in Docker
```

### Production
```
Kubernetes / Cloud Platform
- Load balancer / API Gateway
- FastAPI application
- Managed PostgreSQL (RDS)
- Managed Redis (ElastiCache)
- AWS S3 or equivalent
- CloudFront CDN
- Application monitoring
- Log aggregation
```

## Error Handling Strategy

### Backend Errors
1. Validate input (Pydantic)
2. Check authorization
3. Execute business logic
4. Catch exceptions
5. Log error (with context)
6. Return HTTP error response

### Frontend Error Handling
1. Check HTTP status
2. Parse error message
3. Display to user (Toast)
4. Log to console/monitoring
5. Offer recovery action

## Monitoring & Observability

### Metrics
- Request count & latency
- Error rates
- Database query performance
- Cache hit ratio
- File upload size/duration

### Logging
- Application logs (structured JSON)
- Access logs (Nginx)
- Database query logs
- Error traces with context

### Health Checks
- Application health endpoint
- Database connectivity
- Cache availability
- S3 connectivity

## Deployment Pipeline

```
Code Push (Git)
    ↓
GitHub Actions Trigger
    ↓
Run Tests
    ↓
Lint & Format Check
    ↓
Build Docker Images
    ↓
Push to Registry
    ↓
Deploy to Staging
    ↓
Run Integration Tests
    ↓
Manual Approval
    ↓
Deploy to Production
    ↓
Monitor & Alert
```

## Related Documentation

- [Backend Documentation](./backend/README.md)
- [Frontend Documentation](./frontend/README.md)
- [API Reference](./api/README.md)
- [Deployment Guide](./deployment/README.md)
- [Development Guide](./development/README.md)

---

For implementation details, see the specific architecture files in subdirectories.
