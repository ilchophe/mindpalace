import { create } from 'zustand'
import type { NoteMetadata } from '@shared'

export interface OpenTab {
  id: string           // same as NoteMetadata.id
  relativePath: string
  title: string
  content: string
  isDirty: boolean
}

export type ViewMode = 'edit' | 'split' | 'preview'

interface EditorStore {
  tabs: OpenTab[]
  activeTabId: string | null
  viewMode: ViewMode

  openTab: (note: NoteMetadata) => Promise<void>
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  setContent: (id: string, content: string, dirty?: boolean) => void
  setViewMode: (mode: ViewMode) => void
  saveTab: (id: string) => Promise<void>
  closeAllTabs: () => void
  /** Update tab paths after a file or folder is moved via drag & drop. */
  renameItemPath: (oldRelPath: string, newRelPath: string) => void
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  viewMode: 'split',

  openTab: async (note) => {
    const existing = get().tabs.find((t) => t.id === note.id)
    if (existing) {
      set({ activeTabId: note.id })
      return
    }
    const content = await window.api.notes.read(note.relativePath)
    set((s) => ({
      tabs: [
        ...s.tabs,
        {
          id: note.id,
          relativePath: note.relativePath,
          title: note.title,
          content,
          isDirty: false,
        },
      ],
      activeTabId: note.id,
    }))
  },

  closeTab: (id) => {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id)
      let activeTabId = s.activeTabId
      if (activeTabId === id) {
        const idx = s.tabs.findIndex((t) => t.id === id)
        activeTabId = tabs[Math.max(0, idx - 1)]?.id ?? null
      }
      return { tabs, activeTabId }
    })
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  setContent: (id, content, dirty = true) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, content, isDirty: dirty } : t)),
    }))
  },

  setViewMode: (viewMode) => set({ viewMode }),

  saveTab: async (id) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab) return
    await window.api.notes.write(tab.relativePath, tab.content)
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, isDirty: false } : t)),
    }))
  },

  closeAllTabs: () => set({ tabs: [], activeTabId: null }),

  renameItemPath: (oldRelPath, newRelPath) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.relativePath === oldRelPath) {
          return { ...t, relativePath: newRelPath, title: newRelPath.split('/').pop()?.replace(/\.md$/, '') ?? newRelPath }
        }
        if (t.relativePath.startsWith(oldRelPath + '/')) {
          const newPath = newRelPath + t.relativePath.slice(oldRelPath.length)
          return { ...t, relativePath: newPath, title: newPath.split('/').pop()?.replace(/\.md$/, '') ?? newPath }
        }
        return t
      }),
    }))
  },
}))
