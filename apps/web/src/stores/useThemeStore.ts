import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'pragma-light' | 'pragma-dark'

interface ThemeState {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'pragma-dark',
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === 'pragma-light' ? 'pragma-dark' : 'pragma-light',
        })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'pragma:theme',
    }
  )
)
