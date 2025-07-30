import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import './index.css'
import App from './App.tsx'

// Set to false if you want to disable duplicate requests in development
const ENABLE_STRICT_MODE = false

const AppWrapper = ENABLE_STRICT_MODE ? StrictMode : ({ children }: { children: React.ReactNode }) => <>{children}</>

createRoot(document.getElementById('root')!).render(
  <AppWrapper>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </AppWrapper>,
)
