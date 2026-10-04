# S3 credentials and presigned URL caching

Presigned URLs are generated locally. Signing does not contact S3 or establish
that an access key still exists. If RustFS loses or revokes a key, requests for
images can return `403 InvalidAccessKeyId` with an XML body; browsers may report
this as `ERR_BLOCKED_BY_ORB` instead of displaying the S3 error.

At startup, bucket CORS configuration contacts S3. Credential errors from this
operation produce an explicit error log with the S3 error code and corrective
steps. This is a startup diagnostic, not continuous credential monitoring;
removal of a key after startup is not detected by local URL signing.

## Recovery

1. Create or restore valid credentials on the intended S3 instance.
2. Update `S3_ACCESS_KEY` and `S3_SECRET_KEY` for every backend and worker.
3. Recreate containers or restart processes with the updated environment.
4. Reload the gallery so the browser receives newly signed URLs.

Manual Redis cleanup is unnecessary. The application's cache namespace is an
HMAC fingerprint of endpoint, access key, region and signature version, keyed
by the secret key. Changing any of these settings switches cache namespaces.
Credentials themselves are not stored in Redis key names. Existing legacy
cache entries are also ignored after deploying this change.

Old cache entries expire normally (110 minutes for default two-hour URLs).
Object invalidation uses indexes within the active namespace. Workers with
identical signing settings share the same namespace; during rotation, replace
all old backend instances so none continue issuing old credentials. URLs already
loaded into a browser remain unchanged until the page requests fresh data.
