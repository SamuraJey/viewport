Вот разбивка по **Epics** и **User Stories/Задачам** для фронтенд-разработки вашего React+Vite приложения.

---

## Epic 1. Настройка проекта и аутентификация

**US1.1 Инициализация проекта**

* Инициализировать Vite + React (TypeScript).
* Подключить Tailwind CSS, линтер (ESLint + Prettier).

**US1.2 Хранение и управление токенами**

* Настроить HTTP-клиент (Axios/Fetch) с `baseURL`.
* Реализовать сервис `authService` для работы с `/auth/login`, `/auth/register`, `/auth/refresh`.
* Хранить `access_token` и `refresh_token` в безопасном месте (HttpOnly cookie или secure storage).

**US1.3 Маршрутизация и охрана роутов**

* Установить React Router v6.
* Настроить публичные (login, register, public gallery) и приватные (dashboard и дочерние) маршруты.
* Добавить `RequireAuth` HOC/компонент: при отсутствии токена — редирект на `/auth/login`.

**US1.4 Страницы Login и Register**

* `LoginPage`: форма (email, password), валидация, обработка ошибок, спиннер на кнопке.
* `RegisterPage`: аналогичная форма регистрации.
* После успешного логина/регистрации — редирект на `/`.

---

## Epic 2. Личный кабинет (Dashboard) и управление галереями

**US2.1 DashboardPage: список галерей**

* GET `/galleries` → отображение карточек с датой создания и кнопками “Открыть” + “Создать”.
* Поддержка пагинации: кнопки Prev/Next.

**US2.2 Создание новой галереи**

* Модальное окно или отдельная страница `/galleries/new` с кнопкой “Создать”.
* POST `/galleries` → обновление списка.

**US2.3 Удаление галереи (опционально)**

* Кнопка “Удалить” на карточке галереи → подтверждение → DELETE `/galleries/{id}` (если реализовано).

---

## Epic 3. Загрузка и отображение фотографий

**US3.1 PhotoUploader компонент**

* Drag’n’drop зона + кнопка “Выбрать файлы”.
* Валидация типов (JPG/PNG) и размера (≤ 15 МБ).
* Для каждого файла отображать прогресс-бар загрузки.
* POST `/galleries/{id}/photos` (multipart/form-data).

**US3.2 GalleryPage: отображение загруженных фото**

* GET `/galleries/{id}/photos` (или брать из `/s/{shareId}` после генерации ссылки).
* Сетка миниатюр (CSS Grid): 4/2/1 колонка для Desktop/Tablet/Mobile.
* Lazy-loading (Intersection Observer).

**US3.3 Обработка ошибок загрузки**

* Показывать toast/alert при ошибке (413, 404, 401).
* Позволять повторить неудачную загрузку.

---

## Epic 4. Генерация и управление Share Links

**US4.1 ShareLinkModal компонент**

* Поле выбора даты истечения (DatePicker) и чекбокс “Без срока”.
* Кнопка “Создать” → POST `/galleries/{id}/share-links`.
* При успешном создании показывать ссылку с кнопкой “Скопировать”.

**US4.2 ShareLinkTable компонент**

* Таблица со столбцами:

  * **Link** (UUID, кликабелен — открывает новый таб `/s/{shareId}`)
  * **Expires At**
  * **Views**, **ZIP-downloads**, **Single-downloads**
  * **Actions**: Copy, (опционально) Delete
* Сортировка по дате создания и счётчикам.

---

## Epic 5. Публичный просмотр галереи

**US5.1 PublicGalleryPage**

* Маршрут `/s/:shareId`.
* GET `/s/{shareId}` → массив `{ photo_id, thumbnail_url, full_url }`.
* Отображать adaptive grid-layout с теми же правилами кол-во колонок.
* Обновить счётчик просмотров при монтировании.

**US5.2 Lightbox компонент**

* При клике на миниатюру открывать полноэкранный просмотр.
* Навигация стрелками (←→), кнопка “Закрыть”.
* Кнопка скачивания текущей фото (`/s/{shareId}/download/{photoId}`).

**US5.3 Скачивание всех фото**

* Кнопка “Скачать всё” на PublicGalleryPage.
* Запуск GET `/s/{shareId}/download/all` → download via Blob/anchor.
* Отображать индикатор “Генерация архива” до начала скачивания.

---

## Epic 6. Состояние, уведомления и ошибки

**US6.1 Глобальный Toast/Notification**

* Реализовать компонент для отображения success/error/info.
* Использовать для ошибок API и успехов (напр. “Ссылка создана”).

**US6.2 Спиннеры и загрузочные состояния**

* Кнопки “Создать”, “Загрузить” — показывают спиннер во время запроса.
* Skeleton-экраны для галерей и фото при загрузке.

**US6.3 Обработка ошибок 401/403**

* При 401 на любом приватном запросе — автоматический редирект на `/auth/login`.
* При 403 или 404 публичных запросов — показывать “Gallery not found or expired”.

---

## Epic 7. Тестирование и CI

**US7.1 Unit-тесты компонентов**

* LoginForm, RegisterForm, PhotoUploader, ShareLinkModal, ShareLinkTable, Lightbox.
* Использовать Jest + React Testing Library.

**US7.2 Integration-тесты HTTP-hooks**

* Моки сервисов API, проверка успешных и ошибочных сценариев.

**US7.3 E2E-тесты (Cypress)**

* Сценарий “Create gallery → upload photos → generate link → public view → download”.

**US7.4 CI-pipeline**

* Настроить GitHub Actions: `lint` → `test` → `build`.
* Деплой статики на Netlify/Vercel из `main`.

---

Каждый Epic разбит на конкретные задачи с чёткими критериями готовности. Это позволит спланировать спринты, отслеживать прогресс и быстро получить работающий MVP.
