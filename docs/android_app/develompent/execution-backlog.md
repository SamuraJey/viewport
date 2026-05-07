# Viewport Android App — concrete execution backlog

_Last updated: 2026-04-21_

Источник для этого backlog:

- approved PRD: `.omx/plans/prd-android-native-app-rev1.md`
- approved test spec: `.omx/plans/test-spec-android-native-app-rev1.md`

Этот backlog переводит approved-план в исполнимую очередь задач без расширения scope.

---

## 1. Зафиксированный scope v1

### Входит в v1
- owner login / logout / session restore / token refresh
- project list
- project detail
- gallery browse
- upload через Android Photo Picker
- public gallery share view
- public project share view
- deep links для public gallery / public project

### Не входит в v1
- public selection participation
- CameraX capture
- owner share-link analytics/detail management
- ZIP download hand-off
- profile mutation beyond clearly stable behavior
- local transcoding/compression media before upload

---

## 2. Правила исполнения backlog

1. **Сначала contract verification, потом Android feature work.**
2. **Нельзя расширять v1 scope без обновления PRD и этого backlog.**
3. **Любая задача, завязанная на backend behavior, должна ссылаться на source file или test reference.**
4. **Public `route_path` из backend нельзя принимать как готовую Android navigation contract.**
5. **Upload v1 должен зеркалить текущий web/backend contract: JPG/JPEG/PNG, максимум 10 MB, без transcoding.**

---

## 3. Статусы и приоритеты

### Статусы
- `todo` — задача ещё не начата
- `in_progress` — задача в работе
- `blocked` — есть внешний блокер
- `done` — задача завершена и подтверждена
- `deferred` — сознательно вынесена за рамки v1

### Приоритеты
- `P0` — критический путь v1
- `P1` — нужен для complete v1, но не первый по очереди
- `P2` — post-v1 / v1.5 / hardening

---

## 4. Критический путь

Ниже — минимальный путь до релиз-кандидата v1:

1. **AND-001..AND-006** — contract matrix + freeze границ v1
2. **AND-007..AND-008** — pre-gate scaffold и baseline quality setup
3. **AND-009** — formal Phase 0 sign-off
4. **AND-010..AND-014** — app shell + auth foundation
5. **AND-020..AND-024** — owner browse flow
6. **AND-030..AND-037** — upload pipeline
7. **AND-040..AND-045** — public consume flow
8. **AND-050..AND-055** — release hardening и final verification

Без закрытия Phase 0 нельзя переходить к feature completion claims.

---

## 5. Backlog by milestone

## Milestone 0 — Contract audit and foundation gate

### AND-001 — создать Android contract matrix
- **Priority:** P0
- **Status:** todo
- **Depends on:** none
- **Deliverables:**
  - `docs/mobile/android-contract-matrix.md`
- **Concrete work:**
  - создать таблицу со столбцами:
    - Endpoint
    - Auth mode
    - Request/response source file
    - Test reference
    - Android decision
    - Status
  - завести строки для всех v1 endpoint/flow
- **Done when:**
  - файл существует
  - все v1 flows перечислены
  - нет пустых строк без owner

### AND-002 — верифицировать auth contract из кода и тестов
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-001
- **Source anchors:**
  - `src/viewport/api/auth.py`
  - `frontend/src/lib/api.ts`
  - `frontend/src/services/authService.ts`
- **Concrete work:**
  - подтвердить request/response shape для:
    - `POST /auth/login`
    - `POST /auth/refresh`
  - зафиксировать refresh behavior после `401`
  - зафиксировать expected signed-out fallback
- **Done when:**
  - строки auth в contract matrix помечены `Verified`
  - описаны Android decisions для login, refresh, logout recovery

### AND-003 — верифицировать owner browse contract
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-001
- **Source anchors:**
  - `src/viewport/api/project.py`
  - `src/viewport/api/gallery.py`
- **Concrete work:**
  - выбрать точный набор owner endpoints для v1:
    - project list
    - project detail
    - gallery detail / photo list
  - зафиксировать required query params и response fields
- **Done when:**
  - contract matrix содержит verified browse rows
  - зафиксировано, какие fields нужны Android UI, а какие можно игнорировать

### AND-003A — принять и зафиксировать решение по `/me` для v1
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-001
- **Source anchors:**
  - `src/viewport/api/user.py`
  - `.omx/plans/test-spec-android-native-app-rev1.md`
- **Concrete work:**
  - определить, нужен ли `/me` в v1 вообще
  - если нужен — зафиксировать exact read-only fields для Android
  - если не нужен — явно пометить `/me` как `Explicitly Deferred` для v1 в contract matrix
- **Done when:**
  - для `/me` принято бинарное решение `Verified` или `Explicitly Deferred`
  - backlog и contract matrix не оставляют `/me` в состоянии “потом решим”

### AND-004 — верифицировать upload contract
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-001
- **Source anchors:**
  - `src/viewport/schemas/photo.py`
  - `src/viewport/api/photo.py`
  - `frontend/src/hooks/usePhotoUpload.ts`
  - `frontend/src/constants/upload.ts`
- **Concrete work:**
  - подтвердить MIME whitelist: `image/jpeg`, `image/jpg`, `image/png`
  - подтвердить hard limit: `10 MB`
  - подтвердить flow:
    - `batch-presigned`
    - direct PUT to S3
    - `batch-confirm`
  - зафиксировать retry/error handling expectations
- **Done when:**
  - строки upload в contract matrix помечены `Verified`
  - Android decision "reject unsupported/oversize before queueing" записан явно

### AND-005 — верифицировать public contract и deep-link behavior
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-001
- **Source anchors:**
  - `src/viewport/api/public.py`
- **Concrete work:**
  - подтвердить различие gallery share vs project share
  - подтвердить follow-up endpoint для project -> gallery navigation
  - подтвердить `404` для inactive share
  - подтвердить `410` для expired share
  - зафиксировать, какие public fields Android может использовать как contract
- **Done when:**
  - public rows в matrix помечены `Verified`
  - явно записано, что web-shaped `route_path` не используется как Android navigation source of truth

### AND-006 — заморозить deferred scope v1
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-001, AND-002, AND-003, AND-004, AND-005
- **Concrete work:**
  - завести отдельный блок `Explicitly Deferred` в contract matrix
  - внести:
    - selection
    - CameraX
    - share-link analytics/detail management
    - ZIP hand-off
    - unstable profile mutation
- **Done when:**
  - каждая deferred area явно отражена в matrix
  - нет расплывчатых формулировок типа “может войдёт, если будет время”

### AND-007 — создать Android project scaffold
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-002, AND-003, AND-004, AND-005
- **Concrete work:**
  - создать bootstrap структуру модулей:
    - `app`
    - `core:data`
    - `feature:auth`
    - `feature:owner`
    - `feature:public`
    - `feature:upload`
  - зафиксировать package convention
  - подключить базовый Gradle setup
- **Done when:**
  - проект собирается
  - модульная структура соответствует approved PRD
  - нет premature split beyond bootstrap set

### AND-008 — базовый quality gate для Android проекта
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-007
- **Concrete work:**
  - включить базовые test/build tasks в CI
  - добавить placeholder test commands в developer docs
  - подготовить baseline для unit/integration/UI tests
- **Done when:**
  - есть воспроизводимый build command
  - есть воспроизводимый test command
  - baseline проходит на пустом scaffold

### AND-009 — Phase 0 sign-off
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-001..AND-008, AND-003A
- **Concrete work:**
  - провести review contract matrix
  - зафиксировать, что все v1 rows имеют статус `Verified` или `Explicitly Deferred`
- **Done when:**
  - Phase 0 formally closed
  - команда может начинать feature implementation без contract ambiguity

### Жёсткое правило перехода после Milestone 0
**Ни одна implementation-задача Milestone 1+ не стартует, пока AND-009 не закрыт и пока каждая строка v1 в contract matrix не имеет статус `Verified` или `Explicitly Deferred`.**

---

## Milestone 1 — Auth and app shell

### AND-010 — реализовать secure token storage abstraction
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-007
- **Concrete work:**
  - создать abstraction поверх secure storage
  - разделить:
    - secrets
    - non-secret session metadata
- **Done when:**
  - можно сохранить/прочитать/очистить access + refresh token
  - API storage слоя покрыт unit tests

### AND-011 — реализовать network stack и auth retry policy
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-010, AND-002
- **Concrete work:**
  - добавить request auth attachment
  - реализовать single-refresh policy
  - реализовать повтор protected request после successful refresh
- **Done when:**
  - `401 -> refresh -> retry` работает
  - refresh failure переводит приложение в signed-out state

### AND-012 — реализовать auth repository и use cases
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-011
- **Concrete work:**
  - login
  - restore session
  - logout
  - signed-out recovery
- **Done when:**
  - auth domain закрывает все v1 auth scenarios
  - нет UI-зависимостей внутри repository слоя

### AND-013 — реализовать login screen и app start routing
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-012
- **Concrete work:**
  - login screen
  - loading / error / success states
  - start destination selection
- **Done when:**
  - cold start с valid session ведёт в owner shell
  - cold start без session ведёт в login

### AND-014 — реализовать logout и refresh-failure UX
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-013
- **Concrete work:**
  - logout action
  - token clear
  - signed-out transition
  - recoverable messaging on refresh failure
- **Done when:**
  - logout очищает local auth state
  - refresh failure не оставляет app в broken half-auth state

### AND-015 — auth verification pack
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-010..AND-014
- **Concrete work:**
  - unit tests for token manager
  - integration tests for login/refresh/retry
  - UI tests for login states
- **Done when:**
  - auth phase acceptance gate green

---

## Milestone 2 — Owner browse

### AND-020 — реализовать owner navigation shell
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-013
- **Concrete work:**
  - navigation graph для owner area
  - маршруты:
    - project list
    - project detail
    - gallery detail
- **Done when:**
  - owner flow navigates end-to-end without placeholder dead-ends

### AND-021 — реализовать project list screen
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-020, AND-003
- **Concrete work:**
  - fetch project list
  - content / empty / error / loading states
  - refresh behavior
- **Done when:**
  - project list matches verified contract fields

### AND-022 — реализовать project detail screen
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-021
- **Concrete work:**
  - fetch project detail
  - show gallery entry points
  - navigate into gallery
- **Done when:**
  - user can open any listed gallery from project detail

### AND-023 — реализовать gallery browse screen
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-022
- **Concrete work:**
  - photo grid/list
  - loading / empty / error states
  - required metadata display only
- **Done when:**
  - gallery browse is stable enough for upload reconciliation and public parity checks

### AND-024 — owner browse verification pack
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-020..AND-023
- **Concrete work:**
  - unit tests for browse viewmodels
  - integration tests for browse contracts
  - UI tests for project -> gallery path
- **Done when:**
  - owner browse phase acceptance gate green

---

## Milestone 3 — Upload pipeline

### AND-030 — реализовать media intake entry через Photo Picker
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-023, AND-004
- **Concrete work:**
  - open Photo Picker
  - map selected media into upload candidates
- **Done when:**
  - user может выбрать supported media и передать их в upload intake

### AND-031 — реализовать pre-queue validation
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-030
- **Concrete work:**
  - reject unsupported MIME
  - reject files > 10 MB
  - показать clear UX message до queueing
- **Done when:**
  - HEIC/HEIF/WebP reject path существует
  - oversize reject path существует
  - accepted files не модифицируются локально

### AND-032 — реализовать durable upload queue store
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-031
- **Concrete work:**
  - локальная модель upload item state
  - persistence для queued/in-progress/failed/completed
- **Done when:**
  - queue state переживает app relaunch

### AND-033 — реализовать `batch-presigned` stage
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-032, AND-011
- **Concrete work:**
  - request presigned batch
  - map response items
  - distinguish failed vs successful presign items
- **Done when:**
  - presign stage корректно подготавливает queue items к upload

### AND-034 — реализовать direct PUT upload stage
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-033
- **Concrete work:**
  - direct upload to presigned URL
  - progress reporting
  - transient retry policy
- **Done when:**
  - supported file can be uploaded to storage
  - network/transient failure distinguishable from hard failure

### AND-035 — реализовать `batch-confirm` stage и reconciliation
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-034
- **Concrete work:**
  - confirm uploaded items
  - update terminal states
  - trigger refresh/reconciliation in owner gallery
- **Done when:**
  - confirmed uploads отражаются в gallery browse flow

### AND-036 — перенести pipeline в WorkManager
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-033, AND-034, AND-035
- **Concrete work:**
  - background worker execution
  - queue resume after process recreation
  - worker-safe token access
- **Done when:**
  - upload survives app backgrounding / restart within designed support envelope

### AND-037 — upload verification pack
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-031..AND-036
- **Concrete work:**
  - unit tests for validator and state machine
  - integration tests for presign/put/confirm
  - worker tests for resume/retry/refresh
- **Done when:**
  - upload phase acceptance gate green

---

## Milestone 4 — Public consume

### AND-040 — реализовать public deep-link entry
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-005, AND-013
- **Concrete work:**
  - parse incoming share URLs
  - route to public gallery or public project mode
- **Done when:**
  - gallery share и project share открываются разными verified paths

### AND-041 — реализовать public gallery screen
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-040
- **Concrete work:**
  - load public gallery payload
  - render photos
  - handle loading/error states
- **Done when:**
  - gallery share open-to-view flow complete

### AND-042 — реализовать public project screen
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-040
- **Concrete work:**
  - load public project payload
  - render gallery navigation for listed galleries
  - open selected gallery inside project scope
- **Done when:**
  - project share open-to-gallery flow complete

### AND-043 — enforce listed/direct_only rules in public flow
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-042
- **Concrete work:**
  - validate that direct_only galleries never appear in project share navigation
  - ensure Android follows backend visibility rules only
- **Done when:**
  - public project flow never leaks direct_only content

### AND-044 — реализовать inactive/expired share states
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-041, AND-042
- **Concrete work:**
  - map `404` inactive -> not found state
  - map `410` expired -> expired state
- **Done when:**
  - public error states match backend contract

### AND-045 — public verification pack
- **Priority:** P0
- **Status:** todo
- **Depends on:** AND-040..AND-044
- **Concrete work:**
  - deep-link tests
  - public integration tests
  - UI tests for expired/not-found
- **Done when:**
  - public phase acceptance gate green

---

## Milestone 5 — Release hardening

### AND-050 — собрать regression checklist для v1
- **Priority:** P1
- **Status:** todo
- **Depends on:** AND-015, AND-024, AND-037, AND-045
- **Concrete work:**
  - объединить acceptance gates в один release checklist
  - добавить explicit deferred-scope audit
- **Done when:**
  - есть единый финальный checklist перед RC

### AND-051 — manual/device verification run
- **Priority:** P1
- **Status:** todo
- **Depends on:** AND-050
- **Concrete work:**
  - HEIC reject
  - >10 MB reject
  - background upload
  - refresh during worker execution
  - public gallery deep link
  - public project deep link
- **Done when:**
  - manual/device checklist полностью пройден и сохранён в docs/release notes

### AND-052 — observability and debug evidence
- **Priority:** P1
- **Status:** todo
- **Depends on:** AND-037, AND-045
- **Concrete work:**
  - добавить минимально достаточные логи/telemetry hooks
  - обеспечить diagnosability для auth/upload/public failures
- **Done when:**
  - failure cases можно локализовать без “guesswork”

### AND-053 — deferred scope audit
- **Priority:** P1
- **Status:** todo
- **Depends on:** AND-050
- **Concrete work:**
  - проверить, что selection, CameraX, ZIP, analytics/detail management не протекли в v1
- **Done when:**
  - RC не содержит partial implementations deferred areas

### AND-054 — финальный architect review
- **Priority:** P1
- **Status:** todo
- **Depends on:** AND-051, AND-052, AND-053
- **Concrete work:**
  - провести architecture verification по итоговому v1 implementation
- **Done when:**
  - architect verdict = APPROVED

### AND-055 — release candidate sign-off
- **Priority:** P1
- **Status:** todo
- **Depends on:** AND-054
- **Concrete work:**
  - зафиксировать, что все P0 задачи done
  - закрыть RC checklist
- **Done when:**
  - v1 candidate formally approved for release

---

## 6. Overall lane map

Это не “сразу параллельный старт”, а **общая карта lane’ов**.

- **Сначала всегда идёт Lane A / Phase 0.**
- **Lane A включает не только contract verification, но и обязательный pre-gate scaffold: AND-007 и AND-008.**
- **Lane B-E открываются только после закрытия AND-009.**
- **Нельзя стартовать Milestone 1+ задачи, пока у v1 rows в contract matrix нет статуса `Verified` или `Explicitly Deferred`.**

### Lane A — contracts, pre-gate foundation and QA
- AND-001..AND-009
- AND-015
- AND-024
- AND-037
- AND-045
- AND-050..AND-055

### Lane B — app shell and auth
- AND-010..AND-014

### Lane C — owner browse
- AND-020..AND-024

### Lane D — upload
- AND-030..AND-037

### Lane E — public consume
- AND-040..AND-045

Parallel work разрешено только после того, как зависимость закрыта или formally frozen.

---

## 7. First execution batch

Если начинать работу прямо сейчас, первые задачи должны идти в таком порядке:

1. AND-001
2. AND-002
3. AND-003
4. AND-003A
5. AND-004
6. AND-005
7. AND-006
8. AND-007
9. AND-008
10. AND-009
11. AND-010
12. AND-011
13. AND-012
14. AND-013
15. AND-014
16. AND-015
17. AND-020
18. AND-021
19. AND-022
20. AND-023
21. AND-024
22. AND-030
23. AND-031

Это правильная стартовая последовательность, потому что она:

- сначала закрывает весь contract ambiguity слой,
- потом выполняет обязательный pre-gate scaffold и baseline quality setup,
- потом закрывает formal Phase 0 sign-off,
- и только после этого открывает Milestone 1+ implementation lanes,
- затем завершает auth foundation,
- потом проводит owner browse до состояния, на которое может опираться upload entry,
- и только после этого открывает upload intake.

---

## 8. Explicit v1 blockers

Следующие состояния считаются blocker’ами для v1:

- в contract matrix есть v1 row со статусом `Unknown`
- upload contract не verified
- public deep-link behavior не verified
- queue не переживает relaunch/process recreation
- refresh during worker execution не доказан
- public project flow может показать `direct_only`
- в сборку протёк deferred selection flow

---

## 9. Definition of Done for this backlog

Этот backlog считается исполненным корректно, если:

1. каждая задача обновляется по статусу;
2. Phase 0 используется как реальный gate, а не формальность;
3. v1 scope не разрастается;
4. релиз-кандидат закрывает все P0 задачи;
5. deferred scope не протекает в shipping build.
