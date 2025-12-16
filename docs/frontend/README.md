# Frontend Documentation

This folder contains comprehensive documentation for the Viewport frontend application built with React, TypeScript, and Vite.

## Contents

### 📋 [Project Structure](./structure.md)
Overview of the frontend source code organization and component hierarchy.

### 🏗️ [Architecture & Patterns](./architecture.md)
Frontend architecture, design patterns, and best practices.

### 🎨 [Components Guide](./components.md)
Documentation of reusable React components and their usage.

### 🔄 [State Management](./state-management.md)
Zustand store setup, state patterns, and data flow.

### 🔌 [API Integration](./api-integration.md)
HTTP client configuration, API hooks, and error handling.

### 🎨 [Styling & Theming](./styling.md)
Tailwind CSS configuration, responsive design, and theming.

### 🧪 [Testing Guide](./testing.md)
Unit tests, integration tests, and test utilities.

### 📱 [Responsive Design](./responsive.md)
Mobile-first approach, breakpoints, and adaptation strategies.

### 🐛 [Troubleshooting](./troubleshooting.md)
Common issues and solutions for frontend development.

## Quick Navigation

- **Getting Started?** → See [Local Setup Guide](../development/local-setup.md)
- **Building Components?** → See [Components Guide](./components.md)
- **Managing State?** → See [State Management](./state-management.md)
- **Testing?** → See [Testing Guide](./testing.md)

## Tech Stack

- **Framework:** React 19+
- **Language:** TypeScript 5.8+
- **Build Tool:** Vite
- **Routing:** React Router v7
- **State Management:** Zustand
- **Styling:** Tailwind CSS v4
- **HTTP Client:** Axios
- **Testing:** Vitest + React Testing Library
- **UI Components:** Custom (Lucide React icons)

## Project Structure

```
frontend/
├── src/
│   ├── components/          # Reusable React components
│   ├── pages/               # Page components
│   ├── hooks/               # Custom React hooks
│   ├── stores/              # Zustand state management
│   ├── services/            # API client services
│   ├── styles/              # Global styles
│   ├── types/               # TypeScript types
│   ├── utils/               # Utility functions
│   ├── App.tsx              # Main App component
│   └── main.tsx             # Entry point
├── public/                  # Static assets
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── vitest.config.ts
```

## Key Features

- ✅ **Type-Safe:** Full TypeScript support
- ✅ **Responsive:** Mobile-first design
- ✅ **Fast:** Vite development server
- ✅ **Scalable:** Component-based architecture
- ✅ **Tested:** Comprehensive test coverage
- ✅ **Modern:** Latest React features (hooks, suspense)

## Development Workflow

1. **Start dev server:** `npm run dev`
2. **Make changes** to components
3. **See live updates** with HMR
4. **Run tests:** `npm test`
5. **Build for production:** `npm run build`

## Important Patterns

### Component Structure
```typescript
// Functional component with TypeScript
interface ComponentProps {
  title: string;
  onAction?: () => void;
}

export const MyComponent: React.FC<ComponentProps> = ({
  title,
  onAction,
}) => {
  return <div>{title}</div>;
};
```

### Custom Hooks
```typescript
// useAsync hook for API calls
const { data, loading, error } = useAsync(
  () => fetchGalleries(),
  [userId]
);
```

### State Management
```typescript
// Zustand store
const useGalleryStore = create((set) => ({
  galleries: [],
  setGalleries: (galleries) => set({ galleries }),
}));
```

## Performance Best Practices

- **Code Splitting:** Lazy load pages with React.lazy()
- **Memoization:** Use React.memo() for expensive components
- **Bundle Analysis:** Use `npm run build` and analyze
- **Image Optimization:** Lazy load images with IntersectionObserver
- **Network:** Use React Query for smart caching

## Common Tasks

### Add New Page
1. Create component in `src/pages/`
2. Add route in `App.tsx`
3. Update navigation
4. Add tests

### Add New Component
1. Create in `src/components/`
2. Export from `index.ts`
3. Add TypeScript types
4. Add tests
5. Document in components guide

### Add API Call
1. Create service in `src/services/`
2. Create hook in `src/hooks/`
3. Use in component with error handling
4. Add loading state

---

For questions or issues, refer to the specific documentation files or check [Troubleshooting](./troubleshooting.md).
