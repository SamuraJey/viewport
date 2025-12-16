# Frontend Project Structure

## Overview

The frontend is organized using a feature-based and layered architecture, making it scalable and maintainable.

## Directory Structure

```
frontend/src/
├── components/              # Reusable UI components
│   ├── common/              # Shared components (Header, Footer, etc.)
│   ├── auth/                # Authentication components
│   ├── gallery/             # Gallery-related components
│   ├── upload/              # File upload components
│   ├── sharelink/           # Share link components
│   ├── lightbox/            # Image lightbox/modal components
│   ├── buttons/             # Button variants
│   ├── forms/               # Form components
│   ├── layouts/             # Layout wrappers
│   └── index.ts             # Central exports
│
├── pages/                   # Full page components (routes)
│   ├── auth/
│   │   ├── RegisterPage.tsx
│   │   ├── LoginPage.tsx
│   │   └── index.ts
│   ├── dashboard/
│   │   ├── DashboardPage.tsx
│   │   └── index.ts
│   ├── gallery/
│   │   ├── GalleryPage.tsx
│   │   ├── PublicGalleryPage.tsx
│   │   └── index.ts
│   └── index.ts
│
├── hooks/                   # Custom React hooks
│   ├── useAuth.ts           # Authentication logic
│   ├── useGalleries.ts      # Gallery queries
│   ├── usePhotos.ts         # Photo queries
│   ├── useApi.ts            # General API calls
│   ├── useAsync.ts          # Generic async handling
│   ├── useLocalStorage.ts   # LocalStorage helper
│   └── index.ts
│
├── stores/                  # Zustand state management
│   ├── authStore.ts         # User authentication state
│   ├── galleryStore.ts      # Gallery state
│   ├── notificationStore.ts # Toast notifications
│   └── index.ts
│
├── services/                # API client services
│   ├── api.ts               # Axios instance & config
│   ├── authService.ts       # Auth API calls
│   ├── galleryService.ts    # Gallery API calls
│   ├── photoService.ts      # Photo API calls
│   ├── shareLinkService.ts  # Share link API calls
│   ├── publicService.ts     # Public gallery API calls
│   └── index.ts
│
├── types/                   # TypeScript type definitions
│   ├── auth.ts              # Auth types
│   ├── gallery.ts           # Gallery types
│   ├── photo.ts             # Photo types
│   ├── sharelink.ts         # Share link types
│   ├── api.ts               # API response types
│   └── index.ts
│
├── styles/                  # Global styles
│   ├── globals.css          # Global styles
│   ├── variables.css        # CSS variables
│   ├── animations.css       # Animation definitions
│   └── tailwind.css         # Tailwind imports
│
├── utils/                   # Utility functions
│   ├── validators.ts        # Input validation
│   ├── formatters.ts        # Data formatting
│   ├── errorHandling.ts     # Error handling utilities
│   ├── localStorage.ts      # Storage utilities
│   ├── dates.ts             # Date utilities
│   └── index.ts
│
├── App.tsx                  # Main App component with routing
├── main.tsx                 # Application entry point
├── App.css                  # App-level styles
└── index.css                # Global imports
```

## Layer Architecture

### 1. **Pages Layer** (`pages/`)
Full-page components that represent routes.

**Responsibilities:**
- Represent routes and screen layouts
- Compose multiple components
- Handle page-level state
- Manage loading/error states
- Route guards and redirects

**Example:**
```typescript
// pages/dashboard/DashboardPage.tsx
import { useAuth } from "@hooks";
import { GalleryList } from "@components";

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  
  if (!user) return <Navigate to="/auth/login" />;
  
  return (
    <div className="dashboard">
      <h1>My Galleries</h1>
      <GalleryList userId={user.id} />
    </div>
  );
};
```

### 2. **Component Layer** (`components/`)
Reusable UI components built with React and TypeScript.

**Responsibilities:**
- Render UI elements
- Accept props for configuration
- Handle user interactions
- Emit events via callbacks
- Maintain component-level state if needed

**Example:**
```typescript
// components/gallery/GalleryCard.tsx
interface GalleryCardProps {
  id: string;
  createdAt: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const GalleryCard: React.FC<GalleryCardProps> = ({
  id,
  createdAt,
  onEdit,
  onDelete,
}) => {
  return (
    <div className="gallery-card">
      <h3>Gallery {id.substring(0, 8)}</h3>
      <p>{new Date(createdAt).toLocaleDateString()}</p>
      <button onClick={onEdit}>Edit</button>
      <button onClick={onDelete}>Delete</button>
    </div>
  );
};
```

### 3. **Hook Layer** (`hooks/`)
Custom React hooks for logic and data management.

**Responsibilities:**
- Encapsulate complex logic
- Manage component state
- Handle API calls
- Reuse logic across components
- Provide typed interfaces

**Example:**
```typescript
// hooks/useGalleries.ts
export const useGalleries = (userId: string) => {
  const [galleries, setGalleries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    const fetchGalleries = async () => {
      setLoading(true);
      try {
        const data = await galleryService.getGalleries(userId);
        setGalleries(data);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchGalleries();
  }, [userId]);
  
  return { galleries, loading, error };
};
```

### 4. **Store Layer** (`stores/`)
Zustand stores for global state management.

**Responsibilities:**
- Manage global application state
- Provide state access and mutations
- Persist state if needed
- Handle cross-component communication

**Example:**
```typescript
// stores/authStore.ts
import { create } from "zustand";

interface AuthStore {
  user: User | null;
  isLoggedIn: boolean;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoggedIn: false,
  setUser: (user) => set({ user, isLoggedIn: true }),
  logout: () => set({ user: null, isLoggedIn: false }),
}));
```

### 5. **Service Layer** (`services/`)
API client functions and business logic.

**Responsibilities:**
- Configure HTTP client (Axios)
- Define API endpoints
- Handle authentication
- Transform API responses
- Error handling

**Example:**
```typescript
// services/galleryService.ts
import { api } from "./api";

export const galleryService = {
  getGalleries: async (page = 1, size = 10) => {
    const response = await api.get("/galleries", {
      params: { page, size },
    });
    return response.data.galleries;
  },
  
  createGallery: async () => {
    const response = await api.post("/galleries", {});
    return response.data;
  },
};
```

### 6. **Type Layer** (`types/`)
TypeScript type definitions and interfaces.

**Responsibilities:**
- Define data structures
- Provide IDE autocomplete
- Catch type errors at compile time
- Document data shapes

**Example:**
```typescript
// types/gallery.ts
export interface Gallery {
  id: string;
  owner_id: string;
  created_at: string;
}

export interface GalleryResponse {
  galleries: Gallery[];
  total: number;
  page: number;
}
```

### 7. **Utility Layer** (`utils/`)
Helper functions for common tasks.

**Responsibilities:**
- Format data (dates, numbers, etc.)
- Validate input
- Handle errors
- Transform data
- Common algorithms

**Example:**
```typescript
// utils/validators.ts
export const validateEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const validatePassword = (password: string): boolean => {
  return password.length >= 8;
};
```

## Data Flow

### Example: Upload Photo Flow

```
User uploads file
    ↓
PhotoUploadComponent
    ↓
usePhotoUpload hook
    ↓
photoService.uploadPhoto()
    ↓
API POST /galleries/{id}/photos
    ↓
Server saves to S3
    ↓
Response with Photo metadata
    ↓
Update galleryStore
    ↓
Refresh GalleryGrid component
    ↓
Show success notification
```

## Component Organization

### Common Components (`components/common/`)
- `Header.tsx` - Top navigation
- `Footer.tsx` - Footer
- `Navbar.tsx` - Navigation bar
- `Sidebar.tsx` - Sidebar menu
- `Toast.tsx` - Notification toasts
- `Modal.tsx` - Modal dialog

### Auth Components (`components/auth/`)
- `LoginForm.tsx` - Login form
- `RegisterForm.tsx` - Registration form
- `ProtectedRoute.tsx` - Route guard

### Gallery Components (`components/gallery/`)
- `GalleryGrid.tsx` - Gallery list display
- `GalleryCard.tsx` - Individual gallery card
- `GalleryDetail.tsx` - Gallery details

### Upload Components (`components/upload/`)
- `PhotoUploader.tsx` - File upload interface
- `ProgressBar.tsx` - Upload progress
- `FileInput.tsx` - File input

### Lightbox Components (`components/lightbox/`)
- `Lightbox.tsx` - Image viewer modal
- `ImageSlider.tsx` - Image navigation

## Coding Standards

### File Naming
```
ComponentName.tsx           # React components
useCustomHook.ts            # Custom hooks
serviceName.ts              # Services
storeName.ts                # Zustand stores
typeName.ts                 # Type definitions
utilityName.ts              # Utilities
```

### Component Structure
```typescript
import React, { useState } from "react";

interface MyComponentProps {
  title: string;
  onAction?: () => void;
}

/**
 * MyComponent description
 * @component
 */
export const MyComponent: React.FC<MyComponentProps> = ({
  title,
  onAction,
}) => {
  const [state, setState] = useState(false);
  
  const handleClick = () => {
    onAction?.();
  };
  
  return (
    <div className="my-component">
      <h1>{title}</h1>
      <button onClick={handleClick}>Action</button>
    </div>
  );
};
```

### Import Organization
```typescript
// 1. React & external libraries
import React from "react";
import { useNavigate } from "react-router-dom";

// 2. Zustand stores
import { useAuthStore } from "@stores";

// 3. Custom hooks
import { useGalleries } from "@hooks";

// 4. Components
import { GalleryList } from "@components";

// 5. Types
import { Gallery } from "@types";

// 6. Services
import { galleryService } from "@services";

// 7. Utils
import { formatDate } from "@utils";

// 8. Styles
import "./MyComponent.css";
```

## Vite Configuration

### Path Aliases
```typescript
// vite.config.ts
resolve: {
  alias: {
    "@components": "/src/components",
    "@pages": "/src/pages",
    "@hooks": "/src/hooks",
    "@stores": "/src/stores",
    "@services": "/src/services",
    "@types": "/src/types",
    "@utils": "/src/utils",
  },
}
```

**Usage:**
```typescript
import { Button } from "@components";
import { useAuth } from "@hooks";
```

## Performance Tips

- **Lazy Load Pages:** Use React.lazy() for code splitting
- **Memoize Components:** Use React.memo() for pure components
- **Memoize Selectors:** Use Zustand selectors
- **Image Optimization:** Lazy load images
- **Bundle Analysis:** Use Vite analyzer

---

For specific component documentation, see [Components Guide](./components.md).  
For styling information, see [Styling Guide](./styling.md).
