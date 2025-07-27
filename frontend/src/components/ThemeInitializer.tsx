import { useEffect } from 'react'
import { useThemeStore } from '../stores/themeStore'

/**
 * Theme initializer component that ensures theme is applied on app start
 * This should be placed early in the component tree
 */
export const ThemeInitializer = () => {
  const { theme, setHydrated, setTheme } = useThemeStore()

  useEffect(() => {
    console.log('🔧 ThemeInitializer: Initializing theme system')
    console.log('🔧 ThemeInitializer: Current theme from store:', theme)
    
    // Check if there's a saved theme in localStorage
    const savedTheme = localStorage.getItem('theme-storage')
    if (savedTheme) {
      try {
        const themeData = JSON.parse(savedTheme)
        console.log('🔧 ThemeInitializer: Found saved theme data:', themeData)
        if (themeData.state?.theme) {
          console.log('🔧 ThemeInitializer: Applying saved theme:', themeData.state.theme)
          setTheme(themeData.state.theme)
        }
      } catch (e) {
        console.log('🔧 ThemeInitializer: Error parsing saved theme, using default:', e)
      }
    }
    
    // Force theme application on mount
    console.log('🔧 ThemeInitializer: Force applying current theme:', theme)
    
    // Remove any existing theme classes first
    document.documentElement.classList.remove('dark', 'light')
    
    // Add the current theme class
    document.documentElement.classList.add(theme)
    
    console.log('🔧 ThemeInitializer: Current classList:', document.documentElement.classList.toString())
    console.log('🔧 ThemeInitializer: Has dark class:', document.documentElement.classList.contains('dark'))
    console.log('🔧 ThemeInitializer: Has light class:', document.documentElement.classList.contains('light'))
    
    // Mark as hydrated
    setHydrated(true)
    
    // Set up a periodic check to ensure theme stays applied
    const interval = setInterval(() => {
      const currentTheme = useThemeStore.getState().theme
      const hasDark = document.documentElement.classList.contains('dark')
      const hasLight = document.documentElement.classList.contains('light')
      
      console.log('🔍 Theme check - Store:', currentTheme, 'DOM dark:', hasDark, 'DOM light:', hasLight)
      
      if (currentTheme === 'dark' && !hasDark) {
        console.log('⚠️ Theme sync issue detected! Fixing...')
        document.documentElement.classList.remove('light')
        document.documentElement.classList.add('dark')
      } else if (currentTheme === 'light' && !hasLight) {
        console.log('⚠️ Theme sync issue detected! Fixing...')
        document.documentElement.classList.remove('dark')
        document.documentElement.classList.add('light')
      }
    }, 1000)
    
    return () => {
      clearInterval(interval)
    }
  }, [])

  // This component doesn't render anything
  return null
}
