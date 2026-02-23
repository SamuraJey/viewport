import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { DeferredLenis } from './components/DeferredLenis';
import { ThemeInitializer } from './components/ThemeInitializer';
import './index.css';
import App from './App.tsx';

// Set to false if you want to disable duplicate requests in development
const ENABLE_STRICT_MODE = false;

const AppWrapper = ENABLE_STRICT_MODE
  ? StrictMode
  : ({ children }: { children: ReactNode }) => <>{children}</>;

createRoot(document.getElementById('root')!).render(
  <AppWrapper>
    <DeferredLenis>
      <BrowserRouter>
        <ThemeInitializer />
        <App />
      </BrowserRouter>
    </DeferredLenis>
  </AppWrapper>,
);
