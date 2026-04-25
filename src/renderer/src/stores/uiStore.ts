import { create } from 'zustand'
import { applyTheme, saveTheme, type Theme } from '../lib/themeEngine'

interface UIStore {
  isSettingsOpen: boolean
  isGraphOpen: boolean
  isCommandPaletteOpen: boolean
  theme: Theme

  openSettings: () => void
  closeSettings: () => void
  openGraph: () => void
  closeGraph: () => void
  toggleGraph: () => void
  openCommandPalette: () => void
  closeCommandPalette: () => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const useUIStore = create<UIStore>((set, get) => ({
  isSettingsOpen: false,
  isGraphOpen: false,
  isCommandPaletteOpen: false,
  theme: 'dark',

  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  openGraph: () => set({ isGraphOpen: true }),
  closeGraph: () => set({ isGraphOpen: false }),
  toggleGraph: () => set((s) => ({ isGraphOpen: !s.isGraphOpen })),
  openCommandPalette: () => set({ isCommandPaletteOpen: true }),
  closeCommandPalette: () => set({ isCommandPaletteOpen: false }),

  setTheme: (theme) => {
    applyTheme(theme)
    saveTheme(theme)
    set({ theme })
  },

  toggleTheme: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
  },
}))
