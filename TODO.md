Fix 2026-03-07 08:13:11 WARNING [viewport.tasks.photo_tasks] File 0f4f9c12-3f9f-47bc-86a9-20e40d864d08/b339e952-4860-4323-8509-943d13108c2f.jpg not found in S3 (attempt 1), retrying in 0.2s
it happens when uploading photos. Why? idk. The file is definitely there, and the presigned URL works. Maybe it's a consistency issue with S3 after upload? The retry seems to fix it, but it's concerning that it happens at all. We should investigate further to see if there's a way to avoid this or if we need to implement a more robust retry mechanism for confirming uploads.


Подвисаем
Type	Name	# Requests	# Fails	Median (ms)	95%ile (ms)	99%ile (ms)	Average (ms)	Min (ms)	Max (ms)	Average size (bytes)	Current RPS	Current Failures/s
PATCH	/galleries/07c9fba3-7be6-46bc-b85c-ca18b1a8743f	17	0	14	2700	2700	197.65	8	2731	208.88	0	0

POST	/galleries/1074ef15-a9bb-445d-af92-7bcedbd9abd1/photos/batch-confirm	19	0	26	1900	1900	155.62	9	1943	38	0	0


В async def get_all_photo_urls_for_gallery синхронный from_db_photo photo_responses = [PhotoResponse.from_db_photo(photo, s3_client) for photo in photos]
Надо Async делать везде

Type	Name	# Requests	# Fails	Median (ms)	95%ile (ms)	99%ile (ms)	Average (ms)	Min (ms)	Max (ms)	Average size (bytes)	Current RPS	Current Failures/s
GET	/galleries/077b5862-9feb-41f5-9202-aab273a64e4d?limit=5&offset=0	16	0	31	3100	3100	257.69	14	3091	4719.25	0	0

почему size такой большой



2026-03-09 08:29:39 ERROR [viewport.s3_service] Failed to download object 0ede294a-d727-4f48-9b8e-0801894fda37/5dda12fb-04d6-4be2-8f1b-c45a36aab1d6.jpg: Could not connect to the endpoint URL: "https://s3.samuraj.su:4443/viewport/0ede294a-d727-4f48-9b8e-0801894fda37/5dda12fb-04d6-4be2-8f1b-c45a36aab1d6.jpg"
2026-03-09 08:29:39 ERROR [viewport.tasks.photo_tasks] S3 error for photo 5dda12fb-04d6-4be2-8f1b-c45a36aab1d6: Could not connect to the endpoint URL: "https://s3.samuraj.su:4443/viewport/0ede294a-d727-4f48-9b8e-0801894fda37/5dda12fb-04d6-4be2-8f1b-c45a36aab1d6.jpg"
2026-03-09 08:29:39 ERROR [viewport.tasks.photo_tasks] Failed to create thumbnail for photo 5dda12fb-04d6-4be2-8f1b-c45a36aab1d6: Could not connect to the endpoint URL: "https://s3.samuraj.su:4443/viewport/0ede294a-d727-4f48-9b8e-0801894fda37/5dda12fb-04d6-4be2-8f1b-c45a36aab1d6.jpg"
Traceback (most recent call last):
  File "/app/.venv/lib/python3.14/site-packages/aiohttp/connector.py", line 1562, in _create_direct_connection
    hosts = await self._resolve_host(host, port, traces=traces)
            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/app/.venv/lib/python3.14/site-packages/aiohttp/connector.py", line 1178, in _resolve_host
    return await asyncio.shield(resolved_host_task)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/app/.venv/lib/python3.14/site-packages/aiohttp/connector.py", line 1209, in _resolve_host_with_throttle
    addrs = await self._resolver.resolve(host, port, family=self._family)
            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/app/.venv/lib/python3.14/site-packages/aiohttp/resolver.py", line 40, in resolve
    infos = await self._loop.getaddrinfo(
            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<5 lines>...
    )
    ^
  File "uvloop/loop.pyx", line 1529, in getaddrinfo
socket.gaierror: [Errno -5] No address associated with hostname
The above exception was the direct cause of the following exception:
Traceback (most recent call last):
  File "/app/.venv/lib/python3.14/site-packages/aiobotocore/httpsession.py", line 224, in send
    response = await session.request(
               ^^^^^^^^^^^^^^^^^^^^^^
    ...<7 lines>...
    )
    ^
  File "/app/.venv/lib/python3.14/site-packages/aiohttp/client.py", line 779, in _request
    resp = await handler(req)
           ^^^^^^^^^^^^^^^^^^
  File "/app/.venv/lib/python3.14/site-packages/aiohttp/client.py", line 734, in _connect_and_send_request
    conn = await self._connector.connect(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        req, traces=traces, timeout=real_timeout
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    )
    ^
  File "/app/.venv/lib/python3.14/site-packages/aiohttp/connector.py", line 672, in connect
    proto = await self._create_connection(req, traces, timeout)
            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/app/.venv/lib/python3.14/site-packages/aiohttp/connector.py", line 1239, in _create_connection
    _, proto = await self._create_direct_connection(req, traces, timeout)
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/app/.venv/lib/python3.14/site-packages/aiohttp/connector.py", line 1568, in _create_direct_connection
    raise ClientConnectorDNSError(req.connection_key, exc) from exc
aiohttp.client_exceptions.ClientConnectorDNSError: Cannot connect to host s3.samuraj.su:4443 ssl:default [No address associated with hostname]
During handling of the above exception, another exception occurred:
Traceback (most recent call last):
  File "/app/src/viewport/tasks/photo_tasks.py", line 80, in _process_single_photo
    image_bytes = await s3_client.download_fileobj(object_key)
                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/app/src/viewport/s3_service.py", line 281, in download_fileobj
    response = await s3.get_object(Bucket=self.settings.bucket, Key=key)
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/app/.venv/lib/python3.14/site-packages/aiobotocore/context.py", line 36, in wrapper
    return await func(*args, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/app/.venv/lib/python3.14/site-packages/aiobotocore/client.py", line 406, in _make_api_call
    http, parsed_response = await self._make_request(
                            ^^^^^^^^^^^^^^^^^^^^^^^^^
        operation_model, request_dict, request_context
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    )
    ^
  File "/app/.venv/lib/python3.14/site-packages/aiobotocore/client.py", line 432, in _make_request
    return await self._endpoint.make_request(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        operation_model, request_dict
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    )
    ^
  File "/app/.venv/lib/python3.14/site-packages/aiobotocore/endpoint.py", line 149, in _send_request
    raise exception
  File "/app/.venv/lib/python3.14/site-packages/aiobotocore/endpoint.py", line 201, in _do_get_response
    http_response = await self._send(request)
                    ^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/app/.venv/lib/python3.14/site-packages/aiobotocore/endpoint.py", line 303, in _send
    return await self.http_session.send(request)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/app/.venv/lib/python3.14/site-packages/aiobotocore/httpsession.py", line 278, in send
    raise EndpointConnectionError(endpoint_url=request.url, error=e)
botocore.exceptions.EndpointConnectionError: Could not connect to the endpoint URL: "https://s3.samuraj.su:4443/viewport/0ede294a-d727-4f48-9b8e-0801894fda37/5dda12fb-04d6-4be2-8f1b-c45a36aab1d6.jpg"



Чтобы предотвратить накопление таких галерей, можно добавить новую периодическую задачу в maintenance_tasks.py, например:

Искать галереи с is_deleted = True и created_at старше N дней (или добавить поле deleted_at).
Для каждой такой галереи запускать delete_gallery_data_task_impl напрямую.
