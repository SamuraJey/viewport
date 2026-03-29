# Dashboard Page UX Improvements Plan

## Problem Statement
Текущая страница Dashboard для фотохостинга имеет базовую функциональность, но не использует полностью потенциал UX паттернов для фотоконтента. Карточки галерей не показывают визуальное превью, недостаточно информативны, и отсутствуют функции поиска/фильтрации.

## Design Principles Applied
- **Design Tokens**: Использовать существующие CSS переменные из `index.css` (@theme)
- **Visual Hierarchy & Whitespace**: Улучшить структуру карточек, добавить whitespace
- **Micro-interactions**: Hover эффекты, анимации, visual feedback
- **Cognitive Load Reduction**: Группировка информации, предсказуемые паттерны
- **Anticipatory Design**: Quick actions, smart defaults

---

## Current State Analysis

### Backend Data Available (GalleryResponse)
- `id`, `owner_id`, `name`, `created_at`, `shooting_date`
- `cover_photo_id` ✅ (можно использовать для превью)
- `public_sort_by`, `public_sort_order`

### Backend Data NOT in List (need to add):
- `photo_count` / `total_photos` ❌
- `total_size_bytes` ❌
- `has_share_links` / privacy status ❌
- `recent_photos` (thumbnail grid) ❌
- `cover_photo_url` ❌

### Current UI Issues
1. Карточки показывают только название и дату съёмки
2. Иконка календаря вместо визуального превью
3. Только "Manage Gallery" кнопка, нет quick actions
4. Нет поиска/фильтрации галерей
5. Сетка фиксированная (xl:3 колонки), не расширяется на 4K
6. Нет "Add" карточки в сетке

---

## Implementation Plan

### Phase 1: Backend API Enhancement
**Goal**: Расширить API для передачи необходимых данных в список галерей

#### 1.1 Extend GalleryResponse Schema
- Add `photo_count: int` — количество фото
- Add `total_size_bytes: int` — размер галереи
- Add `has_active_share_links: bool` — есть ли активные share links
- Add `cover_photo_thumbnail_url: str | None` — URL превью cover photo

#### 1.2 Update Gallery List Endpoint
- Добавить JOIN для подсчёта фото и размера
- Добавить проверку наличия активных share links
- Генерировать presigned URL для cover photo thumbnail

### Phase 2: Frontend - Design Tokens & Foundation
**Goal**: Подготовить дизайн-систему для новых компонентов

#### 2.1 Extend Design Tokens (index.css)
- Add card-specific surface colors
- Add overlay gradients for image cards
- Add spacing tokens for card layouts
- Add animation timing tokens

#### 2.2 Add Animation Utilities
- Install `tailwindcss-motion` OR add custom animations
- Card hover scale/shadow transitions
- Fade-in for lazy-loaded images

### Phase 3: Frontend - Enhanced Gallery Card
**Goal**: Переработать карточку галереи с визуальным превью

#### 3.1 GalleryCard Visual Redesign
```
┌─────────────────────────────────────┐
│  [Background: blurred cover photo]  │
│  ┌─────────────────────────────────┐│
│  │  📷 128 photos  │  1.2 GB  │ 🔗 ││  <- metadata row (hover)
│  └─────────────────────────────────┘│
│                                     │
│  ┌───┬───┬───┐                      │
│  │ ▪ │ ▪ │ ▪ │  <- thumbnail grid   │
│  └───┴───┴───┘                      │
│                                     │
│  Gallery Name                       │  <- title
│  Sep 15, 2025                       │  <- date
│                                     │
│  [Edit] [Share] [Delete]            │  <- quick actions (hover)
└─────────────────────────────────────┘
```

#### 3.2 Component Structure
- `DashboardGalleryCard.tsx` — refactor с поддержкой:
  - Background image (cover photo, blurred)
  - Thumbnail grid (3 recent photos)
  - Metadata badges (photo count, size, share status)
  - Quick actions на hover
  - Clickable card → navigate to gallery

#### 3.3 Interactions
- Hover: lift effect (scale 1.02, shadow-lg)
- Hover: show quick actions overlay
- Hover: metadata badges fade in
- Click anywhere → navigate (кроме action buttons)
- Lazy load thumbnails (IntersectionObserver)

### Phase 4: Frontend - Search & Filter
**Goal**: Добавить поиск и фильтрацию галерей

#### 4.1 Search Bar Component
- Debounced search input
- Search by name (client-side for now, small datasets)
- Future: server-side search with API

#### 4.2 Sort & Filter Controls
- Sort by: Date created, Shooting date, Name, Photo count, Size
- Order: Ascending / Descending
- URL-synced state (query params)

#### 4.3 UI Layout Update
```
┌────────────────────────────────────────────────┐
│  My Galleries                    [+ New Gallery]│
│  Your personal space...                        │
│                                                │
│  [🔍 Search...]  [Sort: Date ▼]  [Order ▼]     │
│                                                │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                   │
│  │Card│ │Card│ │Card│ │ +  │  <- Add card      │
│  └────┘ └────┘ └────┘ └────┘                   │
└────────────────────────────────────────────────┘
```

### Phase 5: Frontend - Responsive Grid
**Goal**: Адаптивная сетка на все размеры экранов

#### 5.1 Grid Breakpoints
- `sm`: 1 column
- `md`: 2 columns
- `lg`: 3 columns
- `xl`: 4 columns
- `2xl`: 5 columns (large monitors)

#### 5.2 Card Aspect Ratio
- Fixed aspect ratio (4:3 or 3:2) для consistency

### Phase 6: Frontend - "Add Gallery" Card
**Goal**: Интуитивная карточка создания галереи в сетке

#### 6.1 Empty State Card Design
- Dashed border, muted background
- Large "+" icon centered
- "Create New Gallery" text
- Click → open create modal
- Same size as regular cards

### Phase 7: Testing & Polish
- Unit tests for new components
- E2E tests for user flows
- Accessibility audit (keyboard nav, screen readers)
- Performance testing (image loading, animations)

---

## Todo Summary

| ID                    | Task                                                                    | Dependencies                     |
| --------------------- | ----------------------------------------------------------------------- | -------------------------------- |
| backend-gallery-list  | Extend gallery list API with photo_count, size, share status, cover URL | -                                |
| design-tokens         | Add card-specific design tokens to index.css                            | -                                |
| animations            | Add micro-interaction animations (hover, fade)                          | design-tokens                    |
| gallery-card-refactor | Refactor DashboardGalleryCard with visual preview                       | backend-gallery-list, animations |
| quick-actions         | Add hover quick actions (edit, share, delete)                           | gallery-card-refactor            |
| clickable-card        | Make entire card clickable (navigate)                                   | gallery-card-refactor            |
| search-filter         | Add search and sort controls                                            | -                                |
| responsive-grid       | Improve grid breakpoints (up to 5 columns)                              | -                                |
| add-gallery-card      | Add "Create Gallery" card in grid                                       | -                                |
| thumbnail-grid        | Add recent photos thumbnail grid to card                                | backend-gallery-list             |
| testing               | Add tests for new components                                            | all above                        |

---

## Technical Notes

### Backend Changes
- `src/viewport/schemas/gallery.py` — extend `GalleryResponse`
- `src/viewport/api/gallery.py` — update `list_galleries()` with JOINs
- Consider caching cover photo URLs (Redis-backed presigned cache already exists)

### Frontend Changes
- `frontend/src/types/gallery.ts` — extend `Gallery` type
- `frontend/src/components/dashboard/DashboardGalleryCard.tsx` — major refactor
- `frontend/src/pages/DashboardPage.tsx` — add search/filter UI
- `frontend/src/index.css` — add design tokens
- `frontend/tailwind.config.js` — animation utilities

### Performance Considerations
- Lazy load cover photos with IntersectionObserver
- Use thumbnail URLs (small images) in card, not full-size
- Consider skeleton loading for images
- Debounce search input (300ms)
