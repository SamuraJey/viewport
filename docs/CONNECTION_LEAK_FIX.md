# Connection Leak Fix: run_in_threadpool Removal

## Problem Summary

Backend was hanging after 10-20 minutes of load testing with connection pool exhaustion:
```
sqlalchemy.exc.TimeoutError: QueuePool limit of size 20 overflow 20 reached
```

## Root Cause

**Race condition in DB session lifecycle** when using `run_in_threadpool` for DB operations in async endpoints:

```python
# ❌ WRONG - Creates race condition
@router.get("/endpoint")
async def endpoint(repo = Depends(get_repository)):
    result = await run_in_threadpool(repo.some_method)
    return result
```

**Why this breaks:**
1. FastAPI dependency injection creates DB session in **main thread**
2. `run_in_threadpool` executes `repo.some_method` in **worker thread**
3. DB session object is **not thread-safe** - shared across threads
4. Session cleanup (`session.close()`) happens in main thread while worker may still be using it
5. Worker thread keeps connection → **connection leak**

After 40 connection leaks (pool_size=20 + max_overflow=20), all new requests hang waiting for free connection.

## Solution

### ✅ Convert endpoints with DB operations to SYNC (def)

FastAPI automatically runs **sync endpoints** in threadpool correctly, ensuring proper DB session lifecycle:

```python
# ✅ CORRECT - FastAPI handles threadpool
@router.get("/endpoint")
def endpoint(repo = Depends(get_repository)):
    result = repo.some_method()
    return result
```

### ✅ Keep async ONLY for CPU-bound operations

For CPU-intensive work (bcrypt, cryptography) - keep `run_in_threadpool`:

```python
@router.post("/login")
async def login(request: LoginRequest, repo = Depends(get_repository)):
    # CPU-bound bcrypt - correct use of run_in_threadpool
    is_valid = await run_in_threadpool(verify_password, request.password, user.password_hash)

    # DB operations - direct call (no wrapper)
    user = repo.get_user_by_email(request.email)
    return user
```

### ✅ Direct DB calls from async endpoints

If endpoint must stay async (for async S3 operations), DB calls should be direct (synchronous):

```python
@router.get("/photos")
async def get_photos(repo = Depends(get_repository), s3 = Depends(get_s3_client)):
    # Direct DB call - blocks briefly but avoids race condition
    photos = repo.get_photos()

    # Async S3 operations work fine
    urls = await s3.generate_presigned_urls_batch([p.file_key for p in photos])
    return urls
```

## Changes Applied

### Files Modified (22 locations fixed):

1. **src/viewport/api/photo.py** (11 fixes)
   - `get_all_photo_urls_for_gallery` → sync (def)
   - `batch_presigned_uploads` → sync (def)
   - `batch_confirm_uploads` → sync (def)
   - Removed all `run_in_threadpool(repo.*)` calls

2. **src/viewport/api/gallery.py** (4 fixes)
   - `get_gallery_detail` → sync (def)
   - Removed all `run_in_threadpool(repo.*)`

3. **src/viewport/api/auth.py** (4 fixes)
   - `register_user` → kept async (bcrypt), removed `run_in_threadpool(repo.create_user)`
   - `login_user` → kept async (bcrypt), removed `run_in_threadpool(repo.get_user_by_email)`
   - `refresh_token` → sync (def), removed `run_in_threadpool(repo.get_user_by_id)`
   - Removed unused `asyncio` import

4. **src/viewport/api/user.py** (1 fix)
   - `change_password` → kept async (bcrypt), removed `run_in_threadpool(repo.update_user_password)`

5. **src/viewport/api/public.py** (2 fixes)
   - `get_photos_by_sharelink` → kept async (S3), removed `run_in_threadpool(repo.get_photos_by_gallery_id)`
   - `download_all_photos_zip` → kept async, removed `run_in_threadpool` wrappers

6. **src/viewport/repositories/gallery_repository.py** (3 fixes)
   - `delete_photo_async` → removed `run_in_threadpool` for DB calls (kept async for S3)
   - `rename_photo_async` → removed `run_in_threadpool` for DB calls (kept async for S3)
   - `soft_delete_gallery_async` → removed `run_in_threadpool` for DB calls

### What Remains (Correct Usage)

✅ **admin/auth.py**: Uses `run_in_threadpool` correctly (creates its own DB session, not via FastAPI Depends)
✅ **CPU-bound operations**: All bcrypt calls (`hash_password`, `verify_password`) properly wrapped in `run_in_threadpool`

## Verification

✅ All 181 tests pass
✅ No compile errors
✅ Ready for long-duration load testing (30+ minutes)

## Key Takeaways

1. **Never wrap sync DB operations in `run_in_threadpool` when called from async endpoints with dependency injection**
2. **FastAPI dependency injection (Depends) + run_in_threadpool = connection leak**
3. **Prefer sync (def) endpoints for DB-heavy operations**
4. **Use run_in_threadpool ONLY for CPU-bound operations (bcrypt, cryptography)**
5. **DB sessions are not thread-safe - avoid cross-thread sharing**

## Next Steps

1. Run load test for 30+ minutes to verify fix
2. Monitor connection pool metrics: `pool_size`, `checked_in`, `checked_out`
3. Watch for "Long-lived session" warnings (should be gone)

## References

- [LOAD_TEST_ANALYSIS.md](./LOAD_TEST_ANALYSIS.md) - Initial diagnosis
- SQLAlchemy sessions: https://docs.sqlalchemy.org/en/20/orm/session_basics.html
- FastAPI dependencies: https://fastapi.tiangolo.com/tutorial/dependencies/
