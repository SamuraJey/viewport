# Authentication & Authorization

## Overview

Viewport uses JWT (JSON Web Tokens) for stateless authentication. Users register with email and password, receive JWT tokens, and use them to access protected endpoints.

## Authentication Flow

```
┌──────────────┐
│   Client     │
└──────┬───────┘
       │
       │ 1. POST /auth/register or /auth/login
       ▼
┌──────────────────────────────────────┐
│   FastAPI Endpoint (api/auth.py)     │
├──────────────────────────────────────┤
│ - Validate email/password            │
│ - Hash password (bcrypt)             │
│ - Create User in database            │
│ - Generate JWT tokens                │
└──────┬───────────────────────────────┘
       │
       │ 2. Return tokens
       ▼
┌──────────────────────────────────────┐
│   Client Stores Tokens               │
│ - access_token (30 min)              │
│ - refresh_token (7 days)             │
└──────────────────────────────────────┘
       │
       │ 3. Use token in Authorization header
       ▼
┌──────────────────────────────────────┐
│   Protected Endpoint                 │
│ Authorization: Bearer <access_token> │
└──────┬───────────────────────────────┘
       │
       │ 4. Verify JWT token
       ▼
┌──────────────────────────────────────┐
│   auth_utils.py::verify_token()      │
│ - Decode JWT                         │
│ - Check signature                    │
│ - Check expiration                   │
│ - Return User                        │
└──────────────────────────────────────┘
```

## JWT Tokens

### Token Structure

JWT consists of 3 parts separated by dots: `header.payload.signature`

**Example:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJleHAiOjE3NDA2MTcyMDB9.
4R4KMr_v-LxRSqP8m8IeX1n8xhVMK_A8KxU-mT5hk3U
```

### Payload Structure

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",  // User ID
  "exp": 1740617200,                              // Expiration (Unix timestamp)
  "iat": 1740613600,                              // Issued at
  "type": "access"                                // Token type
}
```

### Token Types

**Access Token**
- Duration: 30 minutes
- Usage: Authenticate API requests
- Expires quickly for security

**Refresh Token**
- Duration: 7 days
- Usage: Obtain new access token without re-login
- Longer duration for convenience

## Implementation Details

### Password Hashing

Using `bcrypt` for secure password hashing:

```python
# auth_utils.py
import bcrypt

def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode(), salt).decode()

def verify_password(password: str, password_hash: str) -> bool:
    """Verify password against hash."""
    return bcrypt.checkpw(password.encode(), password_hash.encode())
```

**Security:**
- Bcrypt rounds: 12 (balanced security/performance)
- Passwords are hashed before storing in database
- Never compare passwords with `==`

### Token Generation

```python
# auth_utils.py
import jwt
from datetime import datetime, timedelta

def create_access_token(user_id: UUID) -> str:
    """Create access token."""
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + timedelta(minutes=30),
        "iat": datetime.utcnow(),
        "type": "access"
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

def create_refresh_token(user_id: UUID) -> str:
    """Create refresh token."""
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + timedelta(days=7),
        "iat": datetime.utcnow(),
        "type": "refresh"
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")
```

### Token Verification

```python
# auth_utils.py
def verify_token(token: str, token_type: str = "access") -> UUID:
    """Verify and decode token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        
        # Check token type
        if payload.get("type") != token_type:
            raise ValueError("Invalid token type")
        
        user_id = UUID(payload["sub"])
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

## Endpoints

### Register

**POST** `/auth/register`

Register a new photographer account.

**Request:**
```json
{
  "email": "photographer@example.com",
  "password": "SecurePassword123!"
}
```

**Response (201):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "photographer@example.com"
}
```

**Errors:**
- `400`: Email already registered
- `422`: Invalid email format or password too short

### Login

**POST** `/auth/login`

Authenticate and receive JWT tokens.

**Request:**
```json
{
  "email": "photographer@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "photographer@example.com",
  "tokens": {
    "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
    "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
    "token_type": "bearer"
  }
}
```

**Errors:**
- `401`: Invalid credentials
- `422`: Missing required fields

### Refresh Token

**POST** `/auth/refresh`

Get a new access token using refresh token.

**Request Headers:**
```
Authorization: Bearer <refresh_token>
```

**Response (200):**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "token_type": "bearer"
}
```

**Errors:**
- `401`: Invalid or expired refresh token

### Get Current User

**GET** `/me`

Get information about the authenticated user.

**Request Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "photographer@example.com"
}
```

**Errors:**
- `401`: Missing or invalid token

## Dependency Injection

### Get Current User

```python
# dependencies.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthCredentials

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Extract and verify current user from JWT token."""
    try:
        user_id = verify_token(credentials.credentials)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user
```

### Usage in Endpoints

```python
# api/gallery.py
@router.get("/galleries")
async def list_galleries(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get galleries for authenticated user."""
    galleries = db.query(Gallery).filter_by(owner_id=current_user.id).all()
    return galleries
```

## Authorization

### Owner-Only Access

Ensure user can only access their own resources:

```python
# api/gallery.py
@router.post("/galleries/{gallery_id}/photos")
async def upload_photo(
    gallery_id: UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload photo to user's gallery."""
    gallery = db.query(Gallery).filter_by(id=gallery_id).first()
    
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Authorization check
    if gallery.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to modify this gallery"
        )
    
    # Process upload...
```

### Public Endpoints

Public endpoints don't require authentication:

```python
# api/public.py
@router.get("/s/{share_id}")
async def view_gallery(share_id: UUID, db: Session = Depends(get_db)):
    """View shared gallery (public, no auth required)."""
    share_link = db.query(ShareLink).filter_by(id=share_id).first()
    
    if not share_link:
        raise HTTPException(status_code=404, detail="Share link not found")
    
    # Check expiration
    if share_link.expires_at and share_link.expires_at < datetime.utcnow():
        raise HTTPException(status_code=404, detail="Link expired")
    
    # Continue...
```

## Security Best Practices

### Token Storage (Frontend)

**❌ Don't store in localStorage (XSS vulnerable):**
```javascript
localStorage.setItem("token", accessToken);  // Vulnerable!
```

**✅ Store in httpOnly cookie (secure):**
```javascript
// Server sets this header
Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Strict
```

### Token Refresh

Implement automatic token refresh:

```javascript
// Frontend: Intercept 401 responses
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const newToken = await refreshAccessToken();
      error.config.headers.Authorization = `Bearer ${newToken}`;
      return axios(error.config);
    }
    return Promise.reject(error);
  }
);
```

### HTTPS Required

Always use HTTPS in production:
- Prevents token interception
- Required for secure cookies
- Protect against man-in-the-middle attacks

### CORS Configuration

```python
# main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yourdomain.com"],  # Specific origins only
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)
```

### Rate Limiting

Implement rate limiting on authentication endpoints:

```python
# Use a library like slowapi
from slowapi import Limiter

limiter = Limiter(key_func=get_remote_address)

@router.post("/auth/login")
@limiter.limit("5/minute")  # 5 attempts per minute
async def login(...):
    pass
```

## Troubleshooting

### Token Expired
- Access tokens expire after 30 minutes
- Use refresh token to get new access token
- If refresh token expired, user must login again

### Invalid Token
- Check token format (should be valid JWT)
- Verify token was copied correctly
- Ensure no trailing spaces

### 401 Unauthorized
- Missing `Authorization` header
- Invalid token format
- Token signature verification failed

## Environment Variables

```bash
# .env or docker-compose.yml
JWT_SECRET_KEY=your-super-secret-key-change-in-production
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
```

---

For complete API endpoint documentation, see [API Reference](../api/reference.md).  
For frontend integration, see [Frontend Authentication](../../frontend/authentication.md).
