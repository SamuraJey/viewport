# RFC 001 — Визуальный фундамент

**Status**: PR 2 «AppBadge» + PR 3 «Migrate badges» shipped (commits `6d89b40`, `cb89121`, `1a52765`, `3034550`, `e3378e9`, `32e71bd`, `aa5fa77`, `b89fc81`, 2026-07-19). PRs 4-5 pending. Шрифты вне scope — Inter/Fraunces migration отложен, Oswald + Cuprum + PT Sans через Google Fonts остаются.
**Date**: 2026-07-19
**Author**: UI/UX audit pass
**Phase**: 1 (фундамент)
**Блокирует**: 002, 003, 004, 005, 006, 011

## Проблема

Текущая визуальная база Viewport работает, но держится на полу-ручных хардкодах и
наследует несколько архитектурных решений, которые мешают дальнейшему развитию.

1. **Семантические токены неполные.** В `index.css:309-310` определены только
   `--color-danger-rgb` и `--color-success-rgb`. В коде повсеместно
   хардкодятся `bg-amber-500/90` (warning) и `bg-blue-500/90` (info) — см.
   `PhotoCard.tsx:115, 121`, `EnhancedGalleryCard.tsx`. Светлая и тёмная темы
   расходятся по восприятию: в тёмной теме поверхности `surface → surface-1 →
   surface-2` идут с правильной инверсией, в светлой `surface-1` отличается от
   `surface` на 0.6% — карточки почти неотличимы от фона.

2. **Бейджи — ручной копипаст.** Один и тот же паттерн
   `bg-{tone}-500/90 ... text-white text-xs font-semibold backdrop-blur-md shadow-lg`
   повторяется в `PhotoCard.tsx:84-135`, `EnhancedGalleryCard.tsx`, проектных
   карточках, share-link статусах, и в десятке других мест. У каждой реализации
   свой оттенок и padding — UI дрожит.
3. **Корпоративный жаргон.** «PORTFOLIO COMMAND CENTER», «PROJECT DELIVERY HUB»,
   «CLIENT DELIVERY HUB» (`DashboardPage.tsx`, `ProjectPage.tsx`,
   `GalleryPage.tsx`) — overline-надписи, которые не несут информации, но
   съедают вертикальное место и сообщают «мы делаем enterprise-софт», а не
   «инструмент для фотографа».

4. **Лайт-тема плоская.** В тёмной теме глубина появляется за счёт инверсии
   surface-палитры; в светлой теме всё в одном бежевом тоне. На скриншоте
   dashboard в light theme карточки отличаются от фона только тонкой 1px
   границей.


Пять атомарных изменений (§1.1 отложен — шрифты вне scope), каждое в отдельном коммите внутри одного PR.

### 1.1. *(отложено)*

### 1.2. Семантические токены: warning / info

В `index.css:309-310` дополнить:

```css
:root {
  --color-info-rgb: 56 189 248;       /* sky-400 */
  --color-warning-rgb: 245 158 11;    /* amber-500 */
  --color-info-foreground-rgb: 255 255 255;
  --color-warning-foreground-rgb: 255 255 255;
}
html.dark {
  --color-info-rgb: 56 189 248;
  --color-warning-rgb: 251 191 36;    /* amber-400 (мягче на тёмном) */
}
```

И зарегистрировать в `@theme` (`index.css:6-35`):

```css
--color-info: rgb(var(--color-info-rgb));
--color-info-foreground: rgb(var(--color-info-foreground-rgb));
--color-warning: rgb(var(--color-warning-rgb));
--color-warning-foreground: rgb(var(--color-warning-foreground-rgb));
```

Все хардкоды `bg-amber-500/90`, `bg-blue-500/90` заменить на
`bg-warning/90` / `bg-info/90` через codemod.

### 1.3. Глубина светлой темы

В `index.css:300-306` поднять контраст между surface-уровнями:

```css
:root {
  --color-surface-rgb: 255 255 255;          /* was 248 250 252 */
  --color-surface-1-rgb: 248 250 252;        /* was 241 245 249 */
  --color-surface-2-rgb: 241 245 249;        /* unchanged */
  --color-surface-foreground-rgb: 255 255 255; /* was 241 245 249 — нужен для карточек на фоне surface-1 */
}
```

Это даст реальный z-стек в light mode: page → card → elevated card.

### 1.4. Glass / noise / gradient helpers

В `index.css` добавить reusable utilities:

```css
@layer utilities {
  .bg-noise {
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='0.9' /></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/></svg>");
    background-size: 200px 200px;
  }
  .bg-mesh-accent {
    background-image:
      radial-gradient(circle at 0% 0%, rgb(var(--color-accent-rgb) / 0.08), transparent 50%),
      radial-gradient(circle at 100% 100%, rgb(var(--color-info-rgb) / 0.06), transparent 50%);
  }
}
```

Применять:
- `.bg-noise` — на `<body>` с `opacity-[0.03]`, в обеих темах. «Бумажное»
  ощущение без видимого шума.
- `.bg-mesh-accent` — на hero public gallery и на metric-cards секцию dashboard.

### 1.5. AppBadge компонент

`components/ui/AppBadge.tsx` — единый API для всех бейджей:

```tsx
type BadgeTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral' | 'accent';

interface AppBadgeProps {
  tone: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  size?: 'xs' | 'sm';
  className?: string;
}
```

Зависит от 1.2 (semantic tokens). Заменяет:

- `PhotoCard.tsx:84-135` — Cover, Processing, Pending, Failed
- `ShareLinkStatusBadge.tsx` — Active/Expired/Inactive
- `EnhancedGalleryCard.tsx` — Public/Private
- Все inline-бейджи в `DashboardPage`, `ProjectPage`, `GalleryPage`

### 1.6. Удалить корпоративный жаргон

Заменить:
- `DashboardPage.tsx`: «PORTFOLIO COMMAND CENTER» → убрать, оставить h1
  «Projects» + breadcrumbs/subline.
- `ProjectPage.tsx`: «PROJECT DELIVERY HUB» → убрать.
- `GalleryPage.tsx`: «CLIENT DELIVERY HUB» (если есть) → убрать.
- `ShareLinksDashboardPage.tsx`: «SHARE-LINK CONTROL DECK» / аналог → убрать.

Если нужен subline — сделать его функциональным («4 projects · 3 140 photos · 4.39 GB»),
не декоративным.

## Альтернативы

- ~~**Оставить Oswald + Cuprum**~~ — *отложено: шрифты вне scope текущего PR*
- **Один шрифт везде** — n/a (отложено)
- **CSS-only design tokens (без JS-обёртки)** — оставляем, `tailwind-variants`
  (опц.) только для композиции variant-классов.
- **CSS `color-mix()` для badge-цветов** — рассматривали вместо RGB-токенов, но
  текущий RGB-подход уже работает с Tailwind opacity и ломает меньше мест.

## Acceptance criteria

- [x] `--color-info-rgb` и `--color-warning-rgb` зарегистрированы в `:root` и
  `html.dark`, доступны как `bg-info/...` / `bg-warning/...`.
- [x] В light theme контраст между `surface` и `surface-1` визуально различим
  (card hover, header, dashboard cards).
- [ ] `AppBadge` покрывает 100% существующих бейджей; в кодовой базе нет
  повторного `bg-{amber|blue|red|green}-500/90 ... text-white text-xs font-semibold
  backdrop-blur-md` паттерна. *(deferred to PR 2/3)*
- [ ] Body имеет `bg-noise` с `opacity-[0.03]`, видимой разницы в luma нет, но
  «бумажное» ощущение появляется. *(deferred to PR 4)*
- [ ] Все «COMMAND CENTER / DELIVERY HUB / CONTROL DECK» overline-надписи
  удалены; вместо них — функциональный subline или ничего. *(deferred to PR 5)*
- [x] Vitest + lint + typecheck проходят. `npm run test:run` без сломанных
  snapshot'ов (если только визуальный вывод не изменился намеренно — тогда
  обновлённый snapshot + ручная проверка скриншота).
- [x] Существующие 418 frontend тестов остаются зелёными.

## Rollout

1. [x] ~~PR «Type system + tokens»~~ — *отменён: §1.1 (шрифты) вне scope. §1.2 + §1.3
   (semantic tokens + surface depth) применены в коммитах `e973114` (см. историю),
2. [x] PR «AppBadge» (1.5): новый компонент. *(shipped: commit `6d89b40`)*
3. [x] PR «Migrate badges» (1.5 применение): заменить все `bg-amber-500/90
   backdrop-blur-md` на `<AppBadge tone="warning">`. *(shipped: commits `cb89121`,
   `1a52765`, `3034550`, `e3378e9`, `32e71bd`, `aa5fa77`, `b89fc81`)*
4. PR «Theme depth + glass» (1.4): bg-noise и bg-mesh-accent helpers.
5. PR «Remove jargon» (1.6): косметика, минимальный риск.

Каждый PR отдельно проходит `npm run qa`.

## Open questions

- ~~**Q1.** Оставляем Oswald как «brand mark» только в логотипе?~~ *отложено вместе с §1.1*
- **Q2.** Шумовая текстура на body — навсегда или выключаемо в low-vision mode? - Да.
  Текущее предложение: скрывать при `html[data-readability-mode='on']` через
  `display: none` на соответствующем элементе.


## Связанные документы

- Внутренний контекст: `frontend/src/index.css`, `frontend/tailwind.config.js`,
  `frontend/src/components/gallery/PhotoCard.tsx:84-135`.
- Связанные RFC: [002 A11y](./rfc-002-a11y-improvements.md),
  [006 Photo grid system](./rfc-006-photo-grid-system.md),
  [011 Skeletons](./rfc-011-skeletons-and-transitions.md).
