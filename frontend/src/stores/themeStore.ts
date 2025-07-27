import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  isHydrated: boolean
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setHydrated: (hydrated: boolean) => void
}

// Helper function to apply theme to DOM
const applyTheme = (theme: Theme) => {
  if (typeof window === 'undefined') return
  
  console.log('🎨 Applying theme:', theme)
  
  // Remove any existing theme classes first
  document.documentElement.classList.remove('dark', 'light')
  
  // Add the new theme class
  document.documentElement.classList.add(theme)
  
  console.log('🎨 Current classList after applying theme:', document.documentElement.classList.toString())
  console.log('🎨 Document element has dark class:', document.documentElement.classList.contains('dark'))
  console.log('🎨 Document element has light class:', document.documentElement.classList.contains('light'))
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark', // Default to dark theme
      isHydrated: false,
      setTheme: (theme: Theme) => {
        console.log('🔄 setTheme called with:', theme)
        set({ theme })
        applyTheme(theme)
      },
      toggleTheme: () => {
        const currentTheme = get().theme
        const newTheme = currentTheme === 'light' ? 'dark' : 'light'
        console.log('🔄 toggleTheme called - current:', currentTheme, '-> new:', newTheme)
        get().setTheme(newTheme)
      },
      setHydrated: (hydrated: boolean) => {
        console.log('💧 Setting hydrated to:', hydrated)
        set({ isHydrated: hydrated })
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        console.log('💧 onRehydrateStorage called with state:', state)
        
        if (state) {
          console.log('💧 Applying rehydrated theme:', state.theme)
          applyTheme(state.theme)
        } else {
          console.log('💧 No stored state, applying default dark theme')
          applyTheme('dark')
        }
      },
    }
  )
)

// Apply default theme immediately for initial load
if (typeof window !== 'undefined') {
  console.log('🚀 Applying default dark theme immediately on module load')
  applyTheme('dark')
}
