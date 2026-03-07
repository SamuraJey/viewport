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
