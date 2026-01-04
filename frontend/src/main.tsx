import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ReactLenis } from 'lenis/react';
import { ThemeInitializer } from './components/ThemeInitializer';
import './index.css';
import App from './App.tsx';

// Set to false if you want to disable duplicate requests in development
const ENABLE_STRICT_MODE = false;

const AppWrapper = ENABLE_STRICT_MODE
  ? StrictMode
  : ({ children }: { children: React.ReactNode }) => <>{children}</>;

createRoot(document.getElementById('root')!).render(
  <AppWrapper>
    <ReactLenis root>
      <BrowserRouter>
        <ThemeInitializer />
        <App />
      </BrowserRouter>
    </ReactLenis>
  </AppWrapper>,
);
