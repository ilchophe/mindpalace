export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'mindpalace-theme'

export function applyTheme(theme: Theme): void {
  if (theme === 'light') {
    document.documentElement.classList.add('light')
  } else {
    document.documentElement.classList.remove('light')
  }
}

export function loadSavedTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'dark'
}

export function saveTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme)
}
